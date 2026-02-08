# EMERGE-AI

End-to-end system flow (detailed)

Actors

AI camera / SOS device: sends accident detection to backend (no frontend involved)
Backend (Express + Prisma + Socket.IO): stores events, dispatches resources, emits realtime updates
Ambulance device/driver app: sends periodic status + GPS updates
Traffic signal system: state updated in DB + broadcasted via Socket.IO
1) Accident detected (backend-to-backend)
Caller: AI camera system or SOS trigger service
API: POST /api/accidents
Payload (typical):

latitude, longitude
severity
detectedBy (CAMERA / MANUAL)
optional confidence, cameraId
Backend actions:

Validate required fields.
If confidence exists and is below threshold, backend rejects/ignores it (prevents false positives).
Create an Accident row in DB (Accident table).
Realtime:

Socket.IO emits something like new_accident with the accident data for any dashboards/control rooms listening.
2) Backend triggers internal dispatch logic
Immediately after creating the accident, backend calls the internal service:

autoDispatch(accident) (in services/dispatchService.js)
Important behavior:

Idempotent: if the same accident is processed twice, it checks if a Dispatch already exists for that accidentId and returns the existing record (prevents unique constraint crash).
3) Backend assigns ambulance + hospital + route (automatic)
3.1 Choose ambulance (nearest available)
Query ambulances with status = "AVAILABLE".
Compute distance (using distanceKm) from accident location to each ambulance.
Pick the nearest.
Concurrency-safe reservation (critical):

Backend reserves the chosen ambulance atomically (only succeeds if it’s still AVAILABLE), then flips it to BUSY.
If another dispatch took it first, backend retries or returns “no available ambulance”.
3.2 Choose best hospital (distance + beds)
Use selectBestHospital(accident) to pick a hospital based on:
proximity
bed availability
Decrement hospital beds only if beds > 0 (prevents negative beds).
3.3 Create Dispatch record
Backend creates a Dispatch row:

accidentId (unique)
ambulanceId
hospitalId
timestamps
and route data if route generation succeeds:
routeProvider
routeDistanceKm
routeDurationSec
routeGeometry (GeoJSON polyline/LineString)
3.4 Route generation (ambulance → hospital)
Backend calls getRoute(...):

from: ambulance current lat/lng
to: selected hospital lat/lng
provider: OSRM (or fallback if unreachable)
4) Backend emits real-time updates (Socket.IO)
After dispatch is created:

Events broadcasted
EMERGENCY_STARTED
contains at least: accidentId, dispatchId, timestamp
AMBULANCE_ASSIGNED
contains: accidentId, ambulanceId, hospitalId
plus route object (provider, distance, duration, geometry)
Consumers (frontend dashboard/control room) can immediately:

show assigned ambulance/hospital
draw the route on the map
start listening for GPS updates
5) Ambulance starts moving → activates green corridor automatically
Caller: ambulance device/driver app
API: POST /api/ambulance-status
(Your server.js mounts ambulanceStatusRoutes exactly for this)

Payload examples

Start moving / continuous updates:
Backend actions

Update ambulance row:
status (normalized to uppercase)
latitude/longitude (only if present; does not overwrite with undefined)
Emit realtime updates:
AMBULANCE_STATUS_UPDATE { ambulanceId, status }
AMBULANCE_LOCATION_UPDATE { ambulanceId, latitude, longitude, status, ts }
If status === "EN_ROUTE" and location is available:
Call activeGreenCorridor(updatedAmbulance)
Green corridor logic

Load traffic signals from DB (TrafficSignal table).
For each signal, compute distance to ambulance.
If within activation radius (e.g., 0.3km):
Update signal state to "GREEN" (skips if already green)
Emit SIGNAL_GREEN { junctionId, state: "GREEN" }
This repeats for every GPS update, so the corridor “moves” with the ambulance.

6) Arrival & completion → reset signals
Caller: ambulance device
API: POST /api/ambulance-status
Payload:

Backend actions

Update ambulance status to "ARRIVED".
Emit AMBULANCE_STATUS_UPDATE.
Call resetSignals():
set all signals back to "NORMAL" (only those not normal)
emit SIGNAL_RESET { state: "NORMAL" }
At this point the “response cycle” ends (and you can optionally add:

set ambulance back to AVAILABLE after turnaround
close dispatch with endTime
restore/adjust hospital bed counts depending on patient logic)
Quick checklist: what you get now
✅ Automatic dispatch after accident creation
✅ Nearest ambulance selection + best hospital selection
✅ Automatic route generation stored in dispatch + sent via Socket.IO
✅ Real-time GPS tracking via Socket.IO
✅ Automatic green corridor activation on EN_ROUTE GPS updates
✅ Reset on ARRIVED