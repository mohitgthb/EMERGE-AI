/**
 * Demo Simulation Service
 * 
 * Simulates vehicle movement along real dispatch routes using actual database
 * records. No fake incidents — only real dispatches with route geometry.
 * 
 * Features:
 *  - Deterministic coordinate playback from route geometry
 *  - Synchronized socket updates (VEHICLE_LOCATION_UPDATE)
 *  - Automatic status lifecycle: ACCEPTED → EN_ROUTE → ARRIVED → COMPLETED
 *  - Green corridor activation/deactivation tied to EN_ROUTE status
 *  - Accurate ETA calculation based on simulated speed
 *  - Support for multiple simultaneous vehicles
 *  - Safe toggling: simulation never overwrites real tracking when disabled
 */

const prisma = require("../config/db");
const socket = require("../socket");
const { activeGreenCorridor, resetSignals } = require("./greenCorridor");

// ── state ───────────────────────────────────────────────────────────────────

let demoModeEnabled = false;

/** @type {Map<string, SimulationContext>} dispatchId → running simulation */
const activeSimulations = new Map();

/**
 * @typedef {Object} SimulationContext
 * @property {string}   dispatchId
 * @property {string}   dispatchType   "ACCIDENT" | "FIRE" | "POLICE"
 * @property {string}   vehicleId
 * @property {string}   vehicleType    "AMBULANCE" | "FIRE_BRIGADE" | "POLICE"
 * @property {string}   vehicleNo
 * @property {string}   hospitalId
 * @property {[number,number][]}  routeCoords  [lng, lat][] from GeoJSON
 * @property {[number,number][]}  hospitalRouteCoords
 * @property {number}   currentIndex   pointer into routeCoords
 * @property {string}   phase          "TO_INCIDENT" | "AT_INCIDENT" | "TO_HOSPITAL" | "COMPLETED"
 * @property {NodeJS.Timeout|null} timer
 * @property {number}   speedMs        interval between coordinate updates
 * @property {number}   totalRoutePoints
 * @property {number}   startTimestamp
 * @property {boolean}  cancelled
 * @property {number}   etaSeconds
 * @property {{ lat: number, lng: number } | null}  lastEmittedPos  dedup guard
 */

// ── helpers ─────────────────────────────────────────────────────────────────

function extractCoords(geometry) {
  if (!geometry) return [];
  const coords = geometry.coordinates || geometry;
  if (!Array.isArray(coords) || coords.length === 0) return [];
  // coords are [lng, lat] pairs from GeoJSON
  return coords.filter(
    (c) => Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1])
  );
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function polylineDistanceKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return total;
}

/**
 * Subsample a coordinate array so that we get roughly one point per
 * `intervalMs` at the given `durationSec` pace, but cap at a sensible limit.
 */
