"""
Accident Detection Model API Server

FastAPI server that provides REST endpoints for accident detection.
Integrates YOLO object detection, tracking, and CNN verification.

Endpoints:
- POST /detect/stream - Process video stream
- POST /detect/frame - Process single frame
- POST /detect/video - Process video file
- GET /health - Health check
- GET /status - Get current detection status
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
                input_size=(250, 250),  # Match TFLite model input
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
    cnn_confidence_threshold: float = 0.65
    yolo_confidence: float = 0.4
    fusion_method: str = "weighted"
    final_confidence_threshold: float = 0.65
    accident_cooldown: int = 5  # Reduced from 30 to detect more accidents in short videos
    stopped_time_threshold: float = 2.5
    speed_threshold: float = 1.0

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
        "message": "EMERGE AI - Accident Detection API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "detect_frame": "/detect/frame",
            "detect_video": "/detect/video",
            "status": "/status",
            "config": "/config"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if STATE.yolo_model is not None else "unhealthy",
        yolo_loaded=STATE.yolo_model is not None,
        cnn_loaded=STATE.cnn_verifier is not None,
        timestamp=datetime.now().isoformat()
    )


@app.get("/status")
async def get_status():
    """Get current detection status and statistics"""
    return {
        "status": "running",
        "total_accidents_detected": STATE.accident_count,
        "last_accident_time": STATE.last_accident_time if STATE.last_accident_time > 0 else None,
        "active_tracks": len(STATE.prev_centers),
        "config": CONFIG.dict(),
        "models": {
            "yolo": STATE.yolo_model is not None,
            "cnn": STATE.cnn_verifier is not None
        }
    }


@app.get("/config")
async def get_config():
    """Get current configuration"""
    return CONFIG.dict()


@app.post("/config")
async def update_config(config: DetectionConfig):
    """Update detection configuration"""
    global CONFIG
    CONFIG = config
    return {
        "status": "updated",
        "config": CONFIG.dict()
    }


@app.post("/detect/frame", response_model=DetectionResult)
async def detect_frame(request: FrameRequest):
    """
    Detect accidents in a single frame with automatic location detection
    
    Args:
        request: FrameRequest with base64 encoded frame
        
    Returns:
        DetectionResult with accident detection information
    """
    try:
        # Decode frame
        frame = decode_frame(request.frame_base64)
        
        # Auto-detect location if not provided
        latitude = request.latitude
        longitude = request.longitude
        
        if latitude is None or longitude is None:
            # Try to extract from image EXIF data
            try:
                image_bytes = base64.b64decode(request.frame_base64.split(',')[-1])
                lat_exif, lon_exif = get_gps_from_image(image_bytes)
                if lat_exif and lon_exif:
                    latitude, longitude = lat_exif, lon_exif
            except:
                pass
            
            # Fallback to IP geolocation if still not found
            if latitude is None or longitude is None:
                lat_ip, lon_ip = get_location_from_ip()
                if lat_ip and lon_ip:
                    latitude, longitude = lat_ip, lon_ip
        
        # Process frame
        accident_detected, vehicles, confidence, method, yolo_result = await process_frame_async(frame)
        
        # Generate accident ID and clip if detected
        accident_id = None
        clip_path = None
        severity = None
        
        if accident_detected:
            accident_id = f"ACC_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
            
            # Calculate severity from vehicles data
            max_stopped_time = max([v.get('stopped_time', 0) for v in vehicles], default=0)
            severity = calculate_severity(confidence, max_stopped_time)
            
            # Save frame as clip
            clip_filename = f"accident_{accident_id}.jpg"
            clip_path = str(Path("accidents") / clip_filename)
            cv2.imwrite(clip_path, frame)
            
            STATE.accident_history.append({
                "id": accident_id,
                "timestamp": datetime.now().isoformat(),
                "confidence": confidence,
                "severity": severity,
                "camera_id": request.camera_id,
                "location": request.location,
                "latitude": latitude,
                "longitude": longitude,
                "clip_path": clip_path
            })
        
        return DetectionResult(
            accident_detected=accident_detected,
            confidence=round(confidence, 3),
            severity=severity,
            latitude=latitude,
            longitude=longitude,
            clip_path=clip_path,
            accident_id=accident_id,
            timestamp=datetime.now().isoformat(),
            vehicles=vehicles,
            verification_method=method,
            frame_analyzed=True,
            metadata={
                "camera_id": request.camera_id,
                "location": request.location,
                "frame_shape": frame.shape[:2],
                "location_source": "provided" if request.latitude else ("exif" if latitude else "ip")
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@app.get("/detect/video")
async def detect_video_info():
    """Get information about the video detection endpoint"""
    return {
        "endpoint": "/detect/video",
        "method": "POST",
        "description": "Process uploaded video file for accident detection with automatic location detection",
        "content_type": "multipart/form-data",
        "features": [
            "Automatic GPS extraction from video metadata",
            "IP-based geolocation fallback",
            "Severity calculation (HIGH/MEDIUM/LOW)",
            "Accident clip saving"
        ],
        "parameters": {
            "file": "Video file (required)",
            "latitude": "Latitude coordinate (optional, auto-detected if not provided)",
            "longitude": "Longitude coordinate (optional, auto-detected if not provided)",
            "camera_id": "Camera identifier (optional, string, default: VIDEO_UPLOAD)"
        },
        "location_detection": {
            "priority_1": "Provided latitude/longitude parameters",
            "priority_2": "GPS metadata from video file (MP4/MOV)",
            "priority_3": "IP-based geolocation (fallback)"
        },
        "response_format": {
            "accident_detected": "boolean",
            "confidence": "float (0.0-1.0)",
            "severity": "string (HIGH/MEDIUM/LOW)",
            "latitude": "float (auto-detected or provided)",
            "longitude": "float (auto-detected or provided)",
            "clip_path": "string (path to saved video)",
            "accident_id": "string (unique identifier)"
        },
        "example_curl": 'curl -X POST "http://localhost:8000/detect/video?latitude=28.6139&longitude=77.2090" -F "file=@video.mp4"',
        "example_curl_auto": 'curl -X POST "http://localhost:8000/detect/video" -F "file=@video.mp4"  # Auto-detects location',
        "example_python": """
