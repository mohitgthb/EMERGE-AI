"""
Accident Detection Model API Server

FastAPI server that provides REST endpoints for accident detection.
Integrates YOLO object detection, tracking, and CNN verification.

Backend-Orchestrated Endpoints (ACTIVE):
- POST /detect/camera - Process camera stream (backend provides camera info)
- POST /detect/video - Process uploaded video file (backend uploads video)
- GET /health - Health check

Other endpoints are commented out. Uncomment if needed for testing.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import cv2
import numpy as np
import base64
import time
import uuid
from pathlib import Path
from io import BytesIO
from datetime import datetime
import asyncio
import tempfile
import os
from concurrent.futures import ThreadPoolExecutor
import requests
import subprocess
import json
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

from ultralytics import YOLO
from accident_logic import is_accident
from clip_writer import add_frame, save_clip, buffer

# Try to import CNN verifier (TFLite version)
CNN_AVAILABLE = False
AccidentDecisionFusion = None
try:
    from cnn_verifier import CNNAccidentVerifier, AccidentDecisionFusion
    CNN_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ CNN Verifier not available - YOLO-only mode: {e}")

# Lifespan event handler (replaces deprecated on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Loading models...")
    
    # Create accidents directory
    Path("accidents").mkdir(exist_ok=True)
    
    try:
        STATE.yolo_model = YOLO(MODEL_PATH)
        print(f"✅ YOLO model loaded: {MODEL_PATH}")
    except Exception as e:
        print(f"❌ Failed to load YOLO model: {e}")
        raise
    
    if CONFIG.enable_cnn_verification and CNN_AVAILABLE:
        try:
            STATE.cnn_verifier = CNNAccidentVerifier(
                model_path=CNN_MODEL_PATH,
                input_size=None,  # Auto-detect from model (250x250 current, 640x640 recommended)
                confidence_threshold=CONFIG.cnn_confidence_threshold,
                num_verification_frames=5
            )
            print(f"✅ CNN verifier (TFLite) loaded: {CNN_MODEL_PATH}")
        except Exception as e:
            print(f"⚠️ CNN verifier failed to load: {e}")
            import traceback
            traceback.print_exc()
            CONFIG.enable_cnn_verification = False
    
    print("✅ API Server ready")
    
    yield
    
    # Shutdown
    if STATE.webcam and STATE.webcam_active:
        STATE.webcam.release()
        print("🛑 Webcam released")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="EMERGE AI - Accident Detection API",
    description="Real-time accident detection using YOLO and CNN verification",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for backend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this based on your backend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
MODEL_PATH = str(PROJECT_ROOT / "yolov8s.pt")
CNN_MODEL_PATH = str(PROJECT_ROOT / "models" / "tf_lite_model.tflite")

# Detection parameters
class DetectionConfig(BaseModel):
    enable_cnn_verification: bool = True
    cnn_confidence_threshold: float = 0.7  # Increased from 0.65 for stricter CNN filtering
    yolo_confidence: float = 0.4
    fusion_method: str = "weighted"
    final_confidence_threshold: float = 0.7  # Increased from 0.65 to reduce false positives
    accident_cooldown: int = 30  # Increased from 5 to prevent duplicate detections
    stopped_time_threshold: float = 4.0  # Increased from 2.5 - vehicle must stop longer
    speed_threshold: float = 1.0
    backend_url: str = "http://localhost:5000"  # Backend API URL
    auto_notify_backend: bool = True  # Automatically notify backend on detection

# Global configuration
CONFIG = DetectionConfig()

# Detection state management
class DetectionState:
    """Global state for detection system"""
    def __init__(self):
        self.yolo_model = None
        self.cnn_verifier = None
        self.webcam = None
        self.webcam_active = False
        self.webcam_detection_active = False
        self.prev_centers = {}
        self.stop_start_time = {}
        self.last_accident_time = 0
        self.accident_count = 0
        self.accident_history = []
    
    def reset_tracking(self):
        """Reset tracking data"""
        self.prev_centers = {}
        self.stop_start_time = {}

# Request/Response Models
class DetectionResult(BaseModel):
    accident_detected: bool
    confidence: float
    severity: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    clip_path: Optional[str] = None
    accident_id: Optional[str] = None
    timestamp: str
    vehicles: List[Dict[str, Any]] = []
    verification_method: str = "yolo"
    frame_analyzed: bool = True
    metadata: Optional[Dict[str, Any]] = None

class VideoStreamRequest(BaseModel):
    stream_url: str
    duration_seconds: Optional[int] = 60
    fps: int = 10

class FrameRequest(BaseModel):
    frame_base64: str  # Base64 encoded image
    camera_id: Optional[str] = "UNKNOWN"
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class CameraDetectionRequest(BaseModel):
    camera_id: str
    latitude: float
    longitude: float
    stream_url: Optional[str] = None
    video_path: Optional[str] = None
    stream_type: str = "RTSP"
    duration_seconds: Optional[int] = None

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    cnn_available: bool
    timestamp: str
  
STATE = DetectionState()

# Thread pool for CPU-intensive tasks
executor = ThreadPoolExecutor(max_workers=4)


# Helper functions
def get_center(box):
    """Calculate center point of bounding box"""
    x1, y1, x2, y2 = box
    return int((x1 + x2) / 2), int((y1 + y2) / 2)


def get_speed(track_id, center):
    """Calculate movement speed of tracked vehicle"""
    if track_id not in STATE.prev_centers:
        STATE.prev_centers[track_id] = center
        return 0
    
    px, py = STATE.prev_centers[track_id]
    cx, cy = center
    STATE.prev_centers[track_id] = center
    
    return np.sqrt((cx - px) ** 2 + (cy - py) ** 2)


def get_stopped_time(track_id, speed):
    """Calculate how long a vehicle has been stopped"""
    now = time.time()
    if speed < 2:  # Match live_cctv.py logic exactly
        if track_id not in STATE.stop_start_time:
            STATE.stop_start_time[track_id] = now
        return now - STATE.stop_start_time[track_id]
    else:
        STATE.stop_start_time.pop(track_id, None)
        return 0


def decode_frame(base64_string: str) -> np.ndarray:
    """Decode base64 string to OpenCV frame"""
    try:
        # Remove header if present
        if "," in base64_string:
            base64_string = base64_string.split(",")[1]
        
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            raise ValueError("Failed to decode frame")
        
        return frame
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid frame data: {str(e)}")


def encode_frame(frame: np.ndarray) -> str:
    """Encode OpenCV frame to base64 string"""
    _, buffer = cv2.imencode('.jpg', frame)
    return base64.b64encode(buffer).decode('utf-8')


def notify_backend(accident_data: dict) -> bool:
    """Notify the Node.js backend about accident detection"""
    if not CONFIG.auto_notify_backend:
        print("⚠️ Backend notification disabled (auto_notify_backend=False)", flush=True)
        return False
    
    try:
        backend_endpoint = f"{CONFIG.backend_url}/api/ai/ai-callback"
        
        print(f"\n🔔 Notifying backend at {backend_endpoint}...", flush=True)
        print(f"   Data: {json.dumps(accident_data, indent=2)}", flush=True)
        
        response = requests.post(
            backend_endpoint,
            json=accident_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"   Response status: {response.status_code}", flush=True)
        
        if response.status_code in [200, 201]:
            try:
                result = response.json()
                print(f"✅ Backend notified successfully: {result.get('message', 'OK')}", flush=True)
                if 'dispatch' in result and result['dispatch']:
                    print(f"🚑 Ambulance dispatched: {result['dispatch'].get('ambulanceId', 'N/A')}", flush=True)
                if 'accident' in result and result['accident']:
                    print(f"📋 Accident ID in DB: {result['accident'].get('id', 'N/A')}", flush=True)
                return True
            except Exception as parse_err:
                print(f"✅ Backend notified (status {response.status_code}) but couldn't parse response: {parse_err}", flush=True)
                print(f"   Response text: {response.text}", flush=True)
                return True
        else:
            print(f"⚠️ Backend returned {response.status_code}: {response.text}", flush=True)
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"❌ Backend not reachable at {CONFIG.backend_url}", flush=True)
        print("   Make sure backend server is running: cd backend && npm start", flush=True)
        return False
    except requests.exceptions.Timeout:
        print(f"❌ Backend request timeout (>10s)", flush=True)
        return False
    except Exception as e:
        print(f"❌ Backend notification failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False


def calculate_severity(confidence: float, stopped_time: float = 0, speed: float = 0) -> str:
    """Calculate accident severity based on detection parameters"""
    if confidence >= 0.85 or stopped_time >= 5.0:
        return "HIGH"
    elif confidence >= 0.65 or stopped_time >= 3.0:
        return "MEDIUM"
    else:
        return "LOW"


def get_location_from_ip(client_ip: str = None) -> tuple:
    """Get latitude and longitude from IP address using ipapi.co"""
    try:
        if not client_ip or client_ip in ["127.0.0.1", "localhost"]:
            # Use external IP for localhost
            response = requests.get("https://ipapi.co/json/", timeout=3)
        else:
            response = requests.get(f"https://ipapi.co/{client_ip}/json/", timeout=3)
        
        if response.status_code == 200:
            data = response.json()
            lat = data.get('latitude')
            lon = data.get('longitude')
            if lat and lon:
                print(f"📍 Auto-detected location from IP: {lat}, {lon} ({data.get('city')}, {data.get('country_name')})")
                return float(lat), float(lon)
    except Exception as e:
        print(f"⚠️ IP geolocation failed: {e}")
    return None, None


def get_gps_from_video(video_path: str) -> tuple:
    """Extract GPS coordinates from video metadata using ffprobe"""
    try:
        # Try ffprobe first (part of ffmpeg)
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            tags = data.get('format', {}).get('tags', {})
            
            # Check for common GPS tag formats
            lat_keys = ['location-lat', 'com.apple.quicktime.location.ISO6709', 'latitude']
            lon_keys = ['location-lon', 'longitude']
            
            lat, lon = None, None
            
            # Parse ISO 6709 format if present
            iso_location = tags.get('com.apple.quicktime.location.ISO6709', '')
            if iso_location:
                # Format: +37.5090-122.4914/
                import re
                match = re.match(r'([+-]\d+\.\d+)([+-]\d+\.\d+)', iso_location)
                if match:
                    lat, lon = float(match.group(1)), float(match.group(2))
            
            # Try direct keys
            if not lat:
                for key in lat_keys:
                    if key in tags:
                        try:
                            lat = float(tags[key])
                            break
                        except:
                            pass
            
            if not lon:
                for key in lon_keys:
                    if key in tags:
                        try:
                            lon = float(tags[key])
                            break
                        except:
                            pass
            
            if lat and lon:
                print(f"📍 Auto-detected location from video metadata: {lat}, {lon}")
                return lat, lon
    except FileNotFoundError:
        print("⚠️ ffprobe not found. Install ffmpeg for video metadata extraction.")
    except Exception as e:
        print(f"⚠️ Video GPS extraction failed: {e}")
    
    return None, None


def get_gps_from_image(image_data: bytes) -> tuple:
    """Extract GPS coordinates from image EXIF data"""
    try:
        image = Image.open(BytesIO(image_data))
        exif_data = image._getexif()
        
        if not exif_data:
            return None, None
        
        # Find GPS Info
        gps_info = {}
        for tag, value in exif_data.items():
            tag_name = TAGS.get(tag, tag)
            if tag_name == 'GPSInfo':
                for gps_tag in value:
                    gps_tag_name = GPSTAGS.get(gps_tag, gps_tag)
                    gps_info[gps_tag_name] = value[gps_tag]
        
        if not gps_info:
            return None, None
        
        # Convert GPS data to decimal degrees
        def convert_to_degrees(value):
            d, m, s = value
            return d + (m / 60.0) + (s / 3600.0)
        
        lat = convert_to_degrees(gps_info.get('GPSLatitude'))
        lon = convert_to_degrees(gps_info.get('GPSLongitude'))
        
        # Check for N/S and E/W
        if gps_info.get('GPSLatitudeRef') == 'S':
            lat = -lat
        if gps_info.get('GPSLongitudeRef') == 'W':
            lon = -lon
        
        print(f"📍 Auto-detected location from image EXIF: {lat}, {lon}")
        return lat, lon
        
    except Exception as e:
        print(f"⚠️ Image EXIF extraction failed: {e}")
    
    return None, None


async def process_frame_async(frame: np.ndarray) -> tuple:
    """Process a single frame through the detection pipeline"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, process_frame, frame)


