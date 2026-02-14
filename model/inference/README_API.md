# EMERGE AI - Accident Detection Model API

## Quick Start Guide

This API server exposes the accident detection model for integration with the backend.

### 1. Install Dependencies

```bash
cd model/inference
pip install -r api_requirements.txt
```

### 2. Start the Server

**Windows:**
```bash
start_api.bat
```

**Linux/Mac:**
```bash
chmod +x start_api.sh
./start_api.sh
```

**Manual start:**
```bash
python api_server.py
```

### 3. Access the API

- **Base URL**: http://localhost:8000
- **Interactive Docs**: http://localhost:8000/docs
- **API Documentation**: See [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

## Quick Test

### Health Check
```bash
curl http://localhost:8000/health
```

### Test with Webcam (New! 🎥)

**Option 1: Web Interface**
1. Open `webcam_client.html` in your browser
2. Click "Start Webcam"
3. Click "Capture & Detect" or "Start Continuous"

**Option 2: API**
```bash
# Start webcam
curl -X POST http://localhost:8000/webcam/start

# Detect from current frame
curl -X POST http://localhost:8000/webcam/detect

# Stop webcam
curl -X POST http://localhost:8000/webcam/stop
```

### Test with Python Client
```bash
python api_client_example.py
```

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check server health |
| `/status` | GET | Get detection statistics |
| `/detect/frame` | POST | Detect accidents in single frame |
| `/detect/video` | POST | Process uploaded video file |
| `/webcam/start` | POST | **Start live webcam** 🎥 |
| `/webcam/detect` | POST | **Detect from webcam frame** 🎥 |
| `/webcam/continuous/start` | POST | **Start continuous detection** 🎥 |
| `/accidents/history` | GET | Get accident history |
| `/reset` | POST | Reset detection state |

## Integration Example

### From Node.js Backend

```javascript
const axios = require('axios');
const fs = require('fs');

// Encode frame as base64
const imageBuffer = fs.readFileSync('frame.jpg');
const base64Image = imageBuffer.toString('base64');

// Send for detection
const response = await axios.post('http://localhost:8000/detect/frame', {
    frame_base64: base64Image,
    camera_id: 'CCTV_001',
    location: {
        lat: 28.6139,
        lng: 77.2090
    }
});

// Handle response
if (response.data.accident_detected) {
    console.log('🚨 ACCIDENT DETECTED!');
    console.log('ID:', response.data.accident_id);
    console.log('Confidence:', response.data.confidence);
    console.log('Vehicles:', response.data.vehicles);
    
    // Trigger emergency response in your backend
    await triggerEmergencyResponse(response.data);
}
```

## Response Format

```json
{
  "accident_detected": true,
  "accident_id": "ACC_20260214_103000_a1b2c3d4",
  "confidence": 0.85,
  "timestamp": "2026-02-14T10:30:00",
  "vehicles": [
    {
      "id": 123,
      "class": 2,
      "bounding_box": {"x1": 100, "y1": 200, "x2": 300, "y2": 400},
      "center": {"x": 200, "y": 300},
      "speed": 0.5,
      "stopped_time": 3.2
    }
  ],
  "verification_method": "yolo+cnn",
  "frame_analyzed": true,
  "metadata": {
    "camera_id": "CCTV_001",
    "location": {"lat": 28.6139, "lng": 77.2090}
  }
}
```

## Configuration

Default configuration:
- **YOLO Confidence**: 0.4
- **CNN Threshold**: 0.65
- **Final Threshold**: 0.65
- **Accident Cooldown**: 30 seconds
- **Stopped Time Threshold**: 2.5 seconds

Update configuration via `/config` endpoint.

## Architecture

```
┌─────────────────┐
│  Node.js Backend│
│   (Port 3000)   │
└────────┬────────┘
         │ HTTP POST
         │ (base64 frames)
         ▼
┌─────────────────┐
│  FastAPI Server │
│   (Port 8000)   │
├─────────────────┤
│  • YOLO Model   │
│  • CNN Model    │
│  • Tracking     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Detection Result│
│   (JSON)        │
└─────────────────┘
```

## Files

- `api_server.py` - Main FastAPI server
- `api_client_example.py` - Example Python client
- `API_DOCUMENTATION.md` - Full API documentation
- `api_requirements.txt` - Python dependencies
- `start_api.bat` - Windows startup script
- `start_api.sh` - Linux/Mac startup script

## Requirements

- Python 3.8+
- PyTorch
- Ultralytics (YOLOv8)
- FastAPI
- OpenCV

## Troubleshooting

### Port Already in Use
```bash
# Change port in api_server.py (last line)
uvicorn.run(app, host="0.0.0.0", port=8001)
```

### Model Not Found
Ensure models are in correct paths:
- YOLO: `model/yolov8s.pt`
- CNN: `model/models/accident_detection_model.pth`

### GPU Not Detected
```bash
# Install PyTorch with CUDA support
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

## Performance

- **Single Frame**: 50-200ms
- **Video Processing**: 5-10 FPS real-time
- **Recommended**: Use GPU for faster inference

## Production Deployment

### Using Gunicorn (Linux)
```bash
gunicorn api_server:app -w 4 -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 --timeout 120
```

### Using Docker
```bash
docker build -t emerge-ai-api .
docker run -p 8000:8000 --gpus all emerge-ai-api
```

### CORS Configuration
Update in `api_server.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://your-backend-url.com"],  # Specify your backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Support

- Full documentation: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- Interactive API docs: http://localhost:8000/docs
- Test client: `python api_client_example.py`

---

**EMERGE AI Emergency Response System**  
Part of the Traffic Accident Detection & Response Platform