function subsampleCoords(coords, durationSec, intervalMs) {
  if (!coords.length) return [];
  const steps = Math.max(1, Math.round((durationSec * 1000) / intervalMs));
  if (coords.length <= steps) return coords;
  const out = [];
  for (let i = 0; i < steps; i++) {
    const idx = Math.round((i / (steps - 1)) * (coords.length - 1));
    out.push(coords[idx]);
  }
  // always include the last point
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// ── public API ──────────────────────────────────────────────────────────────

function isDemoMode() {
  return demoModeEnabled;
}

function setDemoMode(enabled) {
  demoModeEnabled = !!enabled;
  if (!demoModeEnabled) {
    stopAllSimulations();
  }
  const io = socket.getIO();
  io.emit("DEMO_MODE_CHANGED", { enabled: demoModeEnabled, timestamp: new Date().toISOString() });
  console.log(`[DemoSim] Demo mode ${demoModeEnabled ? "ENABLED" : "DISABLED"}`);
}

function getActiveSimulations() {
  const list = [];
  for (const [dispatchId, ctx] of activeSimulations) {
    list.push({
      dispatchId,
      dispatchType: ctx.dispatchType,
      vehicleId: ctx.vehicleId,
      vehicleType: ctx.vehicleType,
      vehicleNo: ctx.vehicleNo,
      phase: ctx.phase,
      progress: ctx.totalRoutePoints > 0
        ? Math.round((ctx.currentIndex / ctx.totalRoutePoints) * 100)
        : 0,
      etaSeconds: ctx.etaSeconds,
      startTimestamp: ctx.startTimestamp,
    });
  }
  return { enabled: demoModeEnabled, simulations: list };
}

/**
 * Start simulation for a specific dispatch.
 * Uses real dispatch data + route geometry from the database.
 */
async function startSimulation(dispatchId, options = {}) {
  if (!demoModeEnabled) {
    throw new Error("Demo mode is not enabled");
  }

  if (activeSimulations.has(dispatchId)) {
    throw new Error(`Simulation already running for dispatch ${dispatchId}`);
  }

  // Resolve the dispatch type and load full record
  const [accDisp, fireDisp, policeDisp] = await Promise.all([
    prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: { accident: true, ambulance: true, hospital: true },
    }),
    prisma.fireDispatch.findUnique({
      where: { id: dispatchId },
      include: { fireIncident: true, fireBrigade: true },
    }),
    prisma.policeDispatch.findUnique({
      where: { id: dispatchId },
      include: { sosEvent: true, policeUnit: true },
    }),
  ]);

  const dispatch = accDisp || fireDisp || policeDisp;
  if (!dispatch) throw new Error("Dispatch not found");

  let vehicleId, vehicleType, vehicleNo, hospitalId, incidentLat, incidentLng;
  let routeGeometry, hospitalRouteGeometry, durationSec, hospitalDurationSec;

  if (accDisp) {
    vehicleId = accDisp.ambulanceId;
    vehicleType = "AMBULANCE";
    vehicleNo = accDisp.ambulance?.vehicleNo || "AMB-SIM";
    hospitalId = accDisp.hospitalId;
    incidentLat = accDisp.accident.latitude;
    incidentLng = accDisp.accident.longitude;
    routeGeometry = accDisp.routeGeometry;
    hospitalRouteGeometry = accDisp.hospitalRouteGeometry;
    durationSec = accDisp.routeDurationSec;
    hospitalDurationSec = accDisp.hospitalRouteDurationSec;
  } else if (fireDisp) {
    vehicleId = fireDisp.fireBrigadeId;
    vehicleType = "FIRE_BRIGADE";
    vehicleNo = fireDisp.fireBrigade?.vehicleNo || "FB-SIM";
    hospitalId = null;
    incidentLat = fireDisp.fireIncident.latitude;
    incidentLng = fireDisp.fireIncident.longitude;
    routeGeometry = fireDisp.routeGeometry;
    hospitalRouteGeometry = null;
    durationSec = fireDisp.routeDurationSec;
    hospitalDurationSec = null;
  } else {
    vehicleId = policeDisp.policeUnitId;
    vehicleType = "POLICE";
    vehicleNo = policeDisp.policeUnit?.vehicleNo || "PU-SIM";
    hospitalId = null;
    incidentLat = policeDisp.sosEvent.latitude;
    incidentLng = policeDisp.sosEvent.longitude;
    routeGeometry = policeDisp.routeGeometry;
    hospitalRouteGeometry = null;
    durationSec = policeDisp.routeDurationSec;
    hospitalDurationSec = null;
  }

  let routeCoords = extractCoords(routeGeometry);
  let hospitalRouteCoords = extractCoords(hospitalRouteGeometry);

  // Fallback: if ambulance dispatch has no stored routes, compute them on-the-fly
  if (accDisp && (routeCoords.length === 0 || hospitalRouteCoords.length === 0)) {
    const { getRoute } = require("./routingService");
    const vehicleLat = accDisp.ambulance?.latitude;
    const vehicleLng = accDisp.ambulance?.longitude;
    const hospLat = accDisp.hospital?.latitude;
    const hospLng = accDisp.hospital?.longitude;

    if (routeCoords.length === 0 && vehicleLat && vehicleLng && incidentLat && incidentLng) {
      console.log(`[DemoSim] Computing vehicle→incident route on-the-fly for dispatch ${dispatchId}`);
      try {
        const vRoute = await getRoute({ fromLat: vehicleLat, fromLng: vehicleLng, toLat: incidentLat, toLng: incidentLng });
        if (vRoute.geometry) {
          routeCoords = extractCoords(vRoute.geometry);
          durationSec = vRoute.durationSec;
          // Persist for future use
          await prisma.dispatch.update({ where: { id: dispatchId }, data: {
            routeGeometry: vRoute.geometry, routeDistanceKm: vRoute.distanceKm,
            routeDurationSec: vRoute.durationSec, routeProvider: vRoute.provider,
          }}).catch(() => {});
        }
      } catch (e) {
        console.warn(`[DemoSim] On-the-fly vehicle→incident route failed:`, e.message);
      }
    }

    if (hospitalRouteCoords.length === 0 && incidentLat && incidentLng && hospLat && hospLng) {
      console.log(`[DemoSim] Computing incident→hospital route on-the-fly for dispatch ${dispatchId}`);
      try {
        const hRoute = await getRoute({ fromLat: incidentLat, fromLng: incidentLng, toLat: hospLat, toLng: hospLng });
        if (hRoute.geometry) {
          hospitalRouteCoords = extractCoords(hRoute.geometry);
          hospitalDurationSec = hRoute.durationSec;
          // Persist for future use
          await prisma.dispatch.update({ where: { id: dispatchId }, data: {
            hospitalRouteGeometry: hRoute.geometry, hospitalRouteDistanceKm: hRoute.distanceKm,
            hospitalRouteDurationSec: hRoute.durationSec, hospitalRouteProvider: hRoute.provider,
          }}).catch(() => {});
        }
      } catch (e) {
        console.warn(`[DemoSim] On-the-fly incident→hospital route failed:`, e.message);
      }
    }
  }

  if (routeCoords.length === 0) {
    throw new Error("No route geometry available for this dispatch — cannot simulate");
  }

  const speedMs = options.intervalMs || 1500; // default 1.5s per point

  // Estimate sensible duration: use stored durationSec or calculate from distance
  const estDuration = durationSec || Math.round(polylineDistanceKm(routeCoords) * 120); // ~30 km/h
  const hospitalEstDuration = hospitalDurationSec || (hospitalRouteCoords.length > 0 ? Math.round(polylineDistanceKm(hospitalRouteCoords) * 120) : 60);

  const sampledRoute = subsampleCoords(routeCoords, estDuration, speedMs);
  const sampledHospitalRoute = subsampleCoords(hospitalRouteCoords, hospitalEstDuration, speedMs);

  const totalPoints = sampledRoute.length + sampledHospitalRoute.length;

  /** @type {SimulationContext} */
  const ctx = {
    dispatchId,
    dispatchType: accDisp ? "ACCIDENT" : fireDisp ? "FIRE" : "POLICE",
    vehicleId,
    vehicleType,
    vehicleNo,
    hospitalId,
    incidentLat,
    incidentLng,
    routeCoords: sampledRoute,
    hospitalRouteCoords: sampledHospitalRoute,
    currentIndex: 0,
    phase: "TO_INCIDENT",
    timer: null,
    speedMs,
    totalRoutePoints: totalPoints,
    startTimestamp: Date.now(),
    cancelled: false,
    etaSeconds: estDuration,
    lastEmittedPos: null,
  };

  activeSimulations.set(dispatchId, ctx);

  console.log(
    `[DemoSim] Starting simulation: dispatch=${dispatchId} vehicle=${vehicleNo} ` +
    `route=${sampledRoute.length}pts hospital=${sampledHospitalRoute.length}pts interval=${speedMs}ms`
  );

  // Kick off: first set status to ACCEPTED, then begin movement after a brief delay
  await emitStatusChange(ctx, "ACCEPTED");

  setTimeout(async () => {
    if (ctx.cancelled) return;
    await emitStatusChange(ctx, "EN_ROUTE");
    // Activate green corridor
    try {
      await activateGreenCorridorForSim(ctx);
    } catch (e) {
      console.warn("[DemoSim] Green corridor activation failed:", e.message);
    }
    // Start movement ticks
    ctx.timer = setInterval(() => tickSimulation(ctx), ctx.speedMs);
  }, 2000);

  return {
    dispatchId,
    vehicleId,
    vehicleType,
    vehicleNo,
    routePoints: sampledRoute.length,
    hospitalRoutePoints: sampledHospitalRoute.length,
    intervalMs: speedMs,
    estimatedDurationSec: estDuration,
  };
}

