"""
Test script for camera-based detection flow
Demonstrates the complete workflow from camera registration to accident detection
"""

import requests
import json

BACKEND_URL = "http://localhost:5000"
AI_SERVICE_URL = "http://localhost:8000"


def print_section(title):
    """Print formatted section header"""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70 + "\n")


def test_get_cameras():
    """Test: Get all cameras from backend"""
    print_section("TEST 1: Get All Cameras")
    
    response = requests.get(f"{BACKEND_URL}/api/cameras")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Found {len(data.get('cameras', []))} cameras")
        for camera in data.get('cameras', []):
            print(f"\n   📹 {camera['cameraId']}: {camera['name']}")
            print(f"      Location: {camera['location']}")
            print(f"      Coordinates: {camera['latitude']}, {camera['longitude']}")
            print(f"      Source: {camera.get('rtspUrl') or camera.get('videoPath')}")
            print(f"      Active: {camera['isActive']}")
    else:
        print(f"❌ Failed: {response.status_code}")
        print(response.text)


def test_get_camera_by_id(camera_id):
    """Test: Get specific camera info"""
    print_section(f"TEST 2: Get Camera Info - {camera_id}")
    
    response = requests.get(f"{BACKEND_URL}/api/cameras/code/{camera_id}")
    
    if response.status_code == 200:
        data = response.json()
        camera = data.get('camera', {})
        print(f"✅ Camera found:")
        print(json.dumps(camera, indent=2))
    else:
        print(f"❌ Failed: {response.status_code}")
        print(response.text)


def test_trigger_camera_detection(camera_id, duration=30):
    """Test: Trigger detection for a camera"""
    print_section(f"TEST 3: Trigger Detection - {camera_id}")
    
    print(f"⏳ Starting detection for {duration} seconds...")
    print("   (This will take time as it processes the video)")
    
    payload = {
        "duration": duration
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/detections/camera/{camera_id}",
            json=payload,
            timeout=duration + 60  # Extra buffer for processing
        )
        
        if response.status_code == 200:
            data = response.json()
            print("\n✅ Detection completed:")
            print(json.dumps(data, indent=2))
            
            if data.get('aiResponse', {}).get('accidents_detected', 0) > 0:
                print(f"\n🚨 {data['aiResponse']['accidents_detected']} ACCIDENT(S) DETECTED!")
        else:
            print(f"\n❌ Failed: {response.status_code}")
            print(response.text)
    
    except requests.exceptions.Timeout:
        print("\n⚠️ Request timed out (this is normal for live streams)")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def test_upload_video(video_path, camera_id=None):
    """Test: Upload video file for processing"""
    print_section("TEST 4: Upload Video File")
    
    print(f"📹 Uploading video: {video_path}")
    
    try:
        with open(video_path, 'rb') as f:
            files = {'video': f}
            data = {}
            
            if camera_id:
                data['cameraId'] = camera id
            
            response = requests.post(
                f"{BACKEND_URL}/api/detections/video",
                files=files,
                data=data,
                timeout=600  # 10 minutes for large videos
            )
            
            if response.status_code == 200:
                result = response.json()
                print("\n✅ Video processed:")
                print(json.dumps(result, indent=2))
                
                if result.get('result', {}).get('accidents_detected', 0) > 0:
                    print(f"\n🚨 {result['result']['accidents_detected']} ACCIDENT(S) DETECTED!")
            else:
                print(f"\n❌ Failed: {response.status_code}")
                print(response.text)
    
    except FileNotFoundError:
        print(f"\n❌ Video file not found: {video_path}")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def test_ai_service_health():
    """Test: Check AI service health"""
    print_section("TEST 5: AI Service Health Check")
    
    response = requests.get(f"{AI_SERVICE_URL}/health")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ AI Service is healthy:")
        print(json.dumps(data, indent=2))
    else:
        print(f"❌ AI Service not responding: {response.status_code}")


def test_backend_health():
    """Test: Check backend health"""
    print_section("TEST 6: Backend Health Check")
    
    try:
        response = requests.get(f"{BACKEND_URL}/")
        
        if response.status_code == 200:
            print("✅ Backend is running")
        else:
            print(f"⚠️ Backend returned: {response.status_code}")
    except Exception as e:
        print(f"❌ Backend not responding: {e}")


def main():
    """Run all tests"""
    print("\n" + "🚑" * 35)
    print("  EMERGE AI - Camera-Based Detection Flow Test")
    print("🚑" * 35)
    
    # Check services
    test_backend_health()
    test_ai_service_health()
    
    # Test camera management
    test_get_cameras()
    
    # Test specific camera
    camera_id = "CAM_JUNCTION_01"
    test_get_camera_by_id(camera_id)
    
    # Uncomment to test detection (requires valid RTSP stream or video file)
    # test_trigger_camera_detection(camera_id, duration=30)
    
    # Uncomment to test video upload
    # test_upload_video("D:\\test_videos\\accident_test.mp4", camera_id="CAM_TEST_FILE")
    
    print_section("TESTS COMPLETE")
    print("""
Next steps:
1. For RTSP streams: Update camera rtspUrl in database with real camera IP
2. For video files: Place test video and update videoPath
3. Uncomment test_trigger_camera_detection() to run actual detection
4. Check backend logs for accident callbacks
5. Check ai service logs for detection progress

Notes:
- Detection requires valid video source (RTSP or file)
- Processing time depends on video duration and quality
- Accidents are automatically sent to backend callback
- Dispatch is triggered automatically
    """)


if __name__ == "__main__":
    main()
