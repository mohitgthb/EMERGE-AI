# Webcam Detection - Quick Guide

## 🎥 Live Webcam Detection

The API now supports real-time accident detection from your PC's webcam!

---

## 🚀 Quick Start

### Option 1: Using the Web Interface (Easiest)

1. **Start the API Server:**
   ```bash
   cd model/inference
   python api_server.py
   ```

2. **Open the Webcam Client:**
   - Open `webcam_client.html` in your browser
   - Or navigate to: `file:///path/to/model/inference/webcam_client.html`

3. **Use the Interface:**
   - Click "Start Webcam" to activate your camera
   - Click "Capture & Detect" to analyze a single frame
   - Click "Start Continuous" for real-time monitoring
   - View results in the History tab

### Option 2: Using API Directly

#### Python Example

```python
import requests
import time

api = "http://localhost:8000"

# 1. Start webcam
response = requests.post(f"{api}/webcam/start")
print(response.json())

# 2. Capture and detect single frame
result = requests.post(f"{api}/webcam/detect").json()
print(f"Accident detected: {result['accident_detected']}")
print(f"Vehicles: {len(result['vehicles'])}")

# 3. Start continuous detection
requests.post(f"{api}/webcam/continuous/start?fps=5")
print("Continuous detection started...")

# 4. Run for 60 seconds
time.sleep(60)

# 5. Get detected accidents
history = requests.get(f"{api}/accidents/history").json()
print(f"\nTotal accidents detected: {len(history['accidents'])}")
for acc in history['accidents']:
    print(f"  - {acc['id']}: {acc['confidence']:.2f} confidence")

# 6. Stop everything
requests.post(f"{api}/webcam/continuous/stop")
requests.post(f"{api}/webcam/stop")
print("\nWebcam stopped")
```

#### Node.js Example

```javascript
const axios = require('axios');

const api = axios.create({ baseURL: 'http://localhost:8000' });

async function runWebcamDetection() {
    try {
        // Start webcam
        await api.post('/webcam/start');
        console.log('✅ Webcam started');
        
        // Start continuous detection at 5 FPS
        await api.post('/webcam/continuous/start?fps=5');
        console.log('▶️ Continuous detection started');
        
        // Poll for accidents every 5 seconds
        const checkInterval = setInterval(async () => {
            const history = await api.get('/accidents/history?limit=1');
            const latest = history.data.accidents[0];
            
            if (latest) {
                console.log(`🚨 Accident: ${latest.id}`);
                // Trigger your emergency response here
            }
        }, 5000);
        
        // Run for 2 minutes
        setTimeout(async () => {
            clearInterval(checkInterval);
            await api.post('/webcam/continuous/stop');
            await api.post('/webcam/stop');
            console.log('🛑 Detection stopped');
        }, 120000);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

runWebcamDetection();
```

#### cURL Example

```bash
# Start webcam
curl -X POST http://localhost:8000/webcam/start

# Check status
curl http://localhost:8000/webcam/status

# Capture and detect single frame
curl -X POST http://localhost:8000/webcam/detect

# Start continuous detection
curl -X POST "http://localhost:8000/webcam/continuous/start?fps=5"

# Check for accidents (in another terminal)
curl http://localhost:8000/accidents/history

# Stop continuous detection
curl -X POST http://localhost:8000/webcam/continuous/stop

# Stop webcam
curl -X POST http://localhost:8000/webcam/stop
```

---

## 📋 Available Endpoints

### Webcam Control

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webcam/start` | POST | Start webcam capture |
| `/webcam/stop` | POST | Stop webcam capture |
| `/webcam/status` | GET | Get webcam status |

### Detection

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webcam/detect` | POST | Analyze single frame |
| `/webcam/frame` | GET | Get raw frame (base64) |
| `/webcam/continuous/start` | POST | Start continuous detection |
| `/webcam/continuous/stop` | POST | Stop continuous detection |

---

## ⚙️ Configuration

### Camera Selection

Use a different camera:
```bash
curl -X POST "http://localhost:8000/webcam/start?camera_id=1"
```

### Detection FPS

Adjust processing speed (lower = less CPU, higher = more responsive):
```bash
# 5 FPS (recommended for real-time)
curl -X POST "http://localhost:8000/webcam/continuous/start?fps=5"

# 10 FPS (higher CPU usage)
curl -X POST "http://localhost:8000/webcam/continuous/start?fps=10"

# 2 FPS (lower CPU usage)
curl -X POST "http://localhost:8000/webcam/continuous/start?fps=2"
```

---

## 🎯 Usage Scenarios

### Scenario 1: Single Frame Analysis

**Use Case:** You want to analyze one specific moment.

```python
import requests

api = "http://localhost:8000"

# Start webcam
requests.post(f"{api}/webcam/start")

# Capture and analyze
result = requests.post(f"{api}/webcam/detect").json()

if result['accident_detected']:
    print(f"🚨 ACCIDENT! ID: {result['accident_id']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Vehicles: {len(result['vehicles'])}")
    
    # Send alert to your backend
    send_emergency_alert(result)

# Stop webcam
requests.post(f"{api}/webcam/stop")
```

