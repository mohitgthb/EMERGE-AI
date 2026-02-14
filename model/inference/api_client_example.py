"""
Example API Client for EMERGE AI Accident Detection

This demonstrates how to interact with the accident detection API
from your Node.js backend or any other client.

Usage:
    python api_client_example.py
"""

import requests
import base64
import cv2
import json
from pathlib import Path
import time


class AccidentDetectionClient:
    """Client for interacting with the Accident Detection API"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
    
    def health_check(self):
        """Check if the API server is healthy"""
        try:
            response = self.session.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Health check failed: {e}")
            return None
    
    def get_status(self):
        """Get current server status and statistics"""
        try:
            response = self.session.get(f"{self.base_url}/status")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Status check failed: {e}")
            return None
    
    def detect_frame_from_file(self, image_path: str, camera_id: str = None, location: dict = None):
        """
        Detect accidents in an image file
        
        Args:
            image_path: Path to image file
            camera_id: Optional camera identifier
            location: Optional location dict with lat/lng
            
        Returns:
            Detection result dictionary
        """
        try:
            # Read and encode image
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            base64_image = base64.b64encode(image_data).decode('utf-8')
            
            # Prepare request
            payload = {
                "frame_base64": base64_image,
                "camera_id": camera_id,
                "location": location
            }
            
            # Send request
            response = self.session.post(
                f"{self.base_url}/detect/frame",
                json=payload
            )
            response.raise_for_status()
            
            return response.json()
        
        except requests.exceptions.RequestException as e:
            print(f"❌ Frame detection failed: {e}")
            return None
    
    def detect_frame_from_bytes(self, frame_bytes: bytes, camera_id: str = None):
        """
        Detect accidents from frame bytes (e.g., from video stream)
        
        Args:
            frame_bytes: Image bytes (JPEG/PNG)
            camera_id: Optional camera identifier
            
        Returns:
            Detection result dictionary
        """
        try:
            base64_image = base64.b64encode(frame_bytes).decode('utf-8')
            
            payload = {
                "frame_base64": base64_image,
                "camera_id": camera_id
            }
            
            response = self.session.post(
                f"{self.base_url}/detect/frame",
                json=payload
            )
            response.raise_for_status()
            
            return response.json()
        
        except requests.exceptions.RequestException as e:
            print(f"❌ Frame detection failed: {e}")
            return None
    
    def detect_video(self, video_path: str):
        """
        Upload and process a video file
        
        Args:
            video_path: Path to video file
            
        Returns:
            Complete video analysis results
        """
        try:
            with open(video_path, 'rb') as f:
                files = {'file': (Path(video_path).name, f, 'video/mp4')}
                
                response = self.session.post(
                    f"{self.base_url}/detect/video",
                    files=files,
                    timeout=300  # 5 minutes timeout for video processing
                )
                response.raise_for_status()
                
                return response.json()
        
        except requests.exceptions.RequestException as e:
            print(f"❌ Video detection failed: {e}")
            return None
    
    def get_accident_history(self, limit: int = 50):
        """Get recent accident detection history"""
        try:
            response = self.session.get(
                f"{self.base_url}/accidents/history",
                params={"limit": limit}
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Failed to get history: {e}")
            return None
    
    def reset_state(self):
        """Reset server state and tracking"""
        try:
            response = self.session.post(f"{self.base_url}/reset")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Reset failed: {e}")
            return None
    
    def update_config(self, config: dict):
        """Update detection configuration"""
        try:
            response = self.session.post(
                f"{self.base_url}/config",
                json=config
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Config update failed: {e}")
            return None


def example_usage():
    """Example usage of the API client"""
    
    # Initialize client
    client = AccidentDetectionClient("http://localhost:8000")
    
    print("=" * 60)
    print("EMERGE AI - Accident Detection API Client Example")
    print("=" * 60)
    
    # 1. Health Check
    print("\n1️⃣ Health Check...")
    health = client.health_check()
    if health:
        print(f"   Status: {health['status']}")
        print(f"   YOLO Loaded: {health['yolo_loaded']}")
        print(f"   CNN Loaded: {health['cnn_loaded']}")
    
    # 2. Get Status
    print("\n2️⃣ Server Status...")
    status = client.get_status()
    if status:
        print(f"   Total Accidents: {status['total_accidents_detected']}")
        print(f"   Active Tracks: {status['active_tracks']}")
        print(f"   Models: YOLO={status['models']['yolo']}, CNN={status['models']['cnn']}")
    
    # 3. Process a single frame from webcam
    print("\n3️⃣ Processing webcam frame...")
    cap = cv2.VideoCapture(0)
    
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            # Encode frame
            _, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            
            # Send for detection
            result = client.detect_frame_from_bytes(
                frame_bytes,
                camera_id="CAM_001"
            )
            
            if result:
                print(f"   Accident Detected: {result['accident_detected']}")
                print(f"   Confidence: {result['confidence']}")
                print(f"   Vehicles: {len(result['vehicles'])}")
                print(f"   Method: {result['verification_method']}")
                
                if result['accident_detected']:
                    print(f"   🚨 Accident ID: {result['accident_id']}")
        
        cap.release()
    
    # 4. Process an image file (if available)
    print("\n4️⃣ Processing image file...")
    test_image = "test_frame.jpg"
    if Path(test_image).exists():
        result = client.detect_frame_from_file(
            test_image,
            camera_id="CAM_002",
            location={"lat": 28.6139, "lng": 77.2090}  # Example: Delhi
        )
        
        if result:
            print(f"   Accident Detected: {result['accident_detected']}")
            print(f"   Vehicles Tracked: {len(result['vehicles'])}")
    else:
        print(f"   ⚠️ Test image not found: {test_image}")
    
    # 5. Get accident history
    print("\n5️⃣ Accident History...")
    history = client.get_accident_history(limit=10)
    if history:
        print(f"   Total Accidents: {history['total']}")
        if history['accidents']:
            print(f"   Recent: {len(history['accidents'])} accidents")
            for acc in history['accidents'][-3:]:
                print(f"      - {acc['id']} at {acc['timestamp']}")
    
    print("\n" + "=" * 60)
    print("✅ Example completed")
    print("=" * 60)


def example_node_integration():
    """
    Example showing how to integrate from Node.js backend
    This is Python code showing the equivalent fetch/axios calls
    """
    print("\n" + "=" * 60)
    print("Node.js Integration Example (pseudocode)")
    print("=" * 60)
    
    nodejs_example = """
