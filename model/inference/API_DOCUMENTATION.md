# EMERGE AI - Accident Detection API Documentation

## Overview

This API provides real-time accident detection using YOLOv8 object detection and optional CNN verification. It can process single frames, video streams, and uploaded video files.

## Base URL

```
http://localhost:8000
```

## Quick Start

### 1. Install Dependencies

```bash
cd model/inference
pip install -r api_requirements.txt
```

### 2. Start the Server

```bash
python api_server.py
```

The server will start on `http://localhost:8000`

### 3. Access Interactive Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Health & Status

#### `GET /health`

Check if the API server is running and models are loaded.

**Response:**
```json
{
  "status": "healthy",
  "yolo_loaded": true,
  "cnn_loaded": true,
  "timestamp": "2026-02-14T10:30:00"
}
```

#### `GET /status`

Get detailed server status and statistics.

**Response:**
```json
{
  "status": "running",
  "total_accidents_detected": 5,
  "last_accident_time": 1708001234.56,
  "active_tracks": 3,
  "config": {
    "enable_cnn_verification": true,
    "cnn_confidence_threshold": 0.65,
    "final_confidence_threshold": 0.65
  },
  "models": {
    "yolo": true,
    "cnn": true
  }
}
```

#### `GET /config`

Get current detection configuration.

**Response:**
```json
{
  "enable_cnn_verification": true,
  "cnn_confidence_threshold": 0.65,
  "yolo_confidence": 0.4,
  "fusion_method": "weighted",
  "final_confidence_threshold": 0.65,
  "accident_cooldown": 30,
  "stopped_time_threshold": 2.5,
  "speed_threshold": 1.0
}
```

#### `POST /config`

Update detection configuration.

**Request Body:**
```json
{
  "enable_cnn_verification": true,
  "cnn_confidence_threshold": 0.7,
  "final_confidence_threshold": 0.7
}
```

### Detection Endpoints

#### `POST /detect/frame`

Detect accidents in a single frame (image).

**Request Body:**
```json
{
  "frame_base64": "base64_encoded_image_data",
  "camera_id": "CAM_001",
  "location": {
    "lat": 28.6139,
    "lng": 77.2090
  }
}
```

**Response:**
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
      "bounding_box": {
        "x1": 100,
        "y1": 200,
        "x2": 300,
        "y2": 400
      },
      "center": {
        "x": 200,
        "y": 300
      },
      "speed": 0.5,
      "stopped_time": 3.2
    }
  ],
  "verification_method": "yolo+cnn",
  "frame_analyzed": true,
  "metadata": {
    "camera_id": "CAM_001",
    "location": {
      "lat": 28.6139,
      "lng": 77.2090
    },
    "frame_shape": [1080, 1920]
  }
}
```

#### `GET /detect/video`

Get information about the video detection endpoint.

**Response:**
```json
{
  "endpoint": "/detect/video",
  "method": "POST",
  "description": "Process uploaded video file",
  "example_curl": "curl -X POST http://localhost:8000/detect/video -F \"file=@video.mp4\""
}
```

#### `POST /detect/video`

Upload and process a video file.

**Request:**
- Content-Type: `multipart/form-data`
- File parameter: `file` (video file)

**Response:**
```json
{
  "status": "completed",
  "total_frames": 300,
  "frames_analyzed": 60,
  "accidents_detected": 2,
  "results": [
    {
      "frame_number": 150,
      "timestamp": 5.0,
      "accident_detected": true,
      "confidence": 0.82,
      "vehicles": [...],
      "verification_method": "yolo+cnn"
    }
  ]
}
```

### Webcam Endpoints

#### `POST /webcam/start`

Start webcam capture.

**Query Parameters:**
- `camera_id` (optional): Camera device ID (default: 0)

**Response:**
```json
{
  "status": "started",
  "camera_id": 0,
  "resolution": {"width": 1280, "height": 720},
  "fps": 30,
  "timestamp": "2026-02-14T10:30:00"
}
```

#### `POST /webcam/stop`

Stop webcam capture.

**Response:**
```json
{
  "status": "stopped",
  "timestamp": "2026-02-14T10:30:00"
}
```

#### `GET /webcam/status`

Get current webcam status.

**Response:**
```json
{
  "active": true,
  "detection_running": false,
  "camera_available": true
}
```

#### `GET /webcam/frame`

Capture a single frame from active webcam.

**Query Parameters:**
- `encode` (optional): If true, returns base64 image; if false, returns detection result (default: true)

**Response (encode=true):**
```json
{
  "frame": "base64_encoded_image",
  "timestamp": "2026-02-14T10:30:00",
  "shape": {"height": 720, "width": 1280}
}
```

**Response (encode=false):**
Returns DetectionResult (same as `/detect/frame`)

#### `POST /webcam/detect`

Capture and analyze a single frame from active webcam.

**Response:**
Same format as `/detect/frame` response.

#### `POST /webcam/continuous/start`

Start continuous accident detection from webcam.

**Query Parameters:**
- `fps` (optional): Frames per second to process (default: 5)

**Response:**
```json
{
  "status": "started",
  "fps": 5,
  "message": "Continuous detection started",
  "timestamp": "2026-02-14T10:30:00"
}
```

#### `POST /webcam/continuous/stop`

Stop continuous detection.

**Response:**
```json
{
  "status": "stopped",
  "timestamp": "2026-02-14T10:30:00"
}
```

### History & Management

#### `GET /accidents/history`

Get recent accident detection history.

**Query Parameters:**
- `limit` (optional): Number of recent accidents to return (default: 50)

**Response:**
```json
{
  "total": 10,
  "accidents": [
    {
      "id": "ACC_20260214_103000_a1b2c3d4",
      "timestamp": "2026-02-14T10:30:00",
      "confidence": 0.85,
      "camera_id": "CAM_001",
      "location": {
        "lat": 28.6139,
        "lng": 77.2090
      }
    }
  ]
}
```

#### `POST /reset`

Reset detection state and tracking.

**Response:**
```json
{
  "status": "reset",
  "timestamp": "2026-02-14T10:30:00"
}
```

## Integration Examples

### Python

**Single Frame:**
```python
import requests
import base64

