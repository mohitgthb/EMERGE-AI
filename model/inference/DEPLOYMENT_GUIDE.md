# EMERGE AI - Model API Deployment Guide

## Table of Contents
1. [Overview](#overview)
2. [Installation](#installation)
3. [Running the API](#running-the-api)
4. [Testing](#testing)
5. [Backend Integration](#backend-integration)
6. [Docker Deployment](#docker-deployment)
7. [Production Setup](#production-setup)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Accident Detection API provides a REST interface to the YOLO + CNN accident detection model. It's designed to be consumed by the Node.js backend for real-time accident detection from CCTV streams.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    EMERGE AI System                       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────┐         ┌────────────────┐          │
│  │  Node.js       │         │  FastAPI       │          │
│  │  Backend       │◄───────►│  Model API     │          │
│  │  (Port 3000)   │  HTTP   │  (Port 8000)   │          │
│  └────────────────┘         └────────────────┘          │
│         │                            │                   │
│         │                            │                   │
│    ┌────▼─────┐              ┌──────▼──────┐           │
│    │PostgreSQL│              │YOLO + CNN    │           │
│    │Database  │              │Models        │           │
│    └──────────┘              └──────────────┘           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- **Python**: 3.8 or higher
- **pip**: Latest version
- **CUDA**: (Optional) For GPU acceleration
- **Model Files**:
  - `yolov8s.pt` - YOLO model
  - `accident_detection_model.pth` - CNN model

### Step 1: Navigate to API Directory

```bash
cd model/inference
```

### Step 2: Install Dependencies

```bash
# Install API dependencies
pip install -r api_requirements.txt

# Install base model dependencies (if not already installed)
pip install -r ../requirements.txt
```

### Step 3: Verify Model Files

Ensure these files exist:
```
model/
├── yolov8s.pt                          # YOLO weights
└── models/
    ├── accident_detection_model.pth    # CNN weights (PyTorch)
    └── accident_detection_model.h5     # CNN weights (optional)
```

### Step 4: Test Installation

```bash
python -c "import fastapi, torch, ultralytics; print('✅ All dependencies installed')"
```

---

## Running the API

### Method 1: Quick Start Script

**Windows:**
```bash
start_api.bat
```

**Linux/Mac:**
```bash
chmod +x start_api.sh
./start_api.sh
```

### Method 2: Direct Python

```bash
python api_server.py
```

### Method 3: Uvicorn (Production)

```bash
uvicorn api_server:app --host 0.0.0.0 --port 8000 --workers 1
```

### Method 4: Gunicorn (Linux Production)

```bash
gunicorn api_server:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
```

### Verify Server is Running

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "yolo_loaded": true,
  "cnn_loaded": true,
  "timestamp": "2026-02-14T10:30:00"
}
```

---

## Testing

### 1. Health Check

```bash
curl http://localhost:8000/health
```

### 2. Get Status

```bash
curl http://localhost:8000/status
```

### 3. Test with Example Client

```bash
python api_client_example.py
```

### 4. Test Frame Detection (curl)

```bash
# Capture frame and test
curl -X POST http://localhost:8000/detect/frame \
  -H "Content-Type: application/json" \
  -d '{
    "frame_base64": "'$(base64 -w 0 test_frame.jpg)'",
    "camera_id": "TEST_CAM"
  }'
```

### 5. Interactive API Docs

Visit: http://localhost:8000/docs

Try out endpoints directly in the browser.

---

## Backend Integration

### Node.js Integration

Create a service in your backend:

```javascript
// backend/services/accidentDetectionService.js

const axios = require('axios');
const FormData = require('form-data');

class AccidentDetectionService {
  constructor() {
    this.apiUrl = process.env.MODEL_API_URL || 'http://localhost:8000';
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000
    });
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      console.error('Model API health check failed:', error.message);
      return null;
    }
  }

  async detectAccident(frameBase64, cameraId, location) {
    try {
      const response = await this.client.post('/detect/frame', {
        frame_base64: frameBase64,
        camera_id: cameraId,
        location: location
      });
      
      return response.data;
    } catch (error) {
      console.error('Accident detection failed:', error.message);
      throw error;
    }
  }

  async processVideo(videoBuffer, filename) {
    try {
      const formData = new FormData();
      formData.append('file', videoBuffer, filename);
      
      const response = await this.client.post('/detect/video', formData, {
        headers: formData.getHeaders(),
        timeout: 300000  // 5 minutes
      });
      
      return response.data;
    } catch (error) {
      console.error('Video processing failed:', error.message);
      throw error;
    }
  }

  async getAccidentHistory(limit = 50) {
    try {
      const response = await this.client.get('/accidents/history', {
        params: { limit }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get accident history:', error.message);
      return null;
    }
  }
}

module.exports = new AccidentDetectionService();
```

### Usage Example in Backend Controller

```javascript
// backend/controllers/cctv.controller.js

const accidentDetectionService = require('../services/accidentDetectionService');

async function processCCTVFrame(req, res) {
  try {
    const { frame, cameraId, location } = req.body;
    
    // Convert frame to base64 if needed
    const frameBase64 = Buffer.from(frame).toString('base64');
    
    // Send to model API
    const result = await accidentDetectionService.detectAccident(
      frameBase64,
      cameraId,
      location
    );
    
    // If accident detected, trigger emergency response
    if (result.accident_detected) {
      console.log('🚨 ACCIDENT DETECTED:', result.accident_id);
      
      // Save to database
      await db.accidents.create({
        accident_id: result.accident_id,
        camera_id: cameraId,
        location: location,
        confidence: result.confidence,
        timestamp: result.timestamp,
        vehicles: result.vehicles,
        verification_method: result.verification_method
      });
      
      // Trigger emergency dispatch
      await emergencyDispatch.trigger({
        accidentId: result.accident_id,
        location: location,
        severity: result.confidence > 0.8 ? 'high' : 'medium'
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error processing CCTV frame:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { processCCTVFrame };
```

### Environment Variables

Add to your backend `.env`:

```bash
# Model API Configuration
MODEL_API_URL=http://localhost:8000
MODEL_API_TIMEOUT=30000
```

---

## Docker Deployment

### Build Docker Image

```bash
cd model/inference
docker build -t emerge-ai-api .
```

### Run Container

```bash
docker run -d \
  --name emerge-ai-api \
  -p 8000:8000 \
  -e PYTHONUNBUFFERED=1 \
  emerge-ai-api
```

### With GPU Support (NVIDIA)

```bash
docker run -d \
  --name emerge-ai-api \
  --gpus all \
  -p 8000:8000 \
  -e PYTHONUNBUFFERED=1 \
  emerge-ai-api
```

### Using Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Docker Compose with Backend Integration

```yaml
# Add to your backend docker-compose.yml

version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - MODEL_API_URL=http://model-api:8000
    depends_on:
      - model-api
      - postgres
    networks:
      - emerge-network

  model-api:
    build: ./model/inference
    ports:
      - "8000:8000"
    networks:
      - emerge-network

  postgres:
    image: postgres:15
    # ... postgres config
    networks:
      - emerge-network

networks:
  emerge-network:
    driver: bridge
```

---

## Production Setup

### 1. Environment Configuration

Create `production.env`:

```bash
# Server Config
API_HOST=0.0.0.0
API_PORT=8000
API_WORKERS=4

# Model Config
YOLO_MODEL_PATH=/app/models/yolov8s.pt
CNN_MODEL_PATH=/app/models/accident_detection_model.pth

# Detection Config
ENABLE_CNN_VERIFICATION=true
CNN_CONFIDENCE_THRESHOLD=0.70
FINAL_CONFIDENCE_THRESHOLD=0.70
ACCIDENT_COOLDOWN=30

# Security
CORS_ORIGINS=https://your-backend-domain.com
API_KEY_REQUIRED=true
```

### 2. Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/emerge-ai-api

upstream model_api {
    server localhost:8000;
}

server {
    listen 80;
    server_name api.emerge-ai.com;

    location / {
        proxy_pass http://model_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Increase timeout for video processing
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        
        # WebSocket support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 3. Systemd Service (Linux)

Create `/etc/systemd/system/emerge-ai-api.service`:

```ini
[Unit]
Description=EMERGE AI Accident Detection API
After=network.target

[Service]
Type=simple
User=emerge
WorkingDirectory=/opt/emerge-ai/model/inference
Environment="PATH=/opt/emerge-ai/venv/bin"
ExecStart=/opt/emerge-ai/venv/bin/gunicorn api_server:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --access-logfile /var/log/emerge-ai/access.log \
  --error-logfile /var/log/emerge-ai/error.log

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable emerge-ai-api
sudo systemctl start emerge-ai-api
sudo systemctl status emerge-ai-api
```

### 4. SSL/TLS (Certbot)

```bash
sudo certbot --nginx -d api.emerge-ai.com
```

---

## Monitoring

### 1. Health Monitoring

```bash
# Continuous health check
watch -n 5 'curl -s http://localhost:8000/health | jq'
```

### 2. Status Dashboard

```bash
# Get statistics
curl http://localhost:8000/status | jq
```

### 3. Log Monitoring

```bash
# Follow logs
tail -f /var/log/emerge-ai/error.log

# Docker logs
docker logs -f emerge-ai-api
```

### 4. Performance Metrics

Add Prometheus metrics (optional):

```python
# In api_server.py
from prometheus_fastapi_instrumentator import Instrumentator

@app.on_event("startup")
async def startup():
    Instrumentator().instrument(app).expose(app)
```

Access metrics: http://localhost:8000/metrics

---

## Troubleshooting

### Issue: Models Not Loading

**Symptoms**: API starts but returns 500 errors

**Solution**:
```bash
# Verify model files exist
ls -lh ../yolov8s.pt
ls -lh ../models/accident_detection_model.pth

# Check file permissions
chmod 644 ../yolov8s.pt
chmod 644 ../models/*.pth
```

### Issue: Slow Inference

**Symptoms**: Frame detection takes > 1 second

**Solutions**:
1. **Use GPU**:
   ```bash
   python -c "import torch; print(torch.cuda.is_available())"
   ```

2. **Reduce image size**:
   ```python
   # In backend, resize before sending
   resized = cv2.resize(frame, (640, 480))
   ```

3. **Disable CNN verification**:
   ```bash
   curl -X POST http://localhost:8000/config \
     -H "Content-Type: application/json" \
     -d '{"enable_cnn_verification": false}'
   ```

### Issue: Port Already in Use

**Solution**:
```bash
# Find process using port 8000
lsof -i :8000  # Linux/Mac
netstat -ano | findstr :8000  # Windows

# Kill process
kill -9 <PID>  # Linux/Mac
taskkill /PID <PID> /F  # Windows
```

### Issue: CORS Errors

**Solution**:
Update CORS settings in `api_server.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Out of Memory

**Solutions**:
1. Reduce batch size
2. Process fewer frames per second
3. Add memory limits:
   ```bash
   docker run --memory=4g emerge-ai-api
   ```

---

## Performance Optimization

### 1. GPU Acceleration

```bash
# Install PyTorch with CUDA
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# Verify GPU
python -c "import torch; print(torch.cuda.get_device_name(0))"
```

### 2. Model Optimization

```python
# Convert model to TorchScript for faster inference
import torch
from ultralytics import YOLO

model = YOLO('yolov8s.pt')
model.export(format='torchscript')
```

### 3. Batch Processing

For video processing, enable batch inference:
```python
# In api_server.py
results = model.track(frames_batch, batch_size=8)
```

---

## Security Considerations

### 1. API Key Authentication

Add to `api_server.py`:
```python
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader

API_KEY = "your-secret-key"
api_key_header = APIKeyHeader(name="X-API-Key")

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key

@app.post("/detect/frame", dependencies=[Security(verify_api_key)])
async def detect_frame(request: FrameRequest):
    # ... existing code
```

### 2. Rate Limiting

```bash
pip install slowapi

# In api_server.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/detect/frame")
@limiter.limit("10/minute")
async def detect_frame(request: Request, frame_request: FrameRequest):
    # ... existing code
```

---

## Support & Documentation

- **Full API Docs**: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Quick Start**: [README_API.md](README_API.md)
- **Interactive Docs**: http://localhost:8000/docs
- **Example Client**: [api_client_example.py](api_client_example.py)

---

**EMERGE AI** - Emergency Response System  
Model API v1.0.0
