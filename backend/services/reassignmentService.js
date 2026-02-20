/**
 * Vehicle Reassignment Service
 * 
 * Monitors dispatched vehicles for movement toward incident.
 * If no movement within 15 seconds, marks dispatch as FAILED_ASSIGNMENT
 * and reassigns to the next nearest available vehicle (max 2 attempts).
 */

const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const { getRoute } = require("./routingService");
const { selectBestHospital } = require("./hospitalSelector");
const socket = require("../socket");

const MAX_REASSIGNMENT_ATTEMPTS = 2;
const MOVEMENT_CHECK_DELAY_MS = 15000; // 15 seconds
const MOVEMENT_THRESHOLD_KM = 0.01; // ~10 meters – must move at least this much

// Track active monitors to prevent duplicates
const activeMonitors = new Map(); // dispatchId -> timeoutId

/**
 * Start monitoring a dispatched vehicle for movement.
 * Called after dispatch creation.
 */
exports.monitorDispatch = ({
  dispatchId,
  dispatchType, // 'ACCIDENT' | 'FIRE' | 'POLICE'
  vehicleId,
  vehicleType, // 'AMBULANCE' | 'FIRE_BRIGADE' | 'POLICE'
  incidentLat,
  incidentLng,
  initialVehicleLat,
  initialVehicleLng,
  excludeVehicleIds = [], // vehicles already tried
}) => {
  // Prevent duplicate monitors
  if (activeMonitors.has(dispatchId)) {
    clearTimeout(activeMonitors.get(dispatchId));
  }

  const timeoutId = setTimeout(async () => {
    activeMonitors.delete(dispatchId);
    try {
      await checkVehicleMovement({
        dispatchId,
        dispatchType,
        vehicleId,
        vehicleType,
        incidentLat,
        incidentLng,
        initialVehicleLat,
        initialVehicleLng,
        excludeVehicleIds,
      });
    } catch (err) {
      console.error(`[Reassignment] Error checking movement for dispatch ${dispatchId}:`, err.message);
    }
  }, MOVEMENT_CHECK_DELAY_MS);

  activeMonitors.set(dispatchId, timeoutId);
  console.log(`[Reassignment] Monitoring dispatch ${dispatchId.slice(0, 8)} — checking in ${MOVEMENT_CHECK_DELAY_MS / 1000}s`);
};

/**
 * Cancel monitoring for a dispatch (e.g. vehicle confirmed EN_ROUTE).
 */
exports.cancelMonitor = (dispatchId) => {
  if (activeMonitors.has(dispatchId)) {
    clearTimeout(activeMonitors.get(dispatchId));
    activeMonitors.delete(dispatchId);
    console.log(`[Reassignment] Monitor cancelled for dispatch ${dispatchId.slice(0, 8)}`);
  }
};

/**
 * Check if the vehicle has moved toward the incident.
 * If not, trigger reassignment.
 */