/**
 * Stop simulation for a specific dispatch.
 */
function stopSimulation(dispatchId) {
  const ctx = activeSimulations.get(dispatchId);
  if (!ctx) return false;
  ctx.cancelled = true;
  if (ctx.timer) clearInterval(ctx.timer);
  activeSimulations.delete(dispatchId);
  console.log(`[DemoSim] Stopped simulation for dispatch ${dispatchId}`);

  const io = socket.getIO();
  io.emit("DEMO_SIMULATION_STOPPED", {
    dispatchId,
    vehicleId: ctx.vehicleId,
    vehicleType: ctx.vehicleType,
    timestamp: new Date().toISOString(),
  });
  return true;
}

function stopAllSimulations() {
  for (const [dispatchId] of activeSimulations) {
    stopSimulation(dispatchId);
  }
}

/**
 * Allow manual status override during simulation.
 * Jumps the simulation phase for the given dispatch.
 */
function overrideStatus(dispatchId, newStatus) {
  const ctx = activeSimulations.get(dispatchId);
  if (!ctx) return false;

  const statusUpper = newStatus.toUpperCase();
  if (statusUpper === "COMPLETED") {
    completeSimulation(ctx);
  } else if (statusUpper === "ARRIVED") {
    // Jump to arrived phase
    if (ctx.timer) clearInterval(ctx.timer);
    ctx.phase = "AT_INCIDENT";
    emitStatusChange(ctx, "ARRIVED");
    // After a pause, start hospital leg if available
    setTimeout(() => {
      if (ctx.cancelled) return;
      if (ctx.hospitalRouteCoords.length > 0) {
        ctx.phase = "TO_HOSPITAL";
        ctx.currentIndex = 0;
        emitStatusChange(ctx, "EN_ROUTE");
        ctx.timer = setInterval(() => tickSimulation(ctx), ctx.speedMs);
      } else {
        completeSimulation(ctx);
      }
    }, 3000);
  }
  return true;
}