def process_frame(frame: np.ndarray) -> tuple:
    """
    Core detection logic for a single frame
    Returns: (accident_detected, vehicles_data, confidence, method)
    """
    if STATE.yolo_model is None:
        raise HTTPException(status_code=500, detail="YOLO model not loaded")
    
    # Run YOLO tracking
    results = STATE.yolo_model.track(
        frame, 
        tracker="bytetrack.yaml", 
        persist=True, 
        conf=CONFIG.yolo_confidence
    )
    
    vehicles = []
    accident_detected = False
    accident_confidence = 0.0
    verification_method = "none"
    
    # Process detected vehicles
    if results[0].boxes.id is not None:
        for box, cls, track_id in zip(
            results[0].boxes.xyxy, 
            results[0].boxes.cls, 
            results[0].boxes.id
        ):
            cls = int(cls)
            track_id = int(track_id)
            
            # Filter vehicle classes (car, motorcycle, truck, bus)
            if cls in [2, 3, 5, 7]:
                x1, y1, x2, y2 = map(int, box.tolist())
                center = get_center((x1, y1, x2, y2))
                speed = get_speed(track_id, center)
                stopped_time = get_stopped_time(track_id, speed)
                
                vehicle_data = {
                    "id": track_id,
                    "class": cls,
                    "bounding_box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    "center": {"x": center[0], "y": center[1]},
                    "speed": round(speed, 2),
                    "stopped_time": round(stopped_time, 2)
                }
                
                vehicles.append(vehicle_data)
                
                # Check for accident conditions
                if is_accident({
                    "stopped_time": stopped_time,
                    "speed": speed
                }):
                    current_time = time.time()
                    
                    # Check cooldown
                    if current_time - STATE.last_accident_time > CONFIG.accident_cooldown:
                        accident_detected = True
                        verification_method = "yolo"
                        
                        # CNN Verification if enabled
                        if CONFIG.enable_cnn_verification and STATE.cnn_verifier:
                            try:
                                # Extract ROI for CNN verification
                                roi = frame[y1:y2, x1:x2]
                                if roi.size > 0:
                                    # Simple verification with single frame
                                    preprocessed = STATE.cnn_verifier.preprocess_frame(roi)
                                    cnn_confidence = STATE.cnn_verifier.run_inference(preprocessed)
                                    
                                    # Fusion decision
                                    yolo_confidence = AccidentDecisionFusion.compute_yolo_confidence(
                                        {"stopped_time": stopped_time, "speed": speed}
                                    )
                                    
                                    decision = AccidentDecisionFusion.make_decision(
                                        yolo_confidence=yolo_confidence,
                                        cnn_confidence=cnn_confidence,
                                        fusion_method=CONFIG.fusion_method,
                                        final_threshold=CONFIG.final_confidence_threshold
                                    )
                                    
                                    accident_detected = decision['confirmed']
                                    accident_confidence = decision['final_confidence']
                                    verification_method = "yolo+cnn"
                                else:
                                    accident_confidence = 0.7  # Default YOLO confidence
                            except Exception as e:
                                print(f"⚠️ CNN verification error: {e}")
                                accident_confidence = 0.7
                                verification_method = "yolo"
                        else:
                            accident_confidence = 0.7  # Default YOLO confidence
                        
                        if accident_detected:
                            STATE.last_accident_time = current_time
                            STATE.accident_count += 1
    
    return accident_detected, vehicles, accident_confidence, verification_method, results[0]


