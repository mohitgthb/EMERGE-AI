# 🚑 EMERGE-AI

**Emergency Response Management System with AI-powered dispatch and green corridor automation**

An intelligent emergency response system that automatically detects accidents, dispatches the nearest ambulance, selects the optimal hospital, generates navigation routes, and creates dynamic green corridors for ambulances in real-time.

---

## 🎯 Features

- ✅ **Automatic accident detection** via AI cameras or SOS triggers
- ✅ **Intelligent dispatch** - nearest ambulance + best hospital selection
- ✅ **Automatic route generation** using OSRM routing engine
- ✅ **Real-time GPS tracking** with live location updates
- ✅ **Dynamic green corridor** - traffic signals automatically turn green as ambulance approaches
- ✅ **Concurrent-safe operations** - atomic reservations prevent double-booking
- ✅ **Real-time updates** via Socket.IO for dashboards and control rooms

---

## 🏗️ Architecture

### System Actors

| Actor | Role |
|-------|------|
| **AI Camera / SOS Device** | Detects accidents and sends alerts to backend (backend-to-backend) |
| **Backend** | Express + Prisma + Socket.IO - stores events, dispatches resources, emits real-time updates |
| **Ambulance Device/App** | Sends periodic status + GPS updates from driver/vehicle |
| **Traffic Signal System** | State updated in DB and broadcasted via Socket.IO |
| **Dashboard/Control Room** | Frontend listening to Socket.IO events for real-time monitoring |

### Tech Stack

**Backend:**
- Node.js + Express
- Prisma ORM + PostgreSQL
- Socket.IO (real-time communication)
- OSRM (route generation)

---

## 🔄 End-to-End Flow

### 1️⃣ Accident Detected

**Caller:** AI camera system or SOS trigger service  
**Endpoint:** `POST /api/accidents`

**Request Payload:**
```json
{
  "latitude": 28.6139,
  "longitude": 77.2090,
  "severity": "HIGH",
  "detectedBy": "CAMERA",
  "confidence": 0.92,
  "cameraId": "CAM_12"
}
```

**Backend Actions:**
1. Validates required fields (`latitude`, `longitude`, `severity`, `detectedBy`)
2. Filters low-confidence detections (< 0.6) to prevent false positives
3. Creates `Accident` record in database
4. **Emits Socket.IO:** `"new_accident"` event with accident data

---

### 2️⃣ Automatic Dispatch Triggered

Immediately after accident creation, backend calls:
```javascript
autoDispatch(accident) // services/dispatchService.js
```

**Key Features:**
- **Idempotent:** Checks if dispatch already exists for this `accidentId`
- **Returns existing dispatch** if found (prevents duplicate/crash)

---

### 3️⃣ Resource Assignment (Ambulance + Hospital + Route)

#### 3.1 Select Nearest Available Ambulance

1. Query all ambulances with `status = "AVAILABLE"`
2. Calculate distance from accident to each ambulance using `distanceKm()`
3. Select nearest ambulance
4. **Atomic reservation:** Updates ambulance to `"BUSY"` only if still `AVAILABLE`
5. Retries if ambulance was taken by concurrent request

#### 3.2 Select Best Hospital

Uses `selectBestHospital(accident)` algorithm:
- Factors: **proximity** + **bed availability**
- Scoring: `score = distance - (beds × 0.01)`
- **Safe decrement:** Only decrements beds if `beds > 0` (prevents negatives)

#### 3.3 Generate Navigation Route

Calls `getRoute()` from routing service:
- **From:** Ambulance current location
- **To:** Selected hospital location
- **Provider:** OSRM (public routing API)
- **Fallback:** Straight-line distance if OSRM unavailable

**Route Data:**
```javascript
{
  provider: "OSRM",
  distanceKm: 3.45,
  durationSec: 420,
  geometry: { type: "LineString", coordinates: [...] }
}
```

#### 3.4 Create Dispatch Record

Database transaction creates `Dispatch` with:
- `accidentId` (unique)
- `ambulanceId`
- `hospitalId`
- `routeProvider`, `routeDistanceKm`, `routeDurationSec`, `routeGeometry`
- Timestamps

---

### 4️⃣ Real-time Updates Broadcasted

**Socket.IO Events Emitted:**

| Event | Payload | Purpose |
|-------|---------|---------|
| `EMERGENCY_STARTED` | `{ accidentId, dispatchId, timestamp }` | Emergency initiated |
| `AMBULANCE_ASSIGNED` | `{ accidentId, ambulanceId, hospitalId, route }` | Assignment complete with route |

**Dashboard/Control Room Actions:**
- Display assigned ambulance and hospital
- Render route on map
- Start listening for GPS updates

---

