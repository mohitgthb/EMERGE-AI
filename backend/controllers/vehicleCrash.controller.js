/**
 * Vehicle Crash Alert Controller
 *
 * Handles connected-vehicle crash reports (airbag-deploy events).
 * - Creates VehicleCrash record
 * - Creates Accident (source = VEHICLE_SENSOR, bypasses AI verification)
 * - Triggers immediate high-confidence dispatch
 * - Emits VEHICLE_CRASH_DETECTED + DISPATCH_CREATED socket events
 * - Idempotent: deduplicates crashes from the same vehicle within 5-min window
 * - Supports cancel window (few seconds after trigger)
 */

const prisma = require("../config/db");
const { dispatchEmergency } = require("../services/emergencyDispatchService");
const socket = require("../socket");
const { onNewIncident } = require("../services/predictiveReadinessService");

// ── Dedup window: 5 minutes ──────────────────────────────────────────────────
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
// Cancel window: 10 seconds after creation
const CANCEL_WINDOW_MS = 10 * 1000;

/**
 * Generate idempotency key: vehicleRegNo + 5-min bucket
 */
function makeIdempotencyKey(vehicleRegNo, timestamp) {
  const bucket = Math.floor(new Date(timestamp).getTime() / DEDUP_WINDOW_MS);
  return `crash_${vehicleRegNo}_${bucket}`;
}

/**
 * POST /api/vehicle/crash
 *
 * Body: { vehicleId, latitude, longitude, severity, airbagDeployed, timestamp }
 */