# API Endpoints

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "EMERGE AI - Accident Detection API (Backend-Orchestrated Mode)",
        "version": "1.0.0",
        "mode": "backend-orchestrated",
        "endpoints": {
            "health": "/health",
            "detect_camera": "/detect/camera (POST)",
            "detect_video": "/detect/video (POST)"
        },
        "note": "Other endpoints are commented out. Backend manages cameras and video sources."
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if STATE.yolo_model is not None else "unhealthy",
        model_loaded=STATE.yolo_model is not None,
        cnn_available=STATE.cnn_verifier is not None,
        timestamp=datetime.now().isoformat()
    )


# COMMENTED OUT - Not needed for backend-orchestrated flow
# @app.get("/status")
# async def get_status():
#     """Get current detection status and statistics"""
#     return {
#         "status": "running",
#         "total_accidents_detected": STATE.accident_count,
#         "last_accident_time": STATE.last_accident_time if STATE.last_accident_time > 0 else None,
#         "active_tracks": len(STATE.prev_centers),
#         "config": CONFIG.dict(),
#         "models": {
#             "yolo": STATE.yolo_model is not None,
#             "cnn": STATE.cnn_verifier is not None
#         }
#     }


# COMMENTED OUT - Not needed for backend-orchestrated flow
# @app.get("/config")
# async def get_config():
#     """Get current configuration"""
#     return CONFIG.dict()