# Read image
with open('frame.jpg', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode('utf-8')

# Send for detection
response = requests.post(
    'http://localhost:8000/detect/frame',
    json={
        'frame_base64': image_data,
        'camera_id': 'CAM_001'
    }
)

result = response.json()
if result['accident_detected']:
    print(f"🚨 Accident detected! ID: {result['accident_id']}")
```

**Webcam Detection:**
```python
import requests
import cv2
import base64

# Start webcam
requests.post('http://localhost:8000/webcam/start')

# Capture and detect
response = requests.post('http://localhost:8000/webcam/detect')
result = response.json()

if result['accident_detected']:
    print(f"🚨 Accident: {result['accident_id']}")

# Stop webcam
requests.post('http://localhost:8000/webcam/stop')
```

**Continuous Detection:**
```python
import requests
import time

# Start webcam
requests.post('http://localhost:8000/webcam/start')

# Start continuous detection at 5 FPS
requests.post('http://localhost:8000/webcam/continuous/start?fps=5')

# Let it run for 60 seconds
time.sleep(60)

# Get detected accidents
history = requests.get('http://localhost:8000/accidents/history').json()
print(f"Detected {len(history['accidents'])} accidents")

# Stop continuous detection
requests.post('http://localhost:8000/webcam/continuous/stop')
requests.post('http://localhost:8000/webcam/stop')
```

### Node.js (with axios)

**Single Frame:**
```javascript
const axios = require('axios');
const fs = require('fs');

// Read and encode image
const imageBuffer = fs.readFileSync('frame.jpg');
const base64Image = imageBuffer.toString('base64');

// Send for detection
const response = await axios.post('http://localhost:8000/detect/frame', {
    frame_base64: base64Image,
    camera_id: 'CAM_001',
    location: {
        lat: 28.6139,
        lng: 77.2090
    }
});

if (response.data.accident_detected) {
    console.log('🚨 Accident detected!');
    console.log('ID:', response.data.accident_id);
    console.log('Confidence:', response.data.confidence);
    
    // Handle emergency response
    await handleEmergency(response.data);
}
```

**Webcam Detection:**
```javascript
const axios = require('axios');

const api = axios.create({ baseURL: 'http://localhost:8000' });

// Start webcam
await api.post('/webcam/start');

// Detect from single frame
const result = await api.post('/webcam/detect');

if (result.data.accident_detected) {
    console.log('🚨 Accident:', result.data.accident_id);
    await handleEmergency(result.data);
}

// Stop webcam
await api.post('/webcam/stop');
```

**Continuous Detection with Polling:**
```javascript
const axios = require('axios');

const api = axios.create({ baseURL: 'http://localhost:8000' });

// Start webcam and continuous detection
await api.post('/webcam/start');
await api.post('/webcam/continuous/start?fps=5');

// Poll for accidents every 5 seconds
const pollInterval = setInterval(async () => {
    const history = await api.get('/accidents/history?limit=1');
    const latestAccident = history.data.accidents[0];
    
    if (latestAccident && !processedAccidents.has(latestAccident.id)) {
        console.log('🚨 New accident detected:', latestAccident.id);
        processedAccidents.add(latestAccident.id);
        
        // Trigger emergency response
        await dispatchEmergencyServices(latestAccident);
    }
}, 5000);

// Stop after some time
setTimeout(async () => {
    clearInterval(pollInterval);
    await api.post('/webcam/continuous/stop');
    await api.post('/webcam/stop');
}, 60000);
```

### Node.js (with fetch)

```javascript
const fs = require('fs');

// Read and encode image
const imageBuffer = fs.readFileSync('frame.jpg');
const base64Image = imageBuffer.toString('base64');

// Send for detection
const response = await fetch('http://localhost:8000/detect/frame', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        frame_base64: base64Image,
        camera_id: 'CAM_001'
    })
});