### Scenario 2: Continuous Monitoring

**Use Case:** Monitor continuously and respond to any detected accidents.

```python
import requests
import time

api = "http://localhost:8000"

# Start webcam and continuous detection
requests.post(f"{api}/webcam/start")
requests.post(f"{api}/webcam/continuous/start?fps=5")

print("🎥 Monitoring started. Press Ctrl+C to stop...")

processed_ids = set()

try:
    while True:
        # Check for new accidents every 3 seconds
        history = requests.get(f"{api}/accidents/history?limit=5").json()
        
        for accident in history['accidents']:
            acc_id = accident['id']
            
            if acc_id not in processed_ids:
                processed_ids.add(acc_id)
                
                print(f"\n🚨 NEW ACCIDENT DETECTED!")
                print(f"ID: {acc_id}")
                print(f"Time: {accident['timestamp']}")
                print(f"Confidence: {accident['confidence']:.2f}")
                
                # Your emergency response logic here
                trigger_emergency_response(accident)
        
        time.sleep(3)

except KeyboardInterrupt:
    print("\n\n🛑 Stopping...")
    requests.post(f"{api}/webcam/continuous/stop")
    requests.post(f"{api}/webcam/stop")
    print("✅ Stopped")
```

### Scenario 3: Testing/Demo Mode

**Use Case:** Quick demo to show the system working.

1. Open `webcam_client.html` in browser
2. Click "Start Webcam"
3. Click "Start Continuous"
4. Simulate an accident (show stopped vehicles/traffic)
5. Watch for alerts in the History tab

---

## 🔧 Troubleshooting

### Webcam Not Starting

**Error:** `Failed to open camera 0`

**Solutions:**
1. Check if another app is using the webcam
2. Try a different camera ID:
   ```bash
   curl -X POST "http://localhost:8000/webcam/start?camera_id=1"
   ```
3. Check camera permissions (Windows Settings > Privacy > Camera)

### Continuous Detection Not Detecting

**Issue:** No accidents detected despite vehicles present

**Solutions:**
1. **Lower thresholds:**
   ```bash
   curl -X POST http://localhost:8000/config \
     -H "Content-Type: application/json" \
     -d '{"final_confidence_threshold": 0.5}'
   ```

2. **Ensure vehicles are stopped for >2.5 seconds**

3. **Check detection status:**
   ```bash
   curl http://localhost:8000/status
   ```

### High CPU Usage

**Issue:** CPU usage too high during continuous detection

**Solutions:**
1. **Reduce FPS:**
   ```bash
   curl -X POST "http://localhost:8000/webcam/continuous/start?fps=2"
   ```

2. **Disable CNN verification:**
   ```bash
   curl -X POST http://localhost:8000/config \
     -H "Content-Type: application/json" \
     -d '{"enable_cnn_verification": false}'
   ```

3. **Use GPU if available**

---

## 📊 Performance Tips

### For Real-Time Detection

- Use **5 FPS** for good balance
- Enable CNN verification for accuracy
- Use GPU if available

### For Lower CPU Usage

- Use **2-3 FPS**
- Disable CNN verification
- Use smaller camera resolution

### For Maximum Accuracy

- Use **10 FPS**
- Enable CNN verification
- Use higher confidence thresholds

---

## 🔗 Integration with Backend

### WebSocket Alternative (Future Enhancement)

For true real-time streaming, consider:

```javascript
// Future: WebSocket implementation
const ws = new WebSocket('ws://localhost:8000/webcam/stream');

ws.onmessage = (event) => {
    const result = JSON.parse(event.data);
    if (result.accident_detected) {
        handleEmergency(result);
    }
};
```

### Current Best Practice: Polling

```javascript
const axios = require('axios');

const api = axios.create({ baseURL: 'http://localhost:8000' });

// Start detection
await api.post('/webcam/start');
await api.post('/webcam/continuous/start?fps=5');

// Poll every 5 seconds
const checkInterval = setInterval(async () => {
    const history = await api.get('/accidents/history?limit=1');
    const latest = history.data.accidents[0];
    
    if (latest && isNew(latest.id)) {
        await handleEmergency(latest);
    }
}, 5000);
```

---

## 📚 Additional Resources

- **Full API Docs:** [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Deployment Guide:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Interactive Docs:** http://localhost:8000/docs

---

## ✅ Summary

**Three Ways to Use Webcam Detection:**

1. **Web Interface** - `webcam_client.html` (easiest)
2. **Single Frame API** - `/webcam/detect` (manual control)
3. **Continuous API** - `/webcam/continuous/start` (automatic monitoring)

**Choose Based On:**
- **Testing/Demo:** Use web interface
- **Controlled capture:** Use single frame API
- **Real-time monitoring:** Use continuous API

---

**EMERGE AI** - Emergency Response System  
Live Webcam Detection v1.0.0 ✅