// Example Node.js integration using axios or fetch

// 1. Health Check
const health = await axios.get('http://localhost:8000/health');
console.log('API Status:', health.data.status);

// 2. Send frame for detection (from CCTV stream)
const frameBase64 = Buffer.from(frameBytes).toString('base64');

const detectionResult = await axios.post('http://localhost:8000/detect/frame', {
    frame_base64: frameBase64,
    camera_id: 'CCTV_MAIN_ROAD_01',
    location: {
        lat: 28.6139,
        lng: 77.2090
    }
});

if (detectionResult.data.accident_detected) {
    console.log('🚨 ACCIDENT DETECTED!');
    console.log('Accident ID:', detectionResult.data.accident_id);
    console.log('Confidence:', detectionResult.data.confidence);
    console.log('Vehicles:', detectionResult.data.vehicles);
    
    // Send to your backend for emergency response
    await emergencyResponse.dispatch({
        accidentId: detectionResult.data.accident_id,
        location: detectionResult.data.metadata.location,
        timestamp: detectionResult.data.timestamp,
        confidence: detectionResult.data.confidence
    });
}

// 3. Process uploaded video
const formData = new FormData();
formData.append('file', videoFile);

const videoResult = await axios.post('http://localhost:8000/detect/video', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000  // 5 minutes
});

console.log('Accidents in video:', videoResult.data.accidents_detected);
console.log('Total frames:', videoResult.data.total_frames);

// 4. Get accident history
const history = await axios.get('http://localhost:8000/accidents/history?limit=20');
console.log('Recent accidents:', history.data.accidents);
    """
    
    print(nodejs_example)
    print("=" * 60)


if __name__ == "__main__":
    # Run example
    example_usage()
    
    # Show Node.js integration
    example_node_integration()
    
    print("\n📚 For full API documentation, visit: http://localhost:8000/docs")
    print("📊 For alternative docs, visit: http://localhost:8000/redoc")