// ── internal ────────────────────────────────────────────────────────────────

async function tickSimulation(ctx) {
  if (ctx.cancelled || !demoModeEnabled) {
    stopSimulation(ctx.dispatchId);
    return;
  }

  if (ctx.phase === "TO_INCIDENT") {
    if (ctx.currentIndex >= ctx.routeCoords.length) {
      // Arrived at incident
      if (ctx.timer) clearInterval(ctx.timer);
      ctx.phase = "AT_INCIDENT";
      await emitStatusChange(ctx, "ARRIVED");

      // Brief pause at incident, then proceed to hospital
      setTimeout(async () => {
        if (ctx.cancelled) return;
        if (ctx.hospitalRouteCoords.length > 0) {
          ctx.phase = "TO_HOSPITAL";
          ctx.currentIndex = 0;
          await emitStatusChange(ctx, "EN_ROUTE");
          ctx.timer = setInterval(() => tickSimulation(ctx), ctx.speedMs);
        } else {
          await completeSimulation(ctx);
        }
      }, 4000); // 4s pause at incident
      return;
    }

    const coord = ctx.routeCoords[ctx.currentIndex];
    await emitLocationUpdate(ctx, coord[1], coord[0]); // [lng, lat] → (lat, lng)
    ctx.currentIndex++;

    // Update ETA
    const remaining = ctx.routeCoords.length - ctx.currentIndex;
    ctx.etaSeconds = Math.round((remaining * ctx.speedMs) / 1000);
  } else if (ctx.phase === "TO_HOSPITAL") {
    if (ctx.currentIndex >= ctx.hospitalRouteCoords.length) {
      if (ctx.timer) clearInterval(ctx.timer);
      await completeSimulation(ctx);
      return;
    }

    const coord = ctx.hospitalRouteCoords[ctx.currentIndex];
    await emitLocationUpdate(ctx, coord[1], coord[0]);
    ctx.currentIndex++;

    const remaining = ctx.hospitalRouteCoords.length - ctx.currentIndex;
    ctx.etaSeconds = Math.round((remaining * ctx.speedMs) / 1000);
  }
}

