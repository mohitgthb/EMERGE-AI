# Backend Integration - EMERGE AI

## 🚨 Automatic Emergency Response System

When an accident is detected by the AI model, the system **automatically**:
1. ✅ Detects accident with location
2. 📍 Auto-detects GPS coordinates (from video/IP)
3. 🔔 Notifies backend immediately
4. 🚑 Dispatches ambulance automatically
5. 🏥 Selects nearest hospital
6. 🚦 Activates green corridor
7. 📡 Sends real-time WebSocket updates

---

## 🔄 System Flow

```
┌─────────────────────┐
│  Video/CCTV Feed    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Detection API   │  (Python - Port 8000)
│  /detect/video      │
│  /detect/frame      │
└──────────┬──────────┘
           │ Auto-notify when accident detected
           ▼
┌─────────────────────┐
│  Backend API        │  (Node.js - Port 5000)
│  /api/ai/ai-callback│
└──────────┬──────────┘
           │
           ├─► 📊 Create Accident Record
           ├─► 🚑 Dispatch Ambulance  
           ├─► 🏥 Select Hospital
           ├─► 🚦 Activate Green Corridor
           └─► 📡 WebSocket Broadcast
```

---

## 🚀 Quick Start

### 1. Start Backend (Terminal 1)
```bash
cd backend
npm install
npm start
```
**Backend runs on:** `http://localhost:5000`

### 2. Start AI API (Terminal 2)
```bash
cd model/inference
pip install -r api_requirements.txt
python api_server.py
```
**AI API runs on:** `http://localhost:8000`

### 3. Test Integration (Terminal 3)
```bash
cd model/inference
python test_backend_integration.py
```

---

## 📡 API Endpoints

### AI Detection API (Port 8000)

#### 1. **POST /detect/video** - Video File Detection
```bash
curl -X POST "http://localhost:8000/detect/video" \
  -F "file=@accident_video.mp4"
```

**Response:**
```json
{
  "status": "completed",
  "accidents": [
    {
      "accident_detected": true,
      "confidence": 0.85,
      "severity": "HIGH",
      "latitude": 28.6139,
      "longitude": 77.2090,
      "clip_path": "accidents/accident_001.mp4",
      "accident_id": "ACC_1738656000_1"
    }
  ]
}
```

**Backend is notified automatically!** ✅

---

#### 2. **POST /detect/frame** - Single Frame Detection
```bash
curl -X POST "http://localhost:8000/detect/frame" \
  -H "Content-Type: application/json" \
  -d '{
    "frame_base64": "data:image/jpeg;base64,...",
    "camera_id": "CAM-001"
  }'
```

**Response:**
```json
{
  "accident_detected": true,
  "confidence": 0.87,
  "severity": "HIGH",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "clip_path": "accidents/accident_ACC_20260214.jpg"
}
```

**Backend is notified automatically!** ✅

---

### Backend API (Port 5000)

#### **POST /api/ai/ai-callback** - Receive Detection (Called Automatically)
```python
import requests

requests.post(
    "http://localhost:5000/api/ai/ai-callback",
    json={
        "accident_detected": True,
        "confidence": 0.88,
        "severity": "HIGH",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "clip_path": "accidents/clip_001.mp4"
    }
)
```

**Response:**
```json
{
  "message": "Accident processed",
  "accident": {
    "id": 123,
    "latitude": 28.6139,
    "longitude": 77.2090,
    "severity": "HIGH"
  },
  "dispatch": {
    "ambulanceId": 5,
    "hospitalId": 2,
    "eta": "8 mins"
  }
}
```

---

## ⚙️ Configuration

Edit `model/inference/api_server.py`:

```python
class DetectionConfig(BaseModel):
    # Backend integration
    backend_url: str = "http://localhost:5000"
    auto_notify_backend: bool = True  # Enable/disable auto-notification
    
    # Detection parameters
    enable_cnn_verification: bool = True
    accident_cooldown: int = 5  # seconds between detections
```

---

## 🧪 Testing

### Test 1: Check Services Running
```bash
# Check Backend
curl http://localhost:5000/api/accidents

# Check AI API
curl http://localhost:8000/health
```

### Test 2: Manual Backend Call
```bash
curl -X POST "http://localhost:5000/api/ai/ai-callback" \
  -H "Content-Type: application/json" \
  -d '{
    "accident_detected": true,
    "confidence": 0.88,
    "severity": "HIGH",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "clip_path": "test.mp4"
  }'
```

### Test 3: Full Integration Test
```bash
python test_backend_integration.py
```

---

## 🔍 Monitoring

### AI API Logs
Watch for automatic backend notifications:
```
🚨 ACCIDENT #1 CONFIRMED - Saved: accident_001_1738656000.mp4
📍 Auto-detected location from video metadata: 28.6139, 77.2090
🔔 Notifying backend at http://localhost:5000/api/ai/ai-callback...
✅ Backend notified successfully: Accident processed
🚑 Ambulance dispatched: 5
```

### Backend Logs
Watch for incoming detections and dispatches:
```
POST /api/ai/ai-callback 201
✅ Accident created: ID 123
🚑 Ambulance #5 dispatched to Hospital #2
🚦 Green corridor activated
📡 WebSocket broadcast: ACCIDENT_CONFIRMED
```

---

## 📍 Location Detection Priority

1. **Manual Input** (Highest)
   - Provide `latitude` and `longitude` in request

2. **Video Metadata**
   - GPS extracted from MP4/MOV files (requires ffmpeg)

3. **Image EXIF**
   - GPS extracted from JPEG EXIF data

4. **IP Geolocation** (Fallback)
   - Location from API caller's IP address

---

## 🎯 Severity Calculation

```python
HIGH:   confidence ≥ 0.85 OR stopped_time ≥ 5.0s
MEDIUM: confidence ≥ 0.65 OR stopped_time ≥ 3.0s
LOW:    Below medium thresholds
```

---

## 🛠️ Troubleshooting

### Backend Not Reachable
```
❌ Backend not reachable at http://localhost:5000
   Make sure backend server is running: npm start
```

**Solution:** Start the backend server in a separate terminal

### No Location Data
```
⚠️ IP geolocation failed
```

**Solution:** 
- Provide manual coordinates
- Install ffmpeg for video metadata extraction
- Check internet connection for IP geolocation

### Low Confidence Detections Ignored
```
Detection ignored (confidence: 0.60)
```

**Solution:** Backend ignores detections below 0.75 confidence. This is configurable in `backend/controllers/ai.controller.js`

---

## 🔐 Security Notes

- Currently allows all origins (`allow_origins=["*"]`)
- For production, configure specific origins:
  ```python
  allow_origins=["http://your-frontend-domain.com"]
  ```

---

## 📦 Dependencies

### AI API
```
fastapi
uvicorn
opencv-python
ultralytics
requests
Pillow
```

### Backend
```
express
prisma
axios
socket.io
```

---

## 🎉 Success Indicators

When everything is working:
- ✅ AI detects accident
- ✅ Location auto-detected or provided
- ✅ Backend receives notification
- ✅ Ambulance auto-dispatched
- ✅ Hospital selected
- ✅ Green corridor activated
- ✅ Real-time updates sent to frontend

**Full emergency response triggered automatically!** 🚑