# @app.post("/config")
# async def update_config(config: DetectionConfig):
#     """Update detection configuration"""
#     global CONFIG
#     CONFIG = config
#     return {
#         "status": "updated",
#         "config": CONFIG.dict()
#     }

# COMMENTED OUT - Not needed for backend-orchestrated flow
# Backend provides frames as part of video/camera processing
# @app.post("/detect/frame", response_model=DetectionResult)
# async def detect_frame(request: FrameRequest):
#     """
#     Detect accidents in a single frame with automatic location detection
#     
#     Args:
#         request: FrameRequest with base64 encoded frame
#         
#     Returns:
#         DetectionResult with accident detection information
#     """
#     try:
#         # Decode frame
#         frame = decode_frame(request.frame_base64)
#         
#         # Auto-detect location if not provided
#         latitude = request.latitude
#         longitude = request.longitude
#         
#         if latitude is None or longitude is None:
#             # Try to extract from image EXIF data
#             try:
#                 image_bytes = base64.b64decode(request.frame_base64.split(',')[-1])
#                 lat_exif, lon_exif = get_gps_from_image(image_bytes)
#                 if lat_exif and lon_exif:
#                     latitude, longitude = lat_exif, lon_exif
#             except:
#                 pass
#             
#             # Fallback to IP geolocation if still not found
#             if latitude is None or longitude is None:
#                 lat_ip, lon_ip = get_location_from_ip()
#                 if lat_ip and lon_ip:
#                     latitude, longitude = lat_ip, lon_ip
#         
#         # Process frame
#         accident_detected, vehicles, confidence, method, yolo_result = await process_frame_async(frame)
#         
#         # Generate accident ID and clip if detected
#         accident_id = None
#         clip_path = None
#         severity = None
#         
#         if accident_detected:
#             accident_id = f"ACC_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
#             
#             # Calculate severity from vehicles data
#             max_stopped_time = max([v.get('stopped_time', 0) for v in vehicles], default=0)
#             severity = calculate_severity(confidence, max_stopped_time)
#             
#             # Save frame as clip
#             clip_filename = f"accident_{accident_id}.jpg"
#             clip_path = str(Path("accidents") / clip_filename)
#             cv2.imwrite(clip_path, frame)
#             
#             STATE.accident_history.append({
#                 "id": accident_id,
#                 "timestamp": datetime.now().isoformat(),
#                 "confidence": confidence,
#                 "severity": severity,
#                 "camera_id": request.camera_id,
#                 "location": request.location,
#                 "latitude": latitude,
#                 "longitude": longitude,
#                 "clip_path": clip_path
#             })
#             
#             # Notify backend immediately
#             notify_backend({
#                 "accident_detected": True,
#                 "confidence": float(confidence),
#                 "severity": severity,
#                 "latitude": latitude,
#                 "longitude": longitude,
#                 "clip_path": clip_path,
#                 "accident_id": accident_id,
#                 "camera_id": request.camera_id,
#                 "detection_source": "frame"
#             })
#         
#         return DetectionResult(
#             accident_detected=accident_detected,
#             confidence=round(confidence, 3),
#             severity=severity,
#             latitude=latitude,
#             longitude=longitude,
#             clip_path=clip_path,
#             accident_id=accident_id,
#             timestamp=datetime.now().isoformat(),
#             vehicles=vehicles,
#             verification_method=method,
#             frame_analyzed=True,
#             metadata={
#                 "camera_id": request.camera_id,
#                 "location": request.location,
#                 "frame_shape": frame.shape[:2],
#                 "location_source": "provided" if request.latitude else ("exif" if latitude else "ip")
#             }
#         )
#     
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