async function emitLocationUpdate(ctx, lat, lng) {
  // Dedup: skip if identical to last emitted position
  if (
    ctx.lastEmittedPos &&
    ctx.lastEmittedPos.lat === lat &&
    ctx.lastEmittedPos.lng === lng
  ) {
    return;
  }
  ctx.lastEmittedPos = { lat, lng };

  const io = socket.getIO();
  const payload = {
    vehicleId: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    vehicleType: ctx.vehicleType,
    latitude: lat,
    longitude: lng,
    status: ctx.phase === "AT_INCIDENT" ? "ARRIVED" : "EN_ROUTE",
    timestamp: new Date().toISOString(),
    isSimulated: true,
    dispatchId: ctx.dispatchId,
    etaSeconds: ctx.etaSeconds,
    phase: ctx.phase,
  };

  io.emit("VEHICLE_LOCATION_UPDATE", payload);

  // Also update the DB so dashboard queries stay consistent
  try {
    if (ctx.vehicleType === "FIRE_BRIGADE") {
      await prisma.fireBrigade.update({
        where: { id: ctx.vehicleId },
        data: { latitude: lat, longitude: lng },
      });
    } else if (ctx.vehicleType === "POLICE") {
      await prisma.policeUnit.update({
        where: { id: ctx.vehicleId },
        data: { latitude: lat, longitude: lng },
      });
    } else {
      await prisma.ambulance.update({
        where: { id: ctx.vehicleId },
        data: { latitude: lat, longitude: lng },
      });
    }
  } catch (e) {
    // Non-critical — the socket event is the primary delivery
    console.warn(`[DemoSim] DB coord update failed for ${ctx.vehicleNo}:`, e.message);
  }

  // Emit demo-specific progress event
  const totalProgress = ctx.phase === "TO_HOSPITAL"
    ? ctx.routeCoords.length + ctx.currentIndex
    : ctx.currentIndex;

  io.emit("DEMO_SIMULATION_PROGRESS", {
    dispatchId: ctx.dispatchId,
    vehicleId: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    phase: ctx.phase,
    progress: ctx.totalRoutePoints > 0 ? Math.round((totalProgress / ctx.totalRoutePoints) * 100) : 0,
    etaSeconds: ctx.etaSeconds,
    latitude: lat,
    longitude: lng,
    timestamp: new Date().toISOString(),
  });
}

