const prisma = require("../config/db");
const { autoDispatch } = require("../services/dispatchService");
const socket = require("../socket");

/**
 * AUTOMATIC EMERGENCY RESPONSE FLOW:
 * 
 * 1️⃣ Accident detected → POST /api/accidents
 *    AI camera system or SOS button sends backend-to-backend call
 * 
 * 2️⃣ Backend creates accident event
 *    - Validates required fields (latitude, longitude, severity, detectedBy)
 *    - Filters low confidence detections (< 0.6)
 *    - Stores accident in database
 *    - Triggers automatic dispatch (autoDispatch service)
 * 
 * 3️⃣ Backend assigns ambulance & hospital (autoDispatch service)
 *    - Checks for existing dispatch (idempotent)
 *    - Finds nearest available ambulance
 *    - Selects best hospital (distance + beds)
 *    - Generates route using OSRM (or straight-line fallback)
 *    - Creates dispatch record with route data
 *    - Sets ambulance status to BUSY
 *    - Decrements hospital bed count
 * 
 * 4️⃣ Backend emits real-time updates (Socket.IO)
 *    - "new_accident" event with accident data
 *    - "EMERGENCY_STARTED" event (emergency initiated)
 *    - "AMBULANCE_ASSIGNED" event with dispatch + route details
 * 
 * 5️⃣ Ambulance starts moving → POST /api/ambulance-status
 *    Driver/device sends { ambulanceId, status: "EN_ROUTE", latitude, longitude }
 *    - Updates ambulance location in DB
 *    - Emits "AMBULANCE_STATUS_UPDATE" event
 *    - Emits "AMBULANCE_LOCATION_UPDATE" event (real-time GPS)
 *    - Activates green corridor automatically for nearby signals
 *    - Emits "SIGNAL_GREEN" events for activated signals
 * 
 * 6️⃣ Arrival & completion → POST /api/ambulance-status
 *    Driver/device sends { ambulanceId, status: "ARRIVED" }
 *    - Updates ambulance status
 *    - Resets all traffic signals to NORMAL
 *    - Emits "SIGNAL_RESET" event
 *    - Emergency response cycle complete
 */

exports.createAccident = async (req, res) => {
    const { latitude, longitude, severity, detectedBy, confidence, cameraId } = req.body;

    if (latitude == null || longitude == null || !severity || !detectedBy) {
        return res.status(400).json({ message: "Missing required fields: latitude, longitude, severity, detectedBy" });
    }

    if (confidence && confidence < 0.6) {
        return res.status(200).json({ message: "Low confidence, ignored" });
    }

    const accident = await prisma.accident.create({
        data: {
            latitude,
            longitude,
            severity,
            detectedBy,
            confidence,
            cameraId
        }
    });

    const dispatch = await autoDispatch(accident);

    socket.getIO().emit("new_accident", accident);

    if (dispatch) {
        // Emit EMERGENCY_STARTED event
        socket.getIO().emit("EMERGENCY_STARTED", {
            accidentId: accident.id,
            dispatchId: dispatch.id,
            timestamp: new Date().toISOString(),
        });

        // Emit AMBULANCE_ASSIGNED event with full details
        socket.getIO().emit("AMBULANCE_ASSIGNED", {
            accidentId: accident.id,
            dispatchId: dispatch.id,
            ambulanceId: dispatch.ambulanceId,
            hospitalId: dispatch.hospitalId,
            route: {
                provider: dispatch.routeProvider,
                distanceKm: dispatch.routeDistanceKm,
                durationSec: dispatch.routeDurationSec,
                geometry: dispatch.routeGeometry,
            }
        });
    }

    res.status(201).json({ accident, dispatch });
};