### 5️⃣ Ambulance En-Route → Green Corridor Activation

**Caller:** Ambulance device/driver app  
**Endpoint:** `POST /api/ambulance-status`

**Request (continuous GPS updates every 1-5 seconds):**
```json
{
  "ambulanceId": "uuid",
  "status": "EN_ROUTE",
  "latitude": 28.6140,
  "longitude": 77.2091
}
```

**Backend Actions:**

1. **Update Ambulance:**
   - `status` → normalized to uppercase
   - `latitude`, `longitude` → updated (only if provided)

2. **Emit Real-time Events:**
   ```javascript
   AMBULANCE_STATUS_UPDATE: { ambulanceId, status }
   AMBULANCE_LOCATION_UPDATE: { ambulanceId, latitude, longitude, status, timestamp }
   ```

3. **Activate Green Corridor:**
   - Calls `activeGreenCorridor(ambulance)`
   - Loads all traffic signals from database
   - Calculates distance to each signal
   - If within **activation radius (0.3 km)**:
     - Updates signal state to `"GREEN"` (atomic, skips if already green)
     - Emits `SIGNAL_GREEN` event: `{ junctionId, state: "GREEN" }`

**Result:** Green corridor "moves" with ambulance as GPS updates continue

---

### 6️⃣ Arrival & Completion

**Caller:** Ambulance device/driver app  
**Endpoint:** `POST /api/ambulance-status`

**Request:**
```json
{
  "ambulanceId": "uuid",
  "status": "ARRIVED"
}
```

**Backend Actions:**

1. Update ambulance status to `"ARRIVED"`
2. Emit `AMBULANCE_STATUS_UPDATE`
3. **Reset all traffic signals:**
   - Calls `resetSignals()`
   - Sets all non-NORMAL signals back to `"NORMAL"`
   - Emits `SIGNAL_RESET` event: `{ state: "NORMAL" }`

**Response cycle complete.**

---

## 📡 API Endpoints

### Accident Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/accidents` | Create accident (triggers auto-dispatch) |

### Ambulance Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ambulances` | Register new ambulance |
| `POST` | `/api/ambulance-status` | Update ambulance status + GPS (flow endpoint) |
| `PUT` | `/api/ambulances/status` | Alternative status update endpoint |

### Manual Dispatch

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/dispatch` | Manually create dispatch for accident |

---

## 🔌 Socket.IO Events

### Events Emitted by Backend

| Event | When | Payload |
|-------|------|---------|
| `new_accident` | Accident detected | `{ id, latitude, longitude, severity, ... }` |
| `EMERGENCY_STARTED` | Dispatch created | `{ accidentId, dispatchId, timestamp }` |
| `AMBULANCE_ASSIGNED` | Resources assigned | `{ accidentId, ambulanceId, hospitalId, route }` |
| `AMBULANCE_STATUS_UPDATE` | Status changed | `{ ambulanceId, status }` |
| `AMBULANCE_LOCATION_UPDATE` | GPS update | `{ ambulanceId, latitude, longitude, status, timestamp }` |
| `SIGNAL_GREEN` | Signal activated | `{ junctionId, state: "GREEN" }` |
| `SIGNAL_RESET` | Signals reset | `{ state: "NORMAL" }` |

---

## 🔐 Concurrency Safety

### Atomic Operations
- **Ambulance reservation:** Uses `updateMany` with condition `status = "AVAILABLE"`
- **Hospital bed decrement:** Only decrements if `beds > 0`
- **Idempotent dispatch:** Returns existing if `accidentId` already dispatched
- **Retry logic:** Automatically retries on race conditions (max 3 attempts)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (for native `fetch` support)
- PostgreSQL database
- npm/yarn

### Installation

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run Prisma migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Start server
npm start
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/emerge_ai"
PORT=5000
OSRM_BASE_URL="http://router.project-osrm.org"
```

---

## 📊 Database Schema

### Core Models
- **Accident** - accident events with location and metadata
- **Ambulance** - ambulance fleet with status and location
- **Hospital** - hospitals with bed availability
- **Dispatch** - dispatch records linking accident → ambulance → hospital with route
- **TrafficSignal** - traffic signal locations and states

---

## 🎯 Key Features Checklist

- ✅ Automatic dispatch after accident creation
- ✅ Nearest ambulance selection + best hospital selection
- ✅ Automatic route generation stored in dispatch + sent via Socket.IO
- ✅ Real-time GPS tracking via Socket.IO
- ✅ Automatic green corridor activation on EN_ROUTE GPS updates
- ✅ Concurrent-safe resource reservation (no double-booking)
- ✅ Idempotent operations (safe retries)
- ✅ Reset on ARRIVED

---

## 📝 License


---

## 👥 Contributors