async function emitStatusChange(ctx, status) {
  const io = socket.getIO();

  // Determine the socket event for vehicle type
  const vehicleEvent =
    ctx.vehicleType === "FIRE_BRIGADE" ? "FIRE_BRIGADE_STATUS_UPDATE"
    : ctx.vehicleType === "POLICE" ? "POLICE_STATUS_UPDATE"
    : "AMBULANCE_STATUS_UPDATE";

  // Update vehicle status in DB
  try {
    const data = { status };
    if (ctx.vehicleType === "FIRE_BRIGADE") {
      await prisma.fireBrigade.update({ where: { id: ctx.vehicleId }, data });
    } else if (ctx.vehicleType === "POLICE") {
      await prisma.policeUnit.update({ where: { id: ctx.vehicleId }, data });
    } else {
      await prisma.ambulance.update({ where: { id: ctx.vehicleId }, data });
    }
  } catch (e) {
    console.warn(`[DemoSim] DB status update failed:`, e.message);
  }

  // Update dispatch status in DB
  try {
    const dispatchData = { status };
    if (status === "COMPLETED") dispatchData.endtime = new Date();

    if (ctx.dispatchType === "FIRE") {
      await prisma.fireDispatch.update({ where: { id: ctx.dispatchId }, data: dispatchData });
    } else if (ctx.dispatchType === "POLICE") {
      await prisma.policeDispatch.update({ where: { id: ctx.dispatchId }, data: dispatchData });
    } else {
      await prisma.dispatch.update({ where: { id: ctx.dispatchId }, data: dispatchData });
    }
  } catch (e) {
    console.warn(`[DemoSim] Dispatch status update failed:`, e.message);
  }

  // Record in status history
  try {
    const lastCoord = ctx.lastEmittedPos || { lat: null, lng: null };
    await prisma.statusHistory.create({
      data: {
        dispatchId: ctx.dispatchId,
        dispatchType: ctx.dispatchType,
        vehicleId: ctx.vehicleId,
        vehicleType: ctx.vehicleType,
        status,
        latitude: lastCoord.lat,
        longitude: lastCoord.lng,
      },
    });
  } catch (e) {
    console.warn(`[DemoSim] Status history create failed:`, e.message);
  }

  // Emit vehicle-type-specific status event
  io.emit(vehicleEvent, {
    id: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    status,
    latitude: ctx.lastEmittedPos?.lat,
    longitude: ctx.lastEmittedPos?.lng,
    isSimulated: true,
  });

  // Emit unified status update
  io.emit("VEHICLE_STATUS_UPDATED", {
    vehicleId: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    vehicleType: ctx.vehicleType,
    status,
    latitude: ctx.lastEmittedPos?.lat,
    longitude: ctx.lastEmittedPos?.lng,
    dispatchId: ctx.dispatchId,
    timestamp: new Date().toISOString(),
    isSimulated: true,
  });

  // Emit dispatch status changed
  io.emit("DISPATCH_STATUS_CHANGED", {
    dispatchId: ctx.dispatchId,
    dispatchStatus: status,
    vehicleId: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    vehicleType: ctx.vehicleType,
    timestamp: new Date().toISOString(),
    isSimulated: true,
  });

  console.log(`[DemoSim] ${ctx.vehicleNo} → ${status} (dispatch: ${ctx.dispatchId.slice(0, 8)})`);
}

async function activateGreenCorridorForSim(ctx) {
  const io = socket.getIO();

  // Use all route coordinates to find nearby signals
  const allCoords = [...ctx.routeCoords, ...ctx.hospitalRouteCoords];
  const signals = await prisma.trafficSignal.findMany();

  if (signals.length === 0) {
    io.emit("GREEN_CORRIDOR_ACTIVE", {
      vehicleId: ctx.vehicleId,
      vehicleType: ctx.vehicleType,
      signals: [],
      routeCoords: allCoords.map((c) => [c[1], c[0]]), // [lat, lng] for frontend
      timestamp: new Date().toISOString(),
      isSimulated: true,
      message: "Priority route activated",
    });
    return;
  }

  // Find signals within 500m of any route coordinate
  const RADIUS_KM = 0.5;
  const nearbySignals = new Map();

  for (const signal of signals) {
    for (let i = 0; i < allCoords.length; i += Math.max(1, Math.floor(allCoords.length / 50))) {
      const coord = allCoords[i];
      const dist = haversineKm(coord[1], coord[0], signal.latitude, signal.longitude);
      if (dist <= RADIUS_KM) {
        nearbySignals.set(signal.id, signal);
        break;
      }
    }
  }

  // Turn those signals green
  const activatedSignals = [];
  for (const [, signal] of nearbySignals) {
    try {
      await prisma.trafficSignal.update({
        where: { id: signal.id },
        data: { state: "GREEN" },
      });
      activatedSignals.push({
        id: signal.id,
        junctionId: signal.junctionId,
        latitude: signal.latitude,
        longitude: signal.longitude,
      });

      io.emit("SIGNAL_GREEN", {
        junctionId: signal.junctionId,
        state: "GREEN",
        isSimulated: true,
      });
    } catch (e) {
      // noncritical
    }
  }

  io.emit("GREEN_CORRIDOR_ACTIVE", {
    vehicleId: ctx.vehicleId,
    vehicleType: ctx.vehicleType,
    signals: activatedSignals,
    routeCoords: allCoords.map((c) => [c[1], c[0]]),
    timestamp: new Date().toISOString(),
    isSimulated: true,
    message: "Priority route activated",
  });

  console.log(`[DemoSim] Green corridor: ${activatedSignals.length} signals activated along route`);
}