import requests
# With explicit location
with open('video.mp4', 'rb') as f:
    files = {'file': f}
    params = {'latitude': 28.6139, 'longitude': 77.2090, 'camera_id': 'CAM-001'}
    response = requests.post('http://localhost:8000/detect/video', files=files, params=params)
    print(response.json())

# With automatic location detection
with open('video.mp4', 'rb') as f:
    files = {'file': f}
    response = requests.post('http://localhost:8000/detect/video', files=files)
    print(response.json())  # Location auto-detected from video metadata or IP
        """.strip(),
        "docs": "http://localhost:8000/docs#/default/detect_video_detect_video_post"
    }


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
                        print(f"🚨 ACCIDENT #{accident_count} CONFIRMED - Saved: {filename}\n")
                        
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


@app.get("/accidents/history")
async def get_accident_history(limit: int = 50):
    """Get recent accident detection history"""
    return {
        "total": len(STATE.accident_history),
        "accidents": STATE.accident_history[-limit:]
    }


@app.post("/reset")
async def reset_state():
    """Reset detection state and tracking"""
    STATE.reset_tracking()
    STATE.last_accident_time = 0
    STATE.accident_count = 0
    STATE.accident_history = []
    
    return {
        "status": "reset",
        "timestamp": datetime.now().isoformat()
    }


# Webcam Endpoints

@app.post("/webcam/start")
async def start_webcam(camera_id: int = 0, backend: str = "auto", confidence: float = None):
    """
    Start webcam capture
    
    Args:
        camera_id: Camera device ID (default: 0 for primary webcam)
        backend: Backend to use ('auto', 'dshow', 'msmf', 'any')
        confidence: YOLO confidence threshold (default: 0.4, use 0.2-0.3 for screen-through-webcam)
        
    Returns:
        Status of webcam initialization
    """
    # Set custom confidence if provided
    if confidence is not None:
        if 0.1 <= confidence <= 1.0:
            CONFIG.yolo_confidence = confidence
            print(f"📊 YOLO confidence set to: {confidence}")
        else:
            raise HTTPException(status_code=400, detail="Confidence must be between 0.1 and 1.0")
    
    try:
        if STATE.webcam_active:
            return {
                "status": "already_active",
                "message": "Webcam is already active",
                "camera_id": camera_id
            }
        
        # Try different backends for Windows compatibility
        backends_to_try = []
        
        if backend == "auto":
            # Try DirectShow first (more reliable on Windows), then MSMF, then any
            backends_to_try = [
                (cv2.CAP_DSHOW, "DirectShow"),
                (cv2.CAP_MSMF, "Media Foundation"),
                (cv2.CAP_ANY, "Default")
            ]
        elif backend == "dshow":
            backends_to_try = [(cv2.CAP_DSHOW, "DirectShow")]
        elif backend == "msmf":
            backends_to_try = [(cv2.CAP_MSMF, "Media Foundation")]
        else:
            backends_to_try = [(cv2.CAP_ANY, "Default")]
        
        last_error = None
        for cap_backend, backend_name in backends_to_try:
            try:
                print(f"🔍 Trying {backend_name} backend...")
                STATE.webcam = cv2.VideoCapture(camera_id, cap_backend)
                
                if STATE.webcam.isOpened():
                    # Test if we can actually read a frame
                    ret, test_frame = STATE.webcam.read()
                    if ret and test_frame is not None:
                        print(f"✅ Successfully opened camera with {backend_name}")
                        STATE.webcam_active = True
                        STATE.reset_tracking()
                        
                        # Get camera properties
                        width = int(STATE.webcam.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(STATE.webcam.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        fps = int(STATE.webcam.get(cv2.CAP_PROP_FPS))
                        
                        return {
                            "status": "started",
                            "camera_id": camera_id,
                            "backend": backend_name,
                            "resolution": {"width": width, "height": height},
                            "fps": fps,
                            "yolo_confidence": CONFIG.yolo_confidence
                        }
                    else:
                        STATE.webcam.release()
                        last_error = f"{backend_name}: Could not read test frame"
                else:
                    last_error = f"{backend_name}: Could not open camera"
                    
            except Exception as e:
                last_error = f"{backend_name}: {str(e)}"
                if STATE.webcam:
                    STATE.webcam.release()
                    STATE.webcam = None
        
        # If we got here, all backends failed
        error_msg = f"Failed to open camera {camera_id}. Last error: {last_error}.\n"
        error_msg += "Troubleshooting:\n"
        error_msg += "1. Make sure no other application is using the camera\n"
        error_msg += "2. Check camera permissions in Windows Settings > Privacy > Camera\n"
        error_msg += "3. Try a different camera_id (0, 1, 2, etc.)\n"
        error_msg += "4. Restart the application"
        
        raise HTTPException(status_code=500, detail=error_msg)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/webcam/frame")
async def get_webcam_frame(encode: bool = True):
    """
    Capture a single frame from webcam
    
    Args:
        encode: If True, returns base64 encoded image. If False, returns raw detection result.
        
    Returns:
        Current webcam frame (encoded) or detection result
    """
    if not STATE.webcam_active or not STATE.webcam:
        raise HTTPException(status_code=400, detail="Webcam is not active. Call /webcam/start first.")
    
    # Try to read frame with retry
    max_retries = 3
    frame = None
    
    for attempt in range(max_retries):
        ret, frame = STATE.webcam.read()
        if ret and frame is not None:
            break
        
        if attempt < max_retries - 1:
            await asyncio.sleep(0.1)  # Brief pause before retry
    
    if not ret or frame is None:
        error_msg = "Failed to capture frame from webcam after multiple attempts. "
        error_msg += "The camera may be in use by another application. "
        error_msg += "Please stop the webcam (/webcam/stop) and restart it."
        raise HTTPException(status_code=500, detail=error_msg)
    
    if encode:
        # Return encoded frame
        encoded = encode_frame(frame)
        return {
            "frame": encoded,
            "timestamp": datetime.now().isoformat(),
            "shape": {"height": frame.shape[0], "width": frame.shape[1]}
        }
    else:
        # Process frame and return detection result
        accident_detected, vehicles, confidence, method, _ = process_frame(frame)
        
        accident_id = None
        if accident_detected:
            accident_id = f"ACC_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
            STATE.accident_history.append({
                "id": accident_id,
                "timestamp": datetime.now().isoformat(),
                "confidence": confidence,
                "camera_id": "WEBCAM",
                "location": None
            })
        
        return DetectionResult(
            accident_detected=accident_detected,
            accident_id=accident_id,
            confidence=round(confidence, 3),
            timestamp=datetime.now().isoformat(),
            vehicles=vehicles,
            verification_method=method,
            frame_analyzed=True,
            metadata={"camera_id": "WEBCAM", "source": "webcam"}
        )


@app.get("/webcam/status")
async def get_webcam_status():
    """Get current status of webcam"""
    return {
        "webcam_active": STATE.webcam_active,
        "continuous_detection_active": STATE.webcam_detection_active,
        "webcam_available": STATE.webcam is not None,
        "timestamp": datetime.now().isoformat()
    }


@app.post("/webcam/stop")
async def stop_webcam():
    """Stop webcam capture and release resources"""
    if STATE.webcam_active:
        STATE.webcam_detection_active = False
        STATE.webcam_active = False
        
        if STATE.webcam:
            STATE.webcam.release()
            STATE.webcam = None
        
        return {
            "status": "stopped",
            "message": "Webcam stopped and resources released",
            "timestamp": datetime.now().isoformat()
        }
    else:
        return {
            "status": "not_active",
            "message": "Webcam was not active"
        }


@app.post("/webcam/detect")
async def detect_webcam_frame():
    """
    Capture and analyze a single frame from active webcam
    
    Returns:
        Detection result for the current frame
    """
    if not STATE.webcam_active or not STATE.webcam:
        raise HTTPException(status_code=400, detail="Webcam is not active. Call /webcam/start first.")
    
    ret, frame = STATE.webcam.read()
    
    if not ret:
        raise HTTPException(status_code=500, detail="Failed to capture frame from webcam")
    
    # Process frame
    accident_detected, vehicles, confidence, method, _ = process_frame(frame)
    
    accident_id = None
    if accident_detected:
        accident_id = f"ACC_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        STATE.accident_history.append({
            "id": accident_id,
            "timestamp": datetime.now().isoformat(),
            "confidence": confidence,
            "camera_id": "WEBCAM",
            "location": None
        })
    
    return DetectionResult(
        accident_detected=accident_detected,
        accident_id=accident_id,
        confidence=round(confidence, 3),
        timestamp=datetime.now().isoformat(),
        vehicles=vehicles,
        verification_method=method,
        frame_analyzed=True,
        metadata={"camera_id": "WEBCAM", "source": "webcam_detect"}
    )


@app.get("/webcam/debug")
async def debug_webcam_detections():
    """
    Debug endpoint: Show ALL YOLO detections from webcam with low confidence threshold
    
    Returns:
        Raw YOLO detections to help troubleshoot detection issues
    """
    if not STATE.webcam_active or not STATE.webcam:
        raise HTTPException(status_code=400, detail="Webcam is not active. Call /webcam/start first.")
    
    ret, frame = STATE.webcam.read()
    
    if not ret:
        raise HTTPException(status_code=500, detail="Failed to capture frame from webcam")
    
    # Run YOLO with LOW confidence (0.15) to see everything
    results = STATE.yolo_model(frame, conf=0.15, verbose=False)
    
    all_detections = []
    class_names = STATE.yolo_model.names
    
    if len(results[0].boxes) > 0:
        for box, cls, conf in zip(results[0].boxes.xyxy, results[0].boxes.cls, results[0].boxes.conf):
            cls_id = int(cls)
            all_detections.append({
                "class_id": cls_id,
                "class_name": class_names.get(cls_id, f"class_{cls_id}"),
                "confidence": round(float(conf), 3),
                "bbox": [int(x) for x in box.tolist()],
                "is_vehicle": cls_id in [2, 3, 5, 7]  # car, motorcycle, bus, truck
            })
    
    vehicle_count = sum(1 for d in all_detections if d["is_vehicle"])
    
    return {
        "total_detections": len(all_detections),
        "vehicle_detections": vehicle_count,
        "threshold_used": 0.15,
        "normal_threshold": CONFIG.yolo_confidence,
        "detections": all_detections,
        "tip": f"Seeing 0 detections? Try: 1) Better lighting, 2) Larger screen, 3) Reduce screen glare, 4) Upload video file instead",
        "vehicle_classes": "car(2), motorcycle(3), bus(5), truck(7)"
    }


@app.post("/webcam/continuous/start")
async def start_continuous_detection(background_tasks: BackgroundTasks, fps: int = 5):
    """
    Start continuous detection from webcam
    
    Args:
        fps: Frames per second to process (default: 5)
        
    Returns:
        Status of continuous detection
    """
    if not STATE.webcam_active or not STATE.webcam:
        raise HTTPException(status_code=400, detail="Webcam is not active. Call /webcam/start first.")
    
    if STATE.webcam_detection_active:
        return {
            "status": "already_running",
            "message": "Continuous detection is already active"
        }
    
    STATE.webcam_detection_active = True
    background_tasks.add_task(continuous_webcam_detection, fps)
    
    return {
        "status": "started",
        "fps": fps,
        "message": "Continuous detection started. Check /accidents/history for detected accidents.",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/webcam/continuous/stop")
async def stop_continuous_detection():
    """Stop continuous detection from webcam"""
    if STATE.webcam_detection_active:
        STATE.webcam_detection_active = False
        return {
            "status": "stopped",
            "message": "Continuous detection stopped",
            "timestamp": datetime.now().isoformat()
        }
    else:
        return {
            "status": "not_running",
            "message": "Continuous detection was not active"
        }


async def continuous_webcam_detection(fps: int = 5):
    """Background task for continuous webcam detection"""
    
    frame_delay = 1.0 / fps
    print(f"🎥 Starting continuous webcam detection at {fps} FPS...")
    
    consecutive_failures = 0
    max_failures = 5
    
    while STATE.webcam_detection_active and STATE.webcam_active:
        try:
            ret, frame = STATE.webcam.read()
            
            if not ret or frame is None:
                consecutive_failures += 1
                print(f"⚠️ Failed to capture frame (attempt {consecutive_failures}/{max_failures})")
                
                if consecutive_failures >= max_failures:
                    print("❌ Too many consecutive failures, stopping continuous detection")
                    STATE.webcam_detection_active = False
                    break
                
                # Wait a bit before retrying
                await asyncio.sleep(0.5)
                continue
            
            # Reset failure counter on success
            consecutive_failures = 0
            
            # Process frame
            accident_detected, vehicles, confidence, method, _ = process_frame(frame)
            
            if accident_detected:
                accident_id = f"ACC_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
                STATE.accident_history.append({
                    "id": accident_id,
                    "timestamp": datetime.now().isoformat(),
                    "confidence": confidence,
                    "camera_id": "WEBCAM",
                    "location": None
                })
                print(f"🚨 ACCIDENT DETECTED: {accident_id} (confidence: {confidence:.2f})")
            
            # Wait for next frame
            await asyncio.sleep(frame_delay)
            
        except Exception as e:
            print(f"❌ Error in continuous detection: {e}")
            STATE.webcam_detection_active = False
            break
    
    print("🛑 Continuous webcam detection stopped")


if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting EMERGE AI Accident Detection API Server...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
