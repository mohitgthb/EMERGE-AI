# Camera Detection Flow - Testing Guide

## Test Scripts

Two test scripts are provided to test the complete backend-orchestrated camera detection flow:

### 1. PowerShell Script (Windows)
```powershell
.\test-camera-flow.ps1
```

### 2. Python Script (Cross-platform)
```bash
python test-camera-flow.py
```

## Prerequisites

Before running the tests, ensure both services are running:

### Start Backend (Terminal 1)
```bash
cd backend
npm start
```

### Start AI Service (Terminal 2)
```bash
cd model/inference
python api_server.py
```

## What the Test Does

1. **Service Health Check** - Verifies backend and AI service are running
2. **List Cameras** - Shows all cameras in database
3. **Select Camera** - Choose test camera (webcam, video file, or custom)
4. **Get Details** - Fetches camera configuration
5. **Trigger Detection** - Starts AI detection and waits for results

## Test Options

### Option 1: Test with Webcam
- Uses your computer's webcam (device 0)
- Best for quick testing
- No video file needed
- Duration: 10-30 seconds recommended

### Option 2: Test with Video File
- Upload any MP4/AVI video file
- Best for testing with known accident scenarios
- Provide full path to video file
- Example: `D:\videos\accident_test.mp4`

### Option 3: Test with Existing Camera
- Use any camera already in database
- Requires camera to have valid `rtspUrl` or `videoPath`
- Good for testing real camera integrations

## Expected Flow

```
User → Backend → AI Service → Backend Callback → Dispatch
```

1. User triggers detection via test script
2. Backend fetches camera info from database
3. Backend sends camera details to AI service
4. AI service processes video and detects accidents
5. AI service calls backend callback with results
6. Backend triggers dispatch pipeline (if accident detected)
7. Test script displays results

## Sample Output

```
========================================
EMERGE AI - Camera Detection Flow Test
========================================

1. Checking services...
   ✓ Backend is running
   ✓ AI Service is running

2. Listing cameras in database...
   Found 5 cameras:
   ✓ CAM_JUNCTION_01 - Main Junction - North
     Location: 28.6139, 77.209
   ✓ CAM_TEST_FILE - Test Camera File
     Location: 28.5355, 77.391

3. Select test camera:
   [1] Use webcam (device 0)
   [2] CAM_TEST_FILE (need to configure video path)
   [3] Custom camera ID
   Enter choice (1-3): 1

4. Fetching camera details...
   Camera: Test Camera File
   Location: 28.5355, 77.391
   Stream Type: WEBCAM
   Source: 0

5. Trigger detection...
   Enter duration in seconds (default: 10): 10
   Starting detection for 10 seconds...

   ✓ Detection completed!
   
   Results:
   {
     "success": true,
     "camera": {
       "cameraId": "CAM_TEST_FILE",
       "name": "Test Camera File"
     },
     "aiResponse": {
       "status": "completed",
       "frames_processed": 300,
       "accidents_detected": 0
     }
   }
   
   ✓ No accidents detected
```

## Troubleshooting

### Backend not running
```bash
cd backend
npm start
```

### AI Service not running
```bash
cd model/inference
python api_server.py
```

### Webcam not accessible
- Try different camera device (0, 1, 2)
- Check camera permissions in Windows Settings
- Close other apps using camera

### Video file issues
- Ensure file path is correct
- Use forward slashes or escaped backslashes
- Supported formats: MP4, AVI, MOV

### RTSP stream issues
- Verify RTSP URL is accessible
- Check network connectivity
- Use public test stream for testing:
  ```
  rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4
  ```

## Manual Testing (without script)

### List cameras
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/cameras" -Method GET
```

### Update camera with webcam
```powershell
$body = @{
    videoPath = "0"
    streamType = "WEBCAM"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/cameras/code/CAM_TEST_FILE" -Method PUT -Body $body -ContentType "application/json"
```

### Trigger detection
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/detections/camera/CAM_TEST_FILE" -Method POST -Body '{"duration": 10}' -ContentType "application/json"
```

## Active API Endpoints

### Backend (http://localhost:5000)
- `GET /api/cameras` - List all cameras
- `GET /api/cameras/:id` - Get camera by ID
- `GET /api/cameras/code/:cameraId` - Get camera by cameraId
- `POST /api/cameras` - Create new camera
- `PUT /api/cameras/:id` - Update camera
- `DELETE /api/cameras/:id` - Delete camera
- `POST /api/detections/camera/:cameraId` - Trigger detection for camera
- `POST /api/detections/video` - Upload and process video

### AI Service (http://localhost:8000)
- `GET /` - API info
- `GET /health` - Health check
- `POST /detect/camera` - Process camera (called by backend)
- `POST /detect/video` - Process video (called by backend)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                      │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Camera Database (PostgreSQL + Prisma)          │    │
│  │  - Camera registry with locations                │    │
│  │  - RTSP URLs / Video paths                       │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Detection Orchestrator                          │    │
│  │  - Fetch camera info                             │    │
│  │  - Send to AI service                            │    │
│  │  - Receive detection results                     │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              AI SERVICE (Python/FastAPI)                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │  YOLO Detection + Tracking                       │    │
│  │  - Vehicle detection                             │    │
│  │  - Movement tracking                             │    │
│  │  - Stopped vehicle detection                     │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  CNN Verification (Optional)                     │    │
│  │  - Accident scene classification                 │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Callback to Backend                             │    │
│  │  - POST /api/ai/ai-callback                      │    │
│  │  - Accident data + location + clip               │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                   DISPATCH PIPELINE                       │
│  - Hospital selection                                     │
│  - Ambulance dispatch                                     │
│  - Green corridor creation                                │
│  - Signal optimization                                    │
└──────────────────────────────────────────────────────────┘
```

## Next Steps

After successful testing:
1. Configure real CCTV cameras with RTSP URLs
2. Set up camera locations (latitude/longitude)
3. Deploy AI service on dedicated hardware
4. Configure backend callback URL for production
5. Set up monitoring and alerting