async function completeSimulation(ctx) {
  ctx.phase = "COMPLETED";
  await emitStatusChange(ctx, "COMPLETED");

  // Reset vehicle to AVAILABLE
  try {
    const data = { status: "AVAILABLE" };
    if (ctx.vehicleType === "FIRE_BRIGADE") {
      await prisma.fireBrigade.update({ where: { id: ctx.vehicleId }, data });
    } else if (ctx.vehicleType === "POLICE") {
      await prisma.policeUnit.update({ where: { id: ctx.vehicleId }, data });
    } else {
      await prisma.ambulance.update({ where: { id: ctx.vehicleId }, data });
    }
  } catch (e) {
    console.warn("[DemoSim] Failed to reset vehicle to AVAILABLE:", e.message);
  }

  // Deactivate green corridor
  try {
    await resetSignals();
    const io = socket.getIO();
    io.emit("GREEN_CORRIDOR_DEACTIVATED", {
      vehicleId: ctx.vehicleId,
      timestamp: new Date().toISOString(),
      isSimulated: true,
    });
  } catch (e) {
    console.warn("[DemoSim] Green corridor deactivation failed:", e.message);
  }

  // Emit final dispatch completed event
  const io = socket.getIO();
  io.emit("DISPATCH_COMPLETED", {
    dispatchId: ctx.dispatchId,
    vehicleId: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    vehicleType: ctx.vehicleType,
    timestamp: new Date().toISOString(),
    isSimulated: true,
  });

  // Emit vehicle reset to available
  const vehicleEvent =
    ctx.vehicleType === "FIRE_BRIGADE" ? "FIRE_BRIGADE_STATUS_UPDATE"
    : ctx.vehicleType === "POLICE" ? "POLICE_STATUS_UPDATE"
    : "AMBULANCE_STATUS_UPDATE";

  io.emit(vehicleEvent, {
    id: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    status: "AVAILABLE",
    latitude: ctx.lastEmittedPos?.lat,
    longitude: ctx.lastEmittedPos?.lng,
    isSimulated: true,
  });

  io.emit("VEHICLE_STATUS_UPDATED", {
    vehicleId: ctx.vehicleId,
    vehicleNo: ctx.vehicleNo,
    vehicleType: ctx.vehicleType,
    status: "AVAILABLE",
    latitude: ctx.lastEmittedPos?.lat,
    longitude: ctx.lastEmittedPos?.lng,
    dispatchId: ctx.dispatchId,
    timestamp: new Date().toISOString(),
    isSimulated: true,
  });

  activeSimulations.delete(ctx.dispatchId);
  console.log(`[DemoSim] Simulation COMPLETED for ${ctx.vehicleNo} (dispatch: ${ctx.dispatchId.slice(0, 8)})`);
}

/**
 * Start simulation for ALL active (non-completed) dispatches.
 * Useful for a one-click "simulate all" feature.
 */
async function startAllActiveSimulations(options = {}) {
  if (!demoModeEnabled) {
    throw new Error("Demo mode is not enabled");
  }

  const [accDispatches, fireDispatches, policeDispatches] = await Promise.all([
    prisma.dispatch.findMany({
      where: { status: { not: "COMPLETED" } },
      select: { id: true },
    }),
    prisma.fireDispatch.findMany({
      where: { status: { not: "COMPLETED" } },
      select: { id: true },
    }),
    prisma.policeDispatch.findMany({
      where: { status: { not: "COMPLETED" } },
      select: { id: true },
    }),
  ]);

  const allIds = [
    ...accDispatches.map((d) => d.id),
    ...fireDispatches.map((d) => d.id),
    ...policeDispatches.map((d) => d.id),
  ];

  const results = [];
  for (const id of allIds) {
    if (activeSimulations.has(id)) continue;
    try {
      const result = await startSimulation(id, options);
      results.push({ dispatchId: id, status: "started", ...result });
    } catch (e) {
      results.push({ dispatchId: id, status: "failed", error: e.message });
    }
  }

  return results;
}

module.exports = {
  isDemoMode,
  setDemoMode,
  getActiveSimulations,
  startSimulation,
  stopSimulation,
  stopAllSimulations,
  startAllActiveSimulations,
  overrideStatus,
};