# COMMENTED OUT - Documentation endpoint not needed
# @app.get("/detect/video")
# async def detect_video_info():
#     """Get information about the video detection endpoint"""
#     return {
#         "endpoint": "/detect/video",
#         "method": "POST",
#         "description": "Process uploaded video file for accident detection with automatic location detection",
#         "content_type": "multipart/form-data",
#         "features": [
#             "Automatic GPS extraction from video metadata",
#             "IP-based geolocation fallback",
#             "Severity calculation (HIGH/MEDIUM/LOW)",
#             "Accident clip saving"
#         ],
#         "parameters": {
#             "file": "Video file (required)",
#             "latitude": "Latitude coordinate (optional, auto-detected if not provided)",
#             "longitude": "Longitude coordinate (optional, auto-detected if not provided)",
#             "camera_id": "Camera identifier (optional, string, default: VIDEO_UPLOAD)"
#         },
#         "location_detection": {
#             "priority_1": "Provided latitude/longitude parameters",
#             "priority_2": "GPS metadata from video file (MP4/MOV)",
#             "priority_3": "IP-based geolocation (fallback)"
#         },
#         "response_format": {
#             "accident_detected": "boolean",
#             "confidence": "float (0.0-1.0)",
#             "severity": "string (HIGH/MEDIUM/LOW)",
#             "latitude": "float (auto-detected or provided)",
#             "longitude": "float (auto-detected or provided)",
#             "clip_path": "string (path to saved video)",
#             "accident_id": "string (unique identifier)"
#         },
#         "example_curl": 'curl -X POST "http://localhost:8000/detect/video?latitude=28.6139&longitude=77.2090" -F "file=@video.mp4"',
#         "example_curl_auto": 'curl -X POST "http://localhost:8000/detect/video" -F "file=@video.mp4"  # Auto-detects location',
#         "example_python": """
# import requests
# # With explicit location
# with open('video.mp4', 'rb') as f:
#     files = {'file': f}
#     params = {'latitude': 28.6139, 'longitude': 77.2090, 'camera_id': 'CAM-001'}
#     response = requests.post('http://localhost:8000/detect/video', files=files, params=params)
#     print(response.json())
# 
# # With automatic location detection
# with open('video.mp4', 'rb') as f:
#     files = {'file': f}
#     response = requests.post('http://localhost:8000/detect/video', files=files)
#     print(response.json())  # Location auto-detected from video metadata or IP
#         """.strip(),
#         "docs": "http://localhost:8000/docs#/default/detect_video_detect_video_post"
#     }


