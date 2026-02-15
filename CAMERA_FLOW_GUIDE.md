# Camera-Based Detection Flow

## Overview
The system now follows a **centralized architecture** where the backend manages all camera information and orchestrates the AI detection service.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND (Port 5000)                      │
│                    Central Orchestrator                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Camera DB  │  │  Dispatch    │  │   WebSocket  │          │
│  │   Registry   │  │   Service    │  │   Broadcast  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
          │                                         ▲
          │ 1. Trigger Detection                   │ 3. Accident Callback
          │    (camera_id, location, video_url)    │    (accident data)
          ▼                                         │
┌─────────────────────────────────────────────────────────────────┐
│                    AI SERVICE (Port 8000)                        │
│                    Detection Processor                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     YOLO     │  │   Tracking   │  │     CNN      │          │
│  │   Detection  │  │   & Logic    │  │  Verification│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
          │
          │ 2. Process Video
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CCTV CAMERAS / VIDEO FILES                      │
│         (RTSP Streams, HTTP Streams, File Storage)              │
└─────────────────────────────────────────────────────────────────┘
```

## Complete Workflow

### 1. Camera Registration (One-time Setup)
```http
POST http://localhost:5000/api/cameras
Content-Type: application/json

{
  "cameraId": "CAM_JUNCTION_01",
  "name": "Main Junction Camera",
  "location": "MG Road & 5th Avenue Intersection",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "rtspUrl": "rtsp://192.168.1.100:554/stream1",
  "streamType": "RTSP",
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "camera": {
    "id": "uuid",
    "cameraId": "CAM_JUNCTION_01",
    "name": "Main Junction Camera",
    "location": "MG Road & 5th Avenue Intersection",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "rtspUrl": "rtsp://192.168.1.100:554/stream1",
    "streamType": "RTSP",
    "isActive": true
  }
}
```

### 2. Trigger Detection
```http
POST http://localhost:5000/api/detections/camera/CAM_JUNCTION_01
Content-Type: application/json

{
  "duration": 300
}
```

**What happens internally:**
1. Backend fetches camera info from DB
2. Backend calls AI service: `POST http://localhost:8000/detect/camera`
3. AI service processes video from RTSP/file
4. On accident detection, AI calls backend: `POST http://localhost:5000/api/ai/ai-callback`
5. Backend triggers dispatch, updates DB, broadcasts WebSocket

### 3. Upload Video for Processing
```http
POST http://localhost:5000/api/detections/video
Content-Type: multipart/form-data

video: <video.mp4>
cameraId: "CAM_JUNCTION_01" (optional)
latitude: 28.6139 (optional, overrides camera location)
longitude: 77.2090 (optional, overrides camera location)
```

### 4. Auto-Dispatch Flow
```
Accident Detected
    ↓
Backend /api/ai/ai-callback
    ↓
Accident saved to DB
    ↓
dispatchService.js
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│ Find Ambulance  │ Find Hospital   │ Green Corridor  │
│ (nearest)       │ (nearest+beds)  │ (traffic signal)│
└─────────────────┴─────────────────┴─────────────────┘
    ↓
Dispatch record created
    ↓
WebSocket broadcast (accident, dispatch, ambulance, hospital)
    ↓
Frontend / Dashboard updated in real-time
```

## API Endpoints

### Backend - Camera Management

#### Get All Cameras
```http
GET /api/cameras
```

#### Get Active Cameras
```http
GET /api/cameras/active
```

#### Get Camera by ID
```http
GET /api/cameras/:id
```

#### Get Camera by Camera Code
```http
GET /api/cameras/code/:cameraId
```

#### Create Camera
```http
POST /api/cameras
Content-Type: application/json

{
  "cameraId": "string (unique)",
  "name": "string",
  "location": "string",
  "latitude": number,
  "longitude": number,
  "rtspUrl": "string (optional)",
  "videoPath": "string (optional)",
  "streamType": "RTSP|FILE|HTTP",
  "isActive": boolean
}
```

