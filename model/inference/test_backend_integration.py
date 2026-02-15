"""
Test Backend Integration for EMERGE AI
Tests automatic backend notification when accidents are detected
"""

import requests
import base64
import cv2
import time
from pathlib import Path

# Configuration
API_SERVER = "http://localhost:8000"
BACKEND_SERVER = "http://localhost:5000"

def test_backend_health():
    """Check if backend is running"""
    try:
        response = requests.get(f"{BACKEND_SERVER}/api/accidents", timeout=3)
        print(f"✅ Backend is running at {BACKEND_SERVER}")
        return True
    except:
        print(f"❌ Backend is NOT running at {BACKEND_SERVER}")
        print("   Start it with: cd backend && npm start")
        return False

def test_api_health():
    """Check if API server is running"""
    try:
        response = requests.get(f"{API_SERVER}/health", timeout=3)
        print(f"✅ API Server is running at {API_SERVER}")
        return True
    except:
        print(f"❌ API Server is NOT running at {API_SERVER}")
        print("   Start it with: python api_server.py")
        return False

def test_frame_detection_with_location():
    """Test frame detection with automatic backend notification"""
    print("\n📹 Testing frame detection with backend integration...")
    
    # Create a simple test frame (black image)
    test_frame = cv2.imread("test_image.jpg") if Path("test_image.jpg").exists() else None
    
    if test_frame is None:
        print("⚠️ No test image found, skipping frame test")
        return
    
    # Encode frame to base64
    _, buffer = cv2.imencode('.jpg', test_frame)
    frame_base64 = base64.b64encode(buffer).decode('utf-8')
    frame_data = f"data:image/jpeg;base64,{frame_base64}"
    
    # Send to API
    try:
        response = requests.post(
            f"{API_SERVER}/detect/frame",
            json={
                "frame_base64": frame_data,
                "camera_id": "TEST_CAM_001",
                "location": "Test Location",
                "latitude": 28.6139,
                "longitude": 77.2090
            },
            timeout=30
        )
        
        result = response.json()
        print(f"\n🔍 Detection Result:")
        print(f"   Accident Detected: {result.get('accident_detected')}")
        print(f"   Confidence: {result.get('confidence')}")
        print(f"   Severity: {result.get('severity')}")
        print(f"   Location: {result.get('latitude')}, {result.get('longitude')}")
        
        if result.get('accident_detected'):
            print(f"\n🚨 Accident detected! Backend should have been notified automatically.")
            print(f"   Check backend logs for ambulance dispatch confirmation.")
        
    except Exception as e:
        print(f"❌ Frame detection failed: {e}")

def test_video_detection():
    """Test video file detection with backend notification"""
    print("\n🎬 Testing video detection with backend integration...")
    
    # Check for test video
    test_video = Path("video.mp4")
    if not test_video.exists():
        print("⚠️ No test_video.mp4 found in current directory")
        print("   Place a test video to test video detection")
        return
    
    try:
        with open(test_video, 'rb') as f:
            files = {'file': f}
            params = {
                'latitude': 28.6139,
                'longitude': 77.2090,
                'camera_id': 'TEST_VIDEO_001'
            }
            
            print(f"📤 Uploading video for detection...")
            response = requests.post(
                f"{API_SERVER}/detect/video",
                files=files,
                params=params,
                timeout=120
            )
            
            result = response.json()
            print(f"\n✅ Video processed:")
            print(f"   Status: {result.get('status')}")
            print(f"   Frames: {result.get('total_frames')}")
            print(f"   Accidents: {result.get('accidents_detected')}")
            
            if result.get('accidents'):
                print(f"\n🚨 {len(result['accidents'])} accident(s) detected!")
                for i, accident in enumerate(result['accidents'], 1):
                    print(f"\n   Accident {i}:")
                    print(f"     ID: {accident.get('accident_id')}")
                    print(f"     Severity: {accident.get('severity')}")
                    print(f"     Location: {accident.get('latitude')}, {accident.get('longitude')}")
                    print(f"     Clip: {accident.get('clip_path')}")
                print(f"\n   Backend should have been notified for each accident!")
                print(f"   Check backend logs for ambulance dispatch confirmations.")
    
    except Exception as e:
        print(f"❌ Video detection failed: {e}")

def test_manual_backend_call():
    """Test direct backend notification (manual)"""
    print("\n🔔 Testing manual backend notification...")
    
    try:
        response = requests.post(
            f"{BACKEND_SERVER}/api/ai/ai-callback",
            json={
                "accident_detected": True,
                "confidence": 0.88,
                "severity": "HIGH",
                "latitude": 28.6139,
                "longitude": 77.2090,
                "clip_path": "accidents/test_clip.mp4"
            },
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✅ Backend responded successfully!")
            print(f"   Message: {result.get('message', 'N/A')}")
            if result.get('accident'):
                accident_id = result['accident'].get('id', 'N/A')
                print(f"   Accident ID: {accident_id}")
            if result.get('dispatch'):
                ambulance_id = result['dispatch'].get('ambulanceId', 'N/A')
                hospital_id = result['dispatch'].get('hospitalId', 'N/A')
                print(f"   🚑 Ambulance ID: {ambulance_id}")
                print(f"   🏥 Hospital ID: {hospital_id}")
        else:
            print(f"⚠️ Backend returned status {response.status_code}")
    
    except Exception as e:
        print(f"❌ Manual backend call failed: {e}")

def main():
    """Run all integration tests"""
    print("=" * 70)
    print("🚨 EMERGE AI - Full System Integration Test")
    print("=" * 70)
    
    # Check services
    backend_ok = test_backend_health()
    api_ok = test_api_health()
    
    if not backend_ok or not api_ok:
        print("\n❌ One or both services are not running. Start them first:")
        if not backend_ok:
            print("   Backend: cd backend && npm start")
        if not api_ok:
            print("   API: cd model/inference && python api_server.py")
        return
    
    print("\n" + "=" * 70)
    print("🧪 Running Integration Tests")
    print("=" * 70)
    
    # Test 1: Manual backend call
    test_manual_backend_call()
    time.sleep(2)
    
    # Test 2: Frame detection (if test image exists)
    test_frame_detection_with_location()
    time.sleep(2)
    
    # Test 3: Video detection (if test video exists)
    test_video_detection()
    
    print("\n" + "=" * 70)
    print("✅ Integration tests completed!")
    print("=" * 70)
    print("\nNOTE: When accidents are detected via /detect/frame or /detect/video,")
    print("the API automatically calls the backend at /api/ai/ai-callback")
    print("This triggers:")
    print("  1. Accident record creation in database")
    print("  2. Automatic ambulance dispatch")
    print("  3. Real-time WebSocket notifications")
    print("  4. Traffic signal coordination")

if __name__ == "__main__":
    main()