@app.post("/detect/camera")
async def detect_from_camera(request: CameraDetectionRequest):
    """
    Process video from a registered camera (called by backend)
    Backend provides camera info including location and video source
    
    Args:
        request: Camera detection request with camera_id, location, and video source
        
    Returns:
        Detection results (automatically sent to backend callback)
    """
    try:
        print(f"\n📹 Processing camera: {request.camera_id}")
        print(f"   Location: {request.latitude}, {request.longitude}")
        print(f"   Stream type: {request.stream_type}")
        
        video_source = None
        
        # Determine video source
        if request.stream_url:
            video_source = request.stream_url
            print(f"   Source: {request.stream_url}")
        elif request.video_path:
            video_source = request.video_path
            print(f"   Source: {request.video_path}")
        else:
            raise HTTPException(status_code=400, detail="No video source provided")
        
        # Open video source
        cap = cv2.VideoCapture(video_source)
        
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail=f"Failed to open video source: {video_source}")
        
        FPS = int(cap.get(cv2.CAP_PROP_FPS)) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Apply duration limit for all stream types if specified
        if request.duration_seconds:
            duration_frames = FPS * request.duration_seconds
            if request.stream_type == "RTSP" or request.stream_type == "WEBCAM":
                # For live streams, use duration as total frames
                total_frames = duration_frames
            else:
                # For files, use minimum of duration and actual video length
                total_frames = min(total_frames, duration_frames) if total_frames > 0 else duration_frames
        
        print(f"   FPS: {FPS}, Estimated frames: {total_frames}")
        
        # Reset tracking state
        STATE.reset_tracking()
        STATE.last_accident_time = 0
        
        accidents = []
        accident_count = 0
        frame_count = 0
        accident_triggered = False
        
        from clip_writer import add_frame as clip_add_frame, save_clip as clip_save, buffer as clip_buffer
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                frame_count += 1
                
                # Process frame with YOLO
                results = STATE.yolo_model.track(frame, persist=True, verbose=False, conf=CONFIG.yolo_confidence)
                
                if results and len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes
                    
                    for i, box in enumerate(boxes):
                        if box.id is None:
                            continue
                        
                        track_id = int(box.id[0])
                        cls = int(box.cls[0])
                        
                        # Only process vehicles
                        if cls not in [2, 3, 5, 7]:  # car, motorcycle, bus, truck
                            continue
                        
                        center = get_center(box.xyxy[0].cpu().numpy())
                        speed = get_speed(track_id, center)
                        stopped_time = get_stopped_time(track_id, speed)
                        
                        # Check accident conditions
                        if stopped_time > CONFIG.stopped_time_threshold:
                            current_time = time.time()
                            
                            if current_time - STATE.last_accident_time > CONFIG.accident_cooldown:
                                # Initial detection by YOLO
                                accident_detected = True
                                accident_confidence = 0.7  # Default YOLO confidence
                                verification_method = "yolo"
                                
                                # CNN Verification if enabled
                                if CONFIG.enable_cnn_verification and STATE.cnn_verifier:
                                    try:
                                        print(f"   🔍 Running CNN verification for vehicle #{track_id}...")
                                        # Extract ROI for CNN verification
                                        x1, y1, x2, y2 = [int(coord) for coord in box.xyxy[0].cpu().numpy()]
                                        roi = frame[y1:y2, x1:x2]
                                        
                                        if roi.size > 0:
                                            # Preprocess and run CNN inference
                                            preprocessed = STATE.cnn_verifier.preprocess_frame(roi)
                                            cnn_confidence = STATE.cnn_verifier.run_inference(preprocessed)
                                            
                                            # Fusion decision
                                            if AccidentDecisionFusion:
                                                yolo_confidence = AccidentDecisionFusion.compute_yolo_confidence(
                                                    {"stopped_time": stopped_time, "speed": speed}
                                                )
                                                
                                                decision = AccidentDecisionFusion.make_decision(
                                                    yolo_confidence=yolo_confidence,
                                                    cnn_confidence=cnn_confidence,
                                                    fusion_method=CONFIG.fusion_method,
                                                    final_threshold=CONFIG.final_confidence_threshold
                                                )
                                                
                                                accident_detected = decision['confirmed']
                                                accident_confidence = decision['final_confidence']
                                                verification_method = "yolo+cnn"
                                                
                                                print(f"   📊 YOLO: {yolo_confidence:.2f}, CNN: {cnn_confidence:.2f}, Final: {accident_confidence:.2f}")
                                                print(f"   {'✅ CONFIRMED' if accident_detected else '❌ REJECTED'} by CNN")
                                            else:
                                                # Simple threshold if fusion not available
                                                print(f"   📊 CNN confidence: {cnn_confidence:.2f} (threshold: {CONFIG.cnn_confidence_threshold})")
                                                if cnn_confidence > CONFIG.cnn_confidence_threshold:
                                                    accident_confidence = (0.7 + cnn_confidence) / 2
                                                    verification_method = "yolo+cnn"
                                                    print(f"   ✅ CONFIRMED by CNN")
                                                else:
                                                    accident_detected = False
                                                    print(f"   ❌ REJECTED by CNN")
                                        else:
                                            print(f"   ⚠️ Invalid ROI for CNN verification")
                                    except Exception as e:
                                        print(f"   ⚠️ CNN verification error: {e}")
                                        import traceback
                                        traceback.print_exc()
                                        # Reject on CNN error to be safe
                                        accident_detected = False
                                        verification_method = "cnn_error"
                                elif CONFIG.enable_cnn_verification and not STATE.cnn_verifier:
                                    print(f"   ⚠️ CNN verification enabled but CNN model not loaded! Using YOLO-only.")
                                    verification_method = "yolo_only"
                                else:
                                    print(f"   ℹ️ CNN verification disabled, using YOLO-only")
                                    verification_method = "yolo_only"
                                
                                # Only proceed if accident is confirmed
                                if not accident_detected:
                                    continue
                                
                                accident_count += 1
                                STATE.last_accident_time = current_time
                                
                                print(f"\n🚨 ACCIDENT CONFIRMED (Camera: {request.camera_id})")
                                print(f"   Vehicle #{track_id} stopped for {stopped_time:.1f}s")
                                print(f"   Verification: {verification_method}")
                                print(f"   Confidence: {accident_confidence:.2f}")
                                
                                # Save clip
                                filename = f"accident_camera_{request.camera_id}_{accident_count:03d}_{int(current_time)}.mp4"
                                clip_path = Path("accidents") / filename
                                
                                post_frames = []
                                for _ in range(min(30, FPS)):
                                    ret, pf = cap.read()
                                    if ret:
                                        post_frames.append(pf)
                                    else:
                                        break
                                
                                clip_save(post_frames, str(clip_path))
                                
                                # Calculate severity based on confidence and stopped time
                                if accident_confidence > 0.8 and stopped_time > 5:
                                    severity = "HIGH"
                                elif accident_confidence > 0.6 or stopped_time > 3:
                                    severity = "MEDIUM"
                                else:
                                    severity = "LOW"
                                
                                accident_data = {
                                    "accident_detected": True,
                                    "confidence": round(accident_confidence, 3),
                                    "severity": severity,
                                    "latitude": request.latitude,
                                    "longitude": request.longitude,
                                    "clip_path": str(clip_path),
                                    "accident_id": f"ACC_{request.camera_id}_{int(current_time)}",
                                    "camera_id": request.camera_id,
                                    "detection_source": "camera_stream",
                                    "verification_method": verification_method,
                                    "vehicle_id": track_id,
                                    "stopped_time": round(stopped_time, 2)
                                }
                                
                                accidents.append(accident_data)
                                
                                # Notify backend
                                if CONFIG.auto_notify_backend:
                                    try:
                                        notify_backend(accident_data)
                                    except Exception as e:
                                        print(f"⚠️ Backend notification failed: {e}")
                
                # Add frame to buffer for clip writing
                clip_add_frame(frame)
                
                # Break conditions for live streams
                if request.duration_seconds and frame_count >= total_frames:
                    print(f"   Reached duration limit ({request.duration_seconds}s)")
                    break
        
        finally:
            cap.release()
        
        print(f"\n✅ Camera processing complete")
        print(f"   Frames processed: {frame_count}")
        print(f"   Accidents detected: {accident_count}")
        
        return {
            "status": "completed",
            "camera_id": request.camera_id,
            "frames_processed": frame_count,
            "accidents_detected": accident_count,
            "accidents": accidents
        }
        
    except Exception as e:
        print(f"❌ Error processing camera: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/detect/video")