#### Update Camera
```http
PUT /api/cameras/:id
Content-Type: application/json
```

#### Delete Camera
```http
DELETE /api/cameras/:id
```

### Backend - Detection Triggers

#### Detect from Camera
```http
POST /api/detections/camera/:cameraId
Content-Type: application/json

{
  "duration": 300  // seconds (for live streams)
}
```

#### Detect from Uploaded Video
```http
POST /api/detections/video
Content-Type: multipart/form-data

video: <file>
cameraId: "string (optional)"
latitude: "number (optional)"
longitude: "number (optional)"
```

#### Start Continuous Monitoring
```http
POST /api/detections/monitoring/start/:cameraId
Content-Type: application/json

{
  "checkInterval": 300  // seconds between checks
}
```

#### Stop Continuous Monitoring
```http
POST /api/detections/monitoring/stop/:cameraId
```

#### Get Camera Info (used by AI service)
```http
GET /api/detections/camera-info/:cameraId
```

### AI Service - Detection Endpoints

#### Detect from Camera (called by backend)
```http
POST /detect/camera
Content-Type: application/json

{
  "camera_id": "string",
  "latitude": number,
  "longitude": number,
  "stream_url": "string (optional)",
  "video_path": "string (optional)",
  "stream_type": "RTSP|FILE|HTTP",
  "duration_seconds": number (optional)
}
```

#### Detect from Video (legacy, still supported)
```http
POST /detect/video?latitude=28.6139&longitude=77.2090&camera_id=CAM_001
Content-Type: multipart/form-data

file: <video.mp4>
```

## Database Schema

### Camera Model
```prisma
model Camera {
  id          String   @id @default(uuid())
  cameraId    String   @unique
  name        String
  location    String
  latitude    Float
  longitude   Float
  rtspUrl     String?
  videoPath   String?
  streamType  String   @default("RTSP") // RTSP || FILE || HTTP
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## Setup Instructions

### 1. Run Database Migration
```bash
cd backend
npx prisma migrate dev --name add_camera_model
npx prisma generate
```

### 2. Seed Sample Cameras (Optional)
```bash
npm run seed-cameras
```

### 3. Configure Environment Variables
```env
# backend/.env
AI_SERVICE_URL=http://localhost:8000
```

### 4. Start Services

**Terminal 1: Backend**
```bash
cd backend
npm start
```

**Terminal 2: AI Service**
```bash
cd model/inference
python -u api_server.py
```

## Example Usage

### Register a Camera
```bash
curl -X POST http://localhost:5000/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "cameraId": "CAM_001",
    "name": "Main Junction",
    "location": "MG Road",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "rtspUrl": "rtsp://camera-ip:554/stream",
    "streamType": "RTSP",
    "isActive": true
  }'
```

### Trigger Detection
```bash
curl -X POST http://localhost:5000/api/detections/camera/CAM_001 \
  -H "Content-Type: application/json" \
  -d '{"duration": 60}'
```

### Upload Video
```bash
curl -X POST http://localhost:5000/api/detections/video \
  -F "video=@accident_video.mp4" \
  -F "cameraId=CAM_001"
```

## Benefits of This Architecture

✅ **Centralized Camera Management** - All camera info stored in backend DB  
✅ **Automatic Location** - No need to pass lat/long manually  
✅ **Backend Orchestration** - Backend controls when/what to process  
✅ **AI Service Isolation** - AI only processes, doesn't manage cameras  
✅ **Scalability** - Easy to add/remove cameras  
✅ **Security** - Camera credentials managed by backend  
✅ **Audit Trail** - All detections linked to registered cameras  
✅ **Flexibility** - Support RTSP, HTTP streams, and video files  

## Migration from Old Flow

**Old Flow:**
```
User → Upload video directly to AI → AI returns result
```

**New Flow:**
```
User → Backend (camera registry) → Backend triggers AI → AI processes → AI callbacks backend → Backend dispatches
```

**Backward Compatibility:**
- Old `/detect/video` endpoint still works
- Can still upload videos directly to AI service
- New camera-based flow is optional but recommended