async function checkVehicleMovement({
  dispatchId,
  dispatchType,
  vehicleId,
  vehicleType,
  incidentLat,
  incidentLng,
  initialVehicleLat,
  initialVehicleLng,
  excludeVehicleIds,
}) {
  // Get current vehicle position
  let vehicle;
  if (vehicleType === "FIRE_BRIGADE") {
    vehicle = await prisma.fireBrigade.findUnique({ where: { id: vehicleId } });
  } else if (vehicleType === "POLICE") {
    vehicle = await prisma.policeUnit.findUnique({ where: { id: vehicleId } });
  } else {
    vehicle = await prisma.ambulance.findUnique({ where: { id: vehicleId } });
  }

  if (!vehicle) {
    console.warn(`[Reassignment] Vehicle ${vehicleId} not found`);
    return;
  }

  // If vehicle is already EN_ROUTE or ARRIVED, it's responding
  if (vehicle.status === "EN_ROUTE" || vehicle.status === "ARRIVED" || vehicle.status === "COMPLETED") {
    console.log(`[Reassignment] Vehicle ${vehicleId.slice(0, 8)} already ${vehicle.status} — no reassignment needed`);
    return;
  }

  // Check if vehicle moved toward incident
  const initialDist = distanceKm(initialVehicleLat, initialVehicleLng, incidentLat, incidentLng);
  const currentDist = distanceKm(vehicle.latitude, vehicle.longitude, incidentLat, incidentLng);
  const positionChange = distanceKm(initialVehicleLat, initialVehicleLng, vehicle.latitude, vehicle.longitude);

  // Vehicle moved toward incident (distance decreased) OR physically moved
  if (currentDist < initialDist - MOVEMENT_THRESHOLD_KM || positionChange > MOVEMENT_THRESHOLD_KM) {
    console.log(`[Reassignment] Vehicle ${vehicleId.slice(0, 8)} is moving — no reassignment needed`);
    return;
  }

  // Vehicle hasn't moved — trigger reassignment
  console.warn(`[Reassignment] Vehicle ${vehicleId.slice(0, 8)} hasn't moved. Triggering reassignment...`);

  // Check reassignment count
  const currentExcluded = [...excludeVehicleIds, vehicleId];
  
  // Get current dispatch to check reassignment count
  let currentDispatch;
  if (dispatchType === "FIRE") {
    currentDispatch = await prisma.fireDispatch.findUnique({ where: { id: dispatchId } });
  } else if (dispatchType === "POLICE") {
    currentDispatch = await prisma.policeDispatch.findUnique({ where: { id: dispatchId } });
  } else {
    currentDispatch = await prisma.dispatch.findUnique({ where: { id: dispatchId } });
  }

  if (!currentDispatch) return;
  
  const totalAttempts = (currentDispatch.reassignCount || 0) + 1;
  if (totalAttempts > MAX_REASSIGNMENT_ATTEMPTS) {
    console.warn(`[Reassignment] Max reassignment attempts (${MAX_REASSIGNMENT_ATTEMPTS}) reached for dispatch ${dispatchId.slice(0, 8)}`);
    
    const io = socket.getIO();
    io.emit("REASSIGNMENT_FAILED", {
      dispatchId,
      dispatchType,
      reason: "MAX_ATTEMPTS_REACHED",
      attempts: totalAttempts,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  await performReassignment({
    dispatchId,
    dispatchType,
    vehicleId,
    vehicleType,
    incidentLat,
    incidentLng,
    excludeVehicleIds: currentExcluded,
    attemptNumber: totalAttempts,
  });
}

/**
 * Perform the actual reassignment:
 * 1. Mark old dispatch as FAILED_ASSIGNMENT
 * 2. Release old vehicle
 * 3. Find next nearest vehicle (excluding already-tried ones)
 * 4. Create new dispatch
 * 5. Emit reassignment events
 */
async function performReassignment({
  dispatchId,
  dispatchType,
  vehicleId,
  vehicleType,
  incidentLat,
  incidentLng,
  excludeVehicleIds,
  attemptNumber,
}) {
  const io = socket.getIO();

  try {
    if (dispatchType === "ACCIDENT") {
      await reassignAmbulance({ dispatchId, vehicleId, incidentLat, incidentLng, excludeVehicleIds, attemptNumber, io });
    } else if (dispatchType === "FIRE") {
      await reassignFireBrigade({ dispatchId, vehicleId, incidentLat, incidentLng, excludeVehicleIds, attemptNumber, io });
    } else if (dispatchType === "POLICE") {
      await reassignPolice({ dispatchId, vehicleId, incidentLat, incidentLng, excludeVehicleIds, attemptNumber, io });
    }
  } catch (err) {
    console.error(`[Reassignment] Failed for dispatch ${dispatchId.slice(0, 8)}:`, err.message);
    io.emit("REASSIGNMENT_FAILED", {
      dispatchId,
      dispatchType,
      reason: err.message,
      attempts: attemptNumber,
      timestamp: new Date().toISOString(),
    });
  }
}

async function reassignAmbulance({ dispatchId, vehicleId, incidentLat, incidentLng, excludeVehicleIds, attemptNumber, io }) {
  // Get original dispatch
  const oldDispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: { hospital: true },
  });
  if (!oldDispatch) throw new Error("Original dispatch not found");

  // Find next nearest available ambulance (exclude already-tried ones)
  const ambulances = await prisma.ambulance.findMany({
    where: {
      status: "AVAILABLE",
      id: { notIn: excludeVehicleIds },
    },
  });

  if (ambulances.length === 0) throw new Error("NO_AVAILABLE_VEHICLES");

  let nearest = ambulances[0];
  let minDist = distanceKm(incidentLat, incidentLng, nearest.latitude, nearest.longitude);
  for (const a of ambulances) {
    const d = distanceKm(incidentLat, incidentLng, a.latitude, a.longitude);
    if (d < minDist) { minDist = d; nearest = a; }
  }

  // Get route for new vehicle
  const route = await getRoute({
    fromLat: nearest.latitude,
    fromLng: nearest.longitude,
    toLat: incidentLat,
    toLng: incidentLng,
  });

  const hospitalRoute = await getRoute({
    fromLat: incidentLat,
    fromLng: incidentLng,
    toLat: oldDispatch.hospital.latitude,
    toLng: oldDispatch.hospital.longitude,
  });

  // Atomic: mark old as failed, release old vehicle, reserve new, create new dispatch record
  // Since accidentId is unique, we need to update the existing dispatch instead
  const result = await prisma.$transaction(async (tx) => {
    // Mark old dispatch as failed
    await tx.dispatch.update({
      where: { id: dispatchId },
      data: {
        status: "FAILED_ASSIGNMENT",
        reassignCount: attemptNumber,
        endtime: new Date(),
      },
    });

    // Release old vehicle
    await tx.ambulance.update({
      where: { id: vehicleId },
      data: { status: "AVAILABLE" },
    });

    // Reserve new vehicle
    const reserved = await tx.ambulance.updateMany({
      where: { id: nearest.id, status: "AVAILABLE" },
      data: { status: "BUSY" },
    });
    if (reserved.count === 0) throw new Error("NEW_AMBULANCE_TAKEN");

    // Since accidentId has a unique constraint, we update the existing dispatch
    // to point to the new ambulance rather than creating a new record
    const updatedDispatch = await tx.dispatch.update({
      where: { id: dispatchId },
      data: {
        ambulanceId: nearest.id,
        status: "ACTIVE",
        reassignCount: attemptNumber,
        routeProvider: route.provider,
        routeDistanceKm: route.distanceKm,
        routeDurationSec: route.durationSec,
        routeGeometry: route.geometry || null,
        hospitalRouteProvider: hospitalRoute.provider,
        hospitalRouteDistanceKm: hospitalRoute.distanceKm,
        hospitalRouteDurationSec: hospitalRoute.durationSec,
        hospitalRouteGeometry: hospitalRoute.geometry || null,
        startTime: new Date(),
        endtime: null,
      },
    });

    return updatedDispatch;
  });

  // Emit reassignment events
  const reassignPayload = {
    dispatchId: result.id,
    dispatchType: "ACCIDENT",
    oldVehicleId: vehicleId,
    newVehicleId: nearest.id,
    newVehicleNo: nearest.vehicleNo,
    incidentLat,
    incidentLng,
    route,
    hospitalRoute,
    attemptNumber,
    timestamp: new Date().toISOString(),
  };

  io.emit("DISPATCH_REASSIGNED", reassignPayload);
  io.to(`vehicle:${nearest.id}`).emit("DISPATCH_ASSIGNED", {
    type: "AMBULANCE_DISPATCH",
    dispatchId: result.id,
    ambulanceId: nearest.id,
    accidentId: oldDispatch.accidentId,
    hospitalId: oldDispatch.hospitalId,
    incidentLat,
    incidentLng,
    route,
    reassigned: true,
    attemptNumber,
    timestamp: new Date().toISOString(),
  });

  console.log(`[Reassignment] Ambulance reassigned: ${vehicleId.slice(0, 8)} → ${nearest.id.slice(0, 8)}`);

  // Monitor the new vehicle too
  exports.monitorDispatch({
    dispatchId: result.id,
    dispatchType: "ACCIDENT",
    vehicleId: nearest.id,
    vehicleType: "AMBULANCE",
    incidentLat,
    incidentLng,
    initialVehicleLat: nearest.latitude,
    initialVehicleLng: nearest.longitude,
    excludeVehicleIds,
  });

  return result;
}

async function reassignFireBrigade({ dispatchId, vehicleId, incidentLat, incidentLng, excludeVehicleIds, attemptNumber, io }) {
  const oldDispatch = await prisma.fireDispatch.findUnique({ where: { id: dispatchId } });
  if (!oldDispatch) throw new Error("Original fire dispatch not found");

  const fireBrigades = await prisma.fireBrigade.findMany({
    where: { status: "AVAILABLE", id: { notIn: excludeVehicleIds } },
  });
  if (fireBrigades.length === 0) throw new Error("NO_AVAILABLE_VEHICLES");

  let nearest = fireBrigades[0];
  let minDist = distanceKm(incidentLat, incidentLng, nearest.latitude, nearest.longitude);
  for (const fb of fireBrigades) {
    const d = distanceKm(incidentLat, incidentLng, fb.latitude, fb.longitude);
    if (d < minDist) { minDist = d; nearest = fb; }
  }

  const route = await getRoute({
    fromLat: nearest.latitude, fromLng: nearest.longitude,
    toLat: incidentLat, toLng: incidentLng,
  });

  const result = await prisma.$transaction(async (tx) => {
    await tx.fireDispatch.update({
      where: { id: dispatchId },
      data: { status: "FAILED_ASSIGNMENT", reassignCount: attemptNumber, endtime: new Date() },
    });
    await tx.fireBrigade.update({ where: { id: vehicleId }, data: { status: "AVAILABLE" } });
    const reserved = await tx.fireBrigade.updateMany({
      where: { id: nearest.id, status: "AVAILABLE" },
      data: { status: "BUSY" },
    });
    if (reserved.count === 0) throw new Error("NEW_FIRE_BRIGADE_TAKEN");

    return tx.fireDispatch.update({
      where: { id: dispatchId },
      data: {
        fireBrigadeId: nearest.id,
        status: "ACTIVE",
        reassignCount: attemptNumber,
        routeProvider: route.provider,
        routeDistanceKm: route.distanceKm,
        routeDurationSec: route.durationSec,
        routeGeometry: route.geometry || null,
        startTime: new Date(),
        endtime: null,
      },
    });
  });

  io.emit("DISPATCH_REASSIGNED", {
    dispatchId: result.id, dispatchType: "FIRE",
    oldVehicleId: vehicleId, newVehicleId: nearest.id, newVehicleNo: nearest.vehicleNo,
    incidentLat, incidentLng, route, attemptNumber,
    timestamp: new Date().toISOString(),
  });
  io.to(`vehicle:${nearest.id}`).emit("DISPATCH_ASSIGNED", {
    type: "FIRE_DISPATCH", dispatchId: result.id,
    fireBrigadeId: nearest.id, fireIncidentId: oldDispatch.fireIncidentId,
    incidentLat, incidentLng, route, reassigned: true, attemptNumber,
    timestamp: new Date().toISOString(),
  });

  exports.monitorDispatch({
    dispatchId: result.id, dispatchType: "FIRE",
    vehicleId: nearest.id, vehicleType: "FIRE_BRIGADE",
    incidentLat, incidentLng,
    initialVehicleLat: nearest.latitude, initialVehicleLng: nearest.longitude,
    excludeVehicleIds,
  });

  return result;
}

async function reassignPolice({ dispatchId, vehicleId, incidentLat, incidentLng, excludeVehicleIds, attemptNumber, io }) {
  const oldDispatch = await prisma.policeDispatch.findUnique({ where: { id: dispatchId } });
  if (!oldDispatch) throw new Error("Original police dispatch not found");

  const policeUnits = await prisma.policeUnit.findMany({
    where: { status: "AVAILABLE", id: { notIn: excludeVehicleIds } },
  });
  if (policeUnits.length === 0) throw new Error("NO_AVAILABLE_VEHICLES");

  let nearest = policeUnits[0];
  let minDist = distanceKm(incidentLat, incidentLng, nearest.latitude, nearest.longitude);
  for (const pu of policeUnits) {
    const d = distanceKm(incidentLat, incidentLng, pu.latitude, pu.longitude);
    if (d < minDist) { minDist = d; nearest = pu; }
  }

  const route = await getRoute({
    fromLat: nearest.latitude, fromLng: nearest.longitude,
    toLat: incidentLat, toLng: incidentLng,
  });

  const result = await prisma.$transaction(async (tx) => {
    await tx.policeDispatch.update({
      where: { id: dispatchId },
      data: { status: "FAILED_ASSIGNMENT", reassignCount: attemptNumber, endtime: new Date() },
    });
    await tx.policeUnit.update({ where: { id: vehicleId }, data: { status: "AVAILABLE" } });
    const reserved = await tx.policeUnit.updateMany({
      where: { id: nearest.id, status: "AVAILABLE" },
      data: { status: "BUSY" },
    });
    if (reserved.count === 0) throw new Error("NEW_POLICE_TAKEN");

    return tx.policeDispatch.update({
      where: { id: dispatchId },
      data: {
        policeUnitId: nearest.id,
        status: "ACTIVE",
        reassignCount: attemptNumber,
        routeProvider: route.provider,
        routeDistanceKm: route.distanceKm,
        routeDurationSec: route.durationSec,
        routeGeometry: route.geometry || null,
        startTime: new Date(),
        endtime: null,
      },
    });
  });

  io.emit("DISPATCH_REASSIGNED", {
    dispatchId: result.id, dispatchType: "POLICE",
    oldVehicleId: vehicleId, newVehicleId: nearest.id, newVehicleNo: nearest.vehicleNo,
    incidentLat, incidentLng, route, attemptNumber,
    timestamp: new Date().toISOString(),
  });
  io.to(`vehicle:${nearest.id}`).emit("DISPATCH_ASSIGNED", {
    type: "POLICE_DISPATCH", dispatchId: result.id,
    policeUnitId: nearest.id, sosEventId: oldDispatch.sosEventId,
    incidentLat, incidentLng, route, reassigned: true, attemptNumber,
    timestamp: new Date().toISOString(),
  });

  exports.monitorDispatch({
    dispatchId: result.id, dispatchType: "POLICE",
    vehicleId: nearest.id, vehicleType: "POLICE",
    incidentLat, incidentLng,
    initialVehicleLat: nearest.latitude, initialVehicleLng: nearest.longitude,
    excludeVehicleIds,
  });

  return result;
}