async def detect_video(
    file: UploadFile = File(...),
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    camera_id: Optional[str] = "VIDEO_UPLOAD"
):
    """
    Process uploaded video file for accident detection using live_cctv.py logic
    
    Args:
        file: Video file upload
        
    Returns:
        Detection results with accident clips saved
    """
    try:
        print(f"\n🎬 Processing video: {file.filename}")
        
        # Read uploaded file
        contents = await file.read()
        
        # Save to temporary file
        temp_fd, temp_path = tempfile.mkstemp(suffix=".mp4")
        try:
            os.write(temp_fd, contents)
        finally:
            os.close(temp_fd)
        
        # Auto-detect location if not provided
        if latitude is None or longitude is None:
            print("🔍 Auto-detecting location...")
            
            # Try to extract GPS from video metadata
            lat_video, lon_video = get_gps_from_video(temp_path)
            if lat_video and lon_video:
                latitude, longitude = lat_video, lon_video
            else:
                # Fallback to IP geolocation
                lat_ip, lon_ip = get_location_from_ip()
                if lat_ip and lon_ip:
                    latitude, longitude = lat_ip, lon_ip
                    print("📍 Using IP-based location as fallback")
        
        # Reset tracking state (same as live_cctv.py)
        STATE.reset_tracking()
        STATE.last_accident_time = 0
        accident_triggered = False
        accident_count = 0
        
        # Open video
        cap = cv2.VideoCapture(temp_path)
        accidents = []
        frame_count = 0
        
        print(f"📹 Starting accident detection...")
        
        # Main detection loop (same as live_cctv.py)
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            
            # Add frame to buffer (same as live_cctv.py)
            add_frame(frame)
            
            # Run YOLO tracking (same as live_cctv.py)
            results = STATE.yolo_model.track(frame, tracker="bytetrack.yaml", persist=True, conf=0.4)
            
            vehicles = []
            
            if results[0].boxes.id is not None:
                for box, cls, track_id in zip(results[0].boxes.xyxy, results[0].boxes.cls, results[0].boxes.id):
                    cls = int(cls)
                    track_id = int(track_id)
                    
                    if cls in [2, 3, 5, 7]:  # Vehicle classes
                        x1, y1, x2, y2 = map(int, box.tolist())
                        center = get_center((x1, y1, x2, y2))
                        speed = get_speed(track_id, center)
                        stopped_time = get_stopped_time(track_id, speed)
                        
                        vehicles.append({
                            "id": track_id,
                            "box": (x1, y1, x2, y2),
                            "speed": speed,
                            "stopped_time": stopped_time
                        })
            
            # Check cooldown (same as live_cctv.py)
            current_time = time.time()
            if accident_triggered and (current_time - STATE.last_accident_time) > CONFIG.accident_cooldown:
                accident_triggered = False
                print("✅ Cooldown complete")
            
            # Check each vehicle for accident (same as live_cctv.py)
            for vehicle in vehicles:
                if is_accident(vehicle):
                    if accident_triggered:
                        # Skip detection due to cooldown
                        remaining_cooldown = CONFIG.accident_cooldown - (current_time - STATE.last_accident_time)
                        if remaining_cooldown > 0:
                            print(f"⏳ Accident candidate skipped (cooldown: {remaining_cooldown:.1f}s remaining) - Vehicle {vehicle['id']}")
                        continue
                    
                    print(f"\n🔔 CANDIDATE ACCIDENT - Vehicle {vehicle['id']} (stopped: {vehicle['stopped_time']:.1f}s, speed: {vehicle['speed']:.1f})")
                    
                    # Collect post-event frames (same as live_cctv.py)
                    post_frames = []
                    FPS = 10
                    POST_EVENT_SECONDS = 5
                    
                    for _ in range(FPS * POST_EVENT_SECONDS):
                        ret, f = cap.read()
                        if ret:
                            frame_count += 1  # Count post-event frames
                            add_frame(f)
                            post_frames.append(f)
                        else:
                            break
                    
                    accident_confirmed = False
                    
                    # CNN Verification (same as live_cctv.py)
                    if CONFIG.enable_cnn_verification and STATE.cnn_verifier and AccidentDecisionFusion:
                        print("🔬 CNN verification...")
                        try:
                            verification_result = STATE.cnn_verifier.verify_accident(
                                frame_buffer=buffer,
                                post_event_frames=post_frames,
                                fps=FPS,
                                aggregation_method="weighted_average",
                                verbose=True
                            )
                            
                            yolo_confidence = AccidentDecisionFusion.compute_yolo_confidence(vehicle)
                            
                            decision = AccidentDecisionFusion.make_decision(
                                yolo_confidence=yolo_confidence,
                                cnn_confidence=verification_result['cnn_confidence'],
                                fusion_method=CONFIG.fusion_method,
                                final_threshold=CONFIG.final_confidence_threshold,
                                verbose=True
                            )
                            
                            accident_confirmed = decision['confirmed']
                            
                        except Exception as e:
                            print(f"⚠️ CNN error: {e} - Falling back to YOLO")
                            import traceback
                            traceback.print_exc()
                            accident_confirmed = True
                    else:
                        accident_confirmed = True
                    
                    # Save accident if confirmed (same as live_cctv.py)
                    if accident_confirmed:
                        accident_triggered = True
                        accident_count += 1
                        STATE.last_accident_time = current_time
                        
                        # Save clip using clip_writer (same as live_cctv.py)
                        filename = f"accident_{accident_count:03d}_{int(current_time)}.mp4"
                        clip_path = Path("accidents") / filename
                        clip_path.parent.mkdir(exist_ok=True)
                        
                        save_clip(post_frames, str(clip_path))
                        print(f"🚨 ACCIDENT #{accident_count} CONFIRMED - Saved: {filename}\n", flush=True)
                        
                        # Calculate severity based on stopped time
                        severity = calculate_severity(0.85, vehicle['stopped_time'], vehicle['speed'])
                        
                        accidents.append({
                            "accident_detected": True,
                            "confidence": 0.85,
                            "severity": severity,
                            "latitude": latitude,
                            "longitude": longitude,
                            "clip_path": str(clip_path),
                            "accident_id": f"ACC_{int(current_time)}_{accident_count}",
                            "vehicle_id": vehicle['id'],
                            "stopped_time": round(vehicle['stopped_time'], 2),
                            "speed": round(vehicle['speed'], 2)
                        })
                        
                        STATE.accident_history.append(accidents[-1])
                        
                        # Notify backend immediately
                        notify_backend({
                            "accident_detected": True,
                            "confidence": 0.85,
                            "severity": severity,
                            "latitude": latitude,
                            "longitude": longitude,
                            "clip_path": str(clip_path),
                            "accident_id": f"ACC_{int(current_time)}_{accident_count}",
                            "camera_id": camera_id,
                            "detection_source": "video"
                        })
                    else:
                        print("✋ FALSE POSITIVE REJECTED\n")
                    
                    break
        
        cap.release()
        
        # Cleanup temp file
        try:
            os.unlink(temp_path)
        except:
            pass
        
        print(f"\n✅ Video processing complete: {frame_count} frames, {accident_count} accidents detected")
        print(f"   Cooldown setting: {CONFIG.accident_cooldown}s between accidents\n")
        
        return {
            "status": "completed",
            "total_frames": frame_count,
            "frames_analyzed": frame_count,
            "accidents_detected": accident_count,
            "accidents": accidents,
            "cooldown_seconds": CONFIG.accident_cooldown,
            "message": f"Processed {frame_count} frames, detected {accident_count} accidents"
        }
    
    except Exception as e:
        import traceback
        error_detail = f"Video processing failed: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ {error_detail}")
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")


