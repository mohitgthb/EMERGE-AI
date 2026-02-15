#!/usr/bin/env python3
"""
EMERGE AI - Camera Detection Flow Test Script
Tests the complete backend-orchestrated camera detection flow
"""

import requests
import json
import sys
import os
from pathlib import Path

BACKEND_URL = "http://localhost:5000"
AI_SERVICE_URL = "http://localhost:8000"

def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def print_success(text):
    print(f"✓ {text}")

def print_error(text):
    print(f"✗ {text}")

def print_info(text):
    print(f"  {text}")

def check_services():
    """Check if backend and AI service are running"""
    print_header("1. Checking Services")
    
    # Check backend
    try:
        response = requests.get(f"{BACKEND_URL}/api/cameras", timeout=5)
        print_success("Backend is running")
    except Exception as e:
        print_error(f"Backend is NOT running: {e}")
        print_info("Start it with: npm start (in backend folder)")
        sys.exit(1)
    
    # Check AI service
    try:
        response = requests.get(f"{AI_SERVICE_URL}/health", timeout=5)
        print_success("AI Service is running")
    except Exception as e:
        print_error(f"AI Service is NOT running: {e}")
        print_info("Start it with: python api_server.py (in model/inference folder)")
        sys.exit(1)

def list_cameras():
    """List all cameras in database"""
    print_header("2. Listing Cameras")
    
    try:
        response = requests.get(f"{BACKEND_URL}/api/cameras")
        data = response.json()
        
        cameras = data.get('cameras', [])
        print_info(f"Found {len(cameras)} cameras:\n")
        
        for cam in cameras:
            status = "✓" if cam['isActive'] else "✗"
            print(f"  {status} {cam['cameraId']} - {cam['name']}")
            print(f"    Location: {cam['latitude']}, {cam['longitude']}")
            source = cam.get('rtspUrl') or cam.get('videoPath') or "No source"
            print(f"    Source: {source}")
            print()
        
        return cameras
    except Exception as e:
        print_error(f"Failed to list cameras: {e}")
        sys.exit(1)

def select_camera():
    """Select camera for testing"""
    print_header("3. Select Test Camera")
    
    print("  [1] Use webcam (device 0)")
    print("  [2] Use video file")
    print("  [3] Custom camera ID")
    
    choice = input("\n  Enter choice (1-3): ").strip()
    
    if choice == "1":
        print("\n  Setting up webcam test camera...")
        try:
            update_data = {
                "videoPath": "0",
                "streamType": "WEBCAM",
                "rtspUrl": None
            }
            response = requests.put(
                f"{BACKEND_URL}/api/cameras/code/CAM_TEST_FILE",
                json=update_data,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            print_success("Updated CAM_TEST_FILE to use webcam")
            return "CAM_TEST_FILE"
        except Exception as e:
            print_error(f"Failed to update camera: {e}")
            sys.exit(1)
    
    elif choice == "2":
        video_path = input("\n  Enter video file path: ").strip()
        
        if not os.path.exists(video_path):
            print_error(f"File not found: {video_path}")
            sys.exit(1)
        
        try:
            update_data = {
                "videoPath": video_path,
                "streamType": "FILE",
                "rtspUrl": None
            }
            response = requests.put(
                f"{BACKEND_URL}/api/cameras/code/CAM_TEST_FILE",
                json=update_data,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            print_success("Updated CAM_TEST_FILE with video file")
            return "CAM_TEST_FILE"
        except Exception as e:
            print_error(f"Failed to update camera: {e}")
            sys.exit(1)
    
    elif choice == "3":
        camera_id = input("\n  Enter camera ID: ").strip()
        return camera_id
    
    else:
        print_error("Invalid choice")
        sys.exit(1)

def get_camera_details(camera_id):
    """Get camera details"""
    print_header("4. Fetching Camera Details")
    
    try:
        response = requests.get(f"{BACKEND_URL}/api/cameras/code/{camera_id}")
        data = response.json()
        camera = data['camera']
        
        print_info(f"Camera: {camera['name']}")
        print_info(f"Location: {camera['latitude']}, {camera['longitude']}")
        print_info(f"Stream Type: {camera['streamType']}")
        source = camera.get('rtspUrl') or camera.get('videoPath') or "No source"
        print_info(f"Source: {source}")
        print_info(f"Active: {camera['isActive']}")
        
        return camera
    except Exception as e:
        print_error(f"Camera not found: {e}")
        sys.exit(1)

def trigger_detection(camera_id):
    """Trigger detection for camera"""
    print_header("5. Trigger Detection")
    
    duration = input("  Enter duration in seconds (default: 10): ").strip()
    duration = int(duration) if duration else 10
    
    print(f"\n  Starting detection for {duration} seconds...")
    print("  This may take a while. Press Ctrl+C to cancel.\n")
    
    try:
        detection_data = {"duration": duration}
        response = requests.post(
            f"{BACKEND_URL}/api/detections/camera/{camera_id}",
            json=detection_data,
            headers={"Content-Type": "application/json"},
            timeout=duration + 60  # Add buffer to timeout
        )
        response.raise_for_status()
        result = response.json()
        
        print_success("Detection completed!\n")
        print("  Results:")
        print("  " + "="*50)
        print(json.dumps(result, indent=2))
        
        if result.get('aiResponse', {}).get('accidents_detected', 0) > 0:
            print(f"\n  🚨 Accidents detected: {result['aiResponse']['accidents_detected']}")
            print("  Check the model/inference/accidents folder for video clips")
        else:
            print("\n  ✓ No accidents detected")
        
    except requests.exceptions.Timeout:
        print_error("Detection timed out!")
    except Exception as e:
        print_error(f"Detection failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                print_info(f"Details: {json.dumps(error_data, indent=2)}")
            except:
                print_info(f"Response: {e.response.text}")

def main():
    """Main test flow"""
    print_header("EMERGE AI - Camera Detection Flow Test")
    
    # Run tests
    check_services()
    cameras = list_cameras()
    camera_id = select_camera()
    camera = get_camera_details(camera_id)
    trigger_detection(camera_id)
    
    print_header("Test Complete")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nTest cancelled by user")
        sys.exit(0)