const result = await response.json();

if (result.accident_detected) {
    console.log('🚨 Accident:', result.accident_id);
}
```

### cURL

```bash
# Health check
curl http://localhost:8000/health

# Detect from image
curl -X POST http://localhost:8000/detect/frame \
  -H "Content-Type: application/json" \
  -d '{
    "frame_base64": "'"$(base64 -w 0 frame.jpg)"'",
    "camera_id": "CAM_001"
  }'

# Upload video
curl -X POST http://localhost:8000/detect/video \
  -F "file=@video.mp4"

# Start webcam
curl -X POST http://localhost:8000/webcam/start

# Capture and detect from webcam
curl -X POST http://localhost:8000/webcam/detect

# Start continuous detection (5 FPS)
curl -X POST "http://localhost:8000/webcam/continuous/start?fps=5"

# Get accident history
curl http://localhost:8000/accidents/history?limit=10

# Stop continuous detection
curl -X POST http://localhost:8000/webcam/continuous/stop

# Stop webcam
curl -X POST http://localhost:8000/webcam/stop
```

## Response Fields

### DetectionResult

| Field | Type | Description |
|-------|------|-------------|
| `accident_detected` | boolean | Whether an accident was detected |
| `accident_id` | string | Unique accident identifier (if detected) |
| `confidence` | float | Detection confidence (0-1) |
| `timestamp` | string | ISO 8601 timestamp |
| `vehicles` | array | List of detected vehicles |
| `verification_method` | string | "yolo", "yolo+cnn", or "none" |
| `frame_analyzed` | boolean | Whether frame was successfully analyzed |
| `metadata` | object | Additional context (camera ID, location, etc.) |

### Vehicle Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Track ID for the vehicle |
| `class` | integer | YOLO class ID (2=car, 3=motorcycle, 5=bus, 7=truck) |
| `bounding_box` | object | x1, y1, x2, y2 coordinates |
| `center` | object | x, y center coordinates |
| `speed` | float | Movement speed (pixels per frame) |
| `stopped_time` | float | Time vehicle has been stopped (seconds) |

## Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enable_cnn_verification` | boolean | true | Enable CNN verification for reduced false positives |
| `cnn_confidence_threshold` | float | 0.65 | Minimum CNN confidence for accident |
| `yolo_confidence` | float | 0.4 | YOLO detection confidence threshold |
| `fusion_method` | string | "weighted" | Method to combine YOLO and CNN ("weighted", "max") |
| `final_confidence_threshold` | float | 0.65 | Final threshold for accident confirmation |
| `accident_cooldown` | int | 30 | Seconds between repeated accident detections |
| `stopped_time_threshold` | float | 2.5 | Seconds a vehicle must be stopped |
| `speed_threshold` | float | 1.0 | Maximum speed to consider stopped |

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK`: Success
- `400 Bad Request`: Invalid request (e.g., malformed base64)
- `500 Internal Server Error`: Server error (e.g., model failure)

Example error response:
```json
{
  "detail": "Invalid frame data: Failed to decode frame"
}
```

## Performance Considerations

### Frame Processing

- Single frame: ~50-200ms (depending on resolution and hardware)
- Video processing: Processes every 5th frame by default
- Recommended resolution: 1080p or lower for real-time processing

### Optimization Tips

1. **Reduce frame rate**: Send frames at 5-10 FPS for real-time streams
2. **Resize frames**: Downscale large images before encoding
3. **Use GPU**: Ensure PyTorch CUDA is available for faster inference
4. **Disable CNN**: Set `enable_cnn_verification: false` for faster processing

## Production Deployment

### Using Gunicorn (Linux/Mac)

```bash
gunicorn api_server:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### Using Docker

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY . .

RUN pip install -r api_requirements.txt

EXPOSE 8000
CMD ["python", "api_server.py"]
```

### Environment Variables

```bash
export MODEL_PATH="/path/to/yolov8s.pt"
export CNN_MODEL_PATH="/path/to/accident_detection_model.pth"
export API_PORT=8000
```

## Troubleshooting

### Models not loading

**Issue**: `YOLO model not loaded` or `CNN verifier not available`

**Solution**:
1. Verify model files exist in `model/` directory
2. Check file paths in configuration
3. Ensure PyTorch and Ultralytics are installed

### High memory usage

**Solution**:
1. Reduce image resolution before sending
2. Limit concurrent requests
3. Use smaller batch sizes for video processing

### Slow inference

**Solution**:
1. Use GPU if available (`torch.cuda.is_available()`)
2. Reduce input resolution
3. Disable CNN verification for real-time requirements

## Support

For issues or questions:
- Check logs: API outputs detailed logs to console
- Interactive docs: http://localhost:8000/docs
- Test with example client: `python api_client_example.py`

## License

Part of EMERGE AI Emergency Response System