exports.triggerCrash = async (req, res) => {
  try {
    const {
      vehicleId,
      latitude,
      longitude,
      severity = "HIGH",
      airbagDeployed = true,
      timestamp,
    } = req.body;

    // ── Validation ────────────────────────────────────────────────
    if (!vehicleId || typeof vehicleId !== "string" || vehicleId.trim().length === 0) {
      return res.status(400).json({ message: "vehicleId is required" });
    }
    if (!airbagDeployed) {
      return res.status(400).json({ message: "Airbag must be deployed to trigger crash alert" });
    }

    const vehicleRegNo = vehicleId.trim().toUpperCase();
    const ts = timestamp ? new Date(timestamp) : new Date();

    // Fallback GPS: use Pune center if missing
    const lat = typeof latitude === "number" && isFinite(latitude) ? latitude : 18.5204;
    const lng = typeof longitude === "number" && isFinite(longitude) ? longitude : 73.8567;
    const gpsAvailable = typeof latitude === "number" && typeof longitude === "number";

    const validSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const sev = validSeverities.includes(severity?.toUpperCase()) ? severity.toUpperCase() : "HIGH";

    // ── Idempotency check ─────────────────────────────────────────
    const idempotencyKey = makeIdempotencyKey(vehicleRegNo, ts);

    const existing = await prisma.vehicleCrash.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return res.status(409).json({
        message: "Duplicate crash report — already processed within 5-minute window",
        crashId: existing.id,
        accidentId: existing.accidentId,
        dispatchId: existing.dispatchId,
        status: existing.status,
      });
    }

    // ── Create VehicleCrash record ────────────────────────────────
    const crash = await prisma.vehicleCrash.create({
      data: {
        vehicleRegNo,
        latitude: lat,
        longitude: lng,
        severity: sev,
        airbagDeployed: true,
        source: "VEHICLE_SENSOR",
        status: "REPORTED",
        idempotencyKey,
        createdAt: ts,
      },
    });

    // ── Create Accident (high-confidence, bypasses AI queue) ──────
    const accident = await prisma.accident.create({
      data: {
        latitude: lat,
        longitude: lng,
        severity: sev,
        detectedBy: "VEHICLE_SENSOR",
        confidence: 1.0, // High-confidence — bypasses AI verification
        cameraId: null,
        emergencyType: "ACCIDENT",
      },
    });

    // Link accident to crash
    await prisma.vehicleCrash.update({
      where: { id: crash.id },
      data: { accidentId: accident.id },
    });

    // ── Emit VEHICLE_CRASH_DETECTED ──────────────────────────────
    const io = socket.getIO();

    io.emit("VEHICLE_CRASH_DETECTED", {
      crashId: crash.id,
      accidentId: accident.id,
      vehicleRegNo,
      latitude: lat,
      longitude: lng,
      severity: sev,
      airbagDeployed: true,
      gpsAvailable,
      source: "VEHICLE_SENSOR",
      timestamp: ts.toISOString(),
    });

    io.emit("new_accident", {
      ...accident,
      detectedBy: "VEHICLE_SENSOR",
    });

    // ── Police notification ──────────────────────────────────────
    io.emit("POLICE_ALERT", {
      type: "VEHICLE_CRASH",
      crashId: crash.id,
      accidentId: accident.id,
      vehicleRegNo,
      latitude: lat,
      longitude: lng,
      severity: sev,
      message: `Vehicle crash alert: ${vehicleRegNo} — Airbag deployed. Severity: ${sev}`,
      timestamp: ts.toISOString(),
    });

    // ── Immediate dispatch (bypasses queue) ───────────────────────
    let dispatch = null;
    try {
      dispatch = await dispatchEmergency({
        accident,
        type: "ACCIDENT",
        emergencyType: "ACCIDENT",
        priority: "HIGH",
      });

      if (dispatch) {
        await prisma.vehicleCrash.update({
          where: { id: crash.id },
          data: { status: "DISPATCHED", dispatchId: dispatch.id },
        });

        io.emit("DISPATCH_CREATED", {
          dispatchId: dispatch.id,
          accidentId: accident.id,
          crashId: crash.id,
          source: "VEHICLE_SENSOR",
          vehicleRegNo,
          timestamp: new Date().toISOString(),
        });

        io.emit("EMERGENCY_STARTED", {
          accidentId: accident.id,
          dispatchId: dispatch.id,
          source: "VEHICLE_SENSOR",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (dispatchErr) {
      console.error("[VehicleCrash] Dispatch failed:", dispatchErr.message);
      // Crash is still recorded even if dispatch fails
    }

    // ── Trigger predictive recalc ────────────────────────────────
    try {
      onNewIncident();
    } catch (_) {}

    res.status(201).json({
      message: "Crash alert processed — emergency dispatched",
      crash: {
        ...crash,
        accidentId: accident.id,
        dispatchId: dispatch?.id || null,
        status: dispatch ? "DISPATCHED" : "REPORTED",
      },
      accident,
      dispatch,
      cancelWindowMs: CANCEL_WINDOW_MS,
      gpsAvailable,
    });
  } catch (err) {
    console.error("[VehicleCrash] Error:", err);
    res.status(500).json({ message: "Failed to process crash alert", error: err.message });
  }
};

/**
 * POST /api/vehicle/crash/:id/cancel
 *
 * Cancels a crash report within the cancel window (10s).
 */
exports.cancelCrash = async (req, res) => {
  try {
    const { id } = req.params;

    const crash = await prisma.vehicleCrash.findUnique({ where: { id } });
    if (!crash) {
      return res.status(404).json({ message: "Crash report not found" });
    }

    if (crash.status === "CANCELLED") {
      return res.status(400).json({ message: "Already cancelled" });
    }

    // Check cancel window
    const elapsed = Date.now() - new Date(crash.createdAt).getTime();
    if (elapsed > CANCEL_WINDOW_MS) {
      return res.status(400).json({
        message: "Cancel window expired",
        elapsedMs: elapsed,
        windowMs: CANCEL_WINDOW_MS,
      });
    }

    // Cancel the crash
    await prisma.vehicleCrash.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    const io = socket.getIO();
    io.emit("VEHICLE_CRASH_CANCELLED", {
      crashId: id,
      accidentId: crash.accidentId,
      vehicleRegNo: crash.vehicleRegNo,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: "Crash alert cancelled", crashId: id });
  } catch (err) {
    console.error("[VehicleCrash] Cancel error:", err);
    res.status(500).json({ message: "Failed to cancel crash alert", error: err.message });
  }
};

/**
 * GET /api/vehicle/crashes
 *
 * List all crash reports, most recent first.
 */
exports.listCrashes = async (req, res) => {
  try {
    const crashes = await prisma.vehicleCrash.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(crashes);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch crash reports", error: err.message });
  }
};

/**
 * GET /api/vehicle/crash/:id
 *
 * Get single crash report.
 */
exports.getCrash = async (req, res) => {
  try {
    const crash = await prisma.vehicleCrash.findUnique({
      where: { id: req.params.id },
    });
    if (!crash) return res.status(404).json({ message: "Not found" });
    res.json(crash);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch crash report", error: err.message });
  }
};