# COMMENTED OUT - Not needed for backend-orchestrated flow
# @app.get("/accidents/history")
# async def get_accident_history(limit: int = 50):
#     """Get recent accident detection history"""
#     return {
#         "total": len(STATE.accident_history),
#         "accidents": STATE.accident_history[-limit:]
#     }


# COMMENTED OUT - Not needed for backend-orchestrated flow
# @app.post("/reset")
# async def reset_state():
#     """Reset detection state and tracking"""
#     STATE.reset_tracking()
#     STATE.last_accident_time = 0
#     STATE.accident_count = 0
#     STATE.accident_history = []
#     
#     return {
#         "status": "reset",
#         "timestamp": datetime.now().isoformat()
#     }


# ============================================================================
# WEBCAM ENDPOINTS - COMMENTED OUT
# Backend-orchestrated flow uses cameras registered in backend database
# Uncomment if you need standalone webcam testing
# ============================================================================

# @app.post("/webcam/start")
# async def start_webcam(camera_id: int = 0, backend: str = "auto", confidence: float = None):
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# @app.get("/webcam/frame")
# async def get_webcam_frame(encode: bool = True):
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# @app.get("/webcam/status")
# async def get_webcam_status():
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# @app.post("/webcam/stop")
# async def stop_webcam():
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# @app.post("/webcam/detect")
# async def detect_webcam_frame():
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# @app.get("/webcam/debug")
# async def debug_webcam_detections():
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# @app.post("/webcam/continuous/start")
# async def start_continuous_detection(background_tasks: BackgroundTasks, fps: int = 5):
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# @app.post("/webcam/continuous/stop")
# async def stop_continuous_detection():
#     \"\"\"Webcam endpoints commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# async def continuous_webcam_detection(fps: int = 5):
#     \"\"\"Webcam detection helper commented out - use backend-orchestrated camera flow instead\"\"\"
#     pass
#
# Full webcam implementation available in git history if needed


if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting EMERGE AI Accident Detection API Server...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
