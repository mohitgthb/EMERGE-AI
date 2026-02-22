const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const { selectBestHospital } = require("../services/hospitalSelector");
const socket = require("../socket");
const { getRoute } = require("../services/routingService");
const { activeGreenCorridor, resetSignals } = require("../services/greenCorridor");
const { cancelMonitor } = require("../services/reassignmentService");
const { getClusterInfo, getClusterEvents } = require("../services/incidentClusterService");

exports.listDispatches = async (req, res) => {
  try {
    // If an authenticated operator is present and has a vehicleId, scope results
    const op = req.operator; // set by optionalAuth or authenticate middleware
    const vehicleId = op?.vehicleId;
    const role = op?.role;

    // Build per-table where clauses for vehicle scoping (non-ADMIN)
    const scopeAmbulance = vehicleId && role === "AMBULANCE" ? { ambulanceId: vehicleId } : {};
    const scopeFire = vehicleId && role === "FIRE_BRIGADE" ? { fireBrigadeId: vehicleId } : {};
    const scopePolice = vehicleId && role === "POLICE" ? { policeUnitId: vehicleId } : {};

    // Hospital scoping: show only dispatches assigned to this hospital
    const hospitalId = op?.hospitalId;
    const scopeHospital = hospitalId && role === "HOSPITAL" ? { hospitalId } : {};

    const [accidentDispatches, fireDispatches, policeDispatches] = await Promise.all([
      prisma.dispatch.findMany({
        where: { ...scopeAmbulance, ...scopeHospital },
        include: { accident: true, ambulance: true, hospital: true },
        orderBy: { startTime: "desc" },
      }),
      // HOSPITAL role does not see fire/police dispatches (no hospital FK)
      role === "HOSPITAL" ? Promise.resolve([]) : prisma.fireDispatch.findMany({
        where: scopeFire,
        include: { fireIncident: true, fireBrigade: true },
        orderBy: { startTime: "desc" },
      }),
      role === "HOSPITAL" ? Promise.resolve([]) : prisma.policeDispatch.findMany({
        where: scopePolice,
        include: { sosEvent: true, policeUnit: true },
        orderBy: { startTime: "desc" },
      }),
    ]);
    res.json({ accidentDispatches, fireDispatches, policeDispatches });
  } catch (error) {
    console.error("Error listing dispatches:", error);
    res.status(500).json({ message: "Failed to fetch dispatches", error: error.message });
  }
};

// ─── Helper: check if operator owns the dispatch's vehicle ──────────────────
function ownsDispatch(operator, accDisp, fireDisp, policeDisp) {
  if (!operator || !operator.vehicleId && !operator.hospitalId) return true; // unauthenticated or no vehicleId/hospitalId — allow (public)
  if (operator.role === "ADMIN") return true;

  // Hospital operators can see accident dispatches assigned to their hospital
  if (operator.role === "HOSPITAL" && operator.hospitalId) {
    if (accDisp) return accDisp.hospitalId === operator.hospitalId;
    return false; // fire/police dispatches don't have hospitalId
  }

  if (accDisp && operator.role === "AMBULANCE") return accDisp.ambulanceId === operator.vehicleId;
  if (fireDisp && operator.role === "FIRE_BRIGADE") return fireDisp.fireBrigadeId === operator.vehicleId;
  if (policeDisp && operator.role === "POLICE") return policeDisp.policeUnitId === operator.vehicleId;

  // Role doesn't match dispatch type — deny
  if (accDisp && operator.role !== "AMBULANCE") return false;
  if (fireDisp && operator.role !== "FIRE_BRIGADE") return false;
  if (policeDisp && operator.role !== "POLICE") return false;

  return false;
}

// ─── Get single dispatch by ID (checks all 3 dispatch tables) ────────────────
exports.getDispatch = async (req, res) => {
  try {
    const { id } = req.params;

    const [accDisp, fireDisp, policeDisp] = await Promise.all([
      prisma.dispatch.findUnique({
        where: { id },
        include: { accident: true, ambulance: true, hospital: true },
      }),
      prisma.fireDispatch.findUnique({
        where: { id },
        include: { fireIncident: true, fireBrigade: true },
      }),
      prisma.policeDispatch.findUnique({
        where: { id },
        include: { sosEvent: true, policeUnit: true },
      }),
    ]);

    const dispatch = accDisp || fireDisp || policeDisp;
    if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });

    // Ownership check: non-admin operators can only access their own dispatches
    if (!ownsDispatch(req.operator, accDisp, fireDisp, policeDisp)) {
      return res.status(403).json({ message: "Access denied: dispatch belongs to another vehicle" });
    }

    const dispatchType = accDisp ? "ACCIDENT" : fireDisp ? "FIRE" : "POLICE";
    res.json({ dispatch, dispatchType });
  } catch (error) {
    console.error("Error fetching dispatch:", error);
    res.status(500).json({ message: "Failed to fetch dispatch", error: error.message });
  }
};

// ─── Route calculation endpoint ──────────────────────────────────────────────
exports.getRouteInfo = async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query;
    if (!fromLat || !fromLng || !toLat || !toLng) {
      return res.status(400).json({ message: "Missing coordinates: fromLat, fromLng, toLat, toLng" });
    }

    const route = await getRoute({
      fromLat: parseFloat(fromLat),
      fromLng: parseFloat(fromLng),
      toLat: parseFloat(toLat),
      toLng: parseFloat(toLng),
    });

    res.json(route);
  } catch (error) {
    console.error("Error computing route:", error);
    res.status(500).json({ message: "Failed to compute route", error: error.message });
  }
};

// ─── Nearest hospital for a location ─────────────────────────────────────────
exports.getNearestHospital = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Missing latitude and longitude" });
    }

    const hospital = await selectBestHospital({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    });

    const dist = distanceKm(parseFloat(latitude), parseFloat(longitude), hospital.latitude, hospital.longitude);
    const route = await getRoute({
      fromLat: parseFloat(latitude),
      fromLng: parseFloat(longitude),
      toLat: hospital.latitude,
      toLng: hospital.longitude,
    });

    res.json({ hospital, distanceKm: dist, route });
  } catch (error) {
    console.error("Error finding nearest hospital:", error);
    res.status(500).json({ message: "Failed to find nearest hospital", error: error.message });
  }
};

// ─── Green corridor activation ───────────────────────────────────────────────
exports.activateGreenCorridor = async (req, res) => {
  try {
    const { vehicleId, vehicleType } = req.body;
    if (!vehicleId) return res.status(400).json({ message: "Missing vehicleId" });

    let vehicle;
    if (vehicleType === "FIRE_BRIGADE") {
      vehicle = await prisma.fireBrigade.findUnique({ where: { id: vehicleId } });
    } else {
      vehicle = await prisma.ambulance.findUnique({ where: { id: vehicleId } });
    }
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    await activeGreenCorridor(vehicle);

    const signals = await prisma.trafficSignal.findMany({ where: { state: "GREEN" } });

    res.json({
      status: "ACTIVE",
      vehicleId,
      greenSignals: signals.map((s) => ({
        id: s.id,
        junctionId: s.junctionId,
        latitude: s.latitude,
        longitude: s.longitude,
        state: s.state,
      })),
    });
  } catch (error) {
    console.error("Error activating green corridor:", error);
    res.status(500).json({ message: "Failed to activate green corridor", error: error.message });
  }
};

// ─── Deactivate green corridor ───────────────────────────────────────────────
exports.deactivateGreenCorridor = async (req, res) => {
  try {
    await resetSignals();
    res.json({ status: "DEACTIVATED" });
  } catch (error) {
    console.error("Error deactivating green corridor:", error);
    res.status(500).json({ message: "Failed to deactivate", error: error.message });
  }
};

// ─── Update vehicle status (unified for all types) ──────────────────────────
exports.updateVehicleStatus = async (req, res) => {
  try {
    const { vehicleId, vehicleType, status, latitude, longitude, dispatchId } = req.body;
    if (!vehicleId || !status) {
      return res.status(400).json({ message: "Missing vehicleId and status" });
    }

    const upperStatus = status.toUpperCase();
    const data = { status: upperStatus };
    if (latitude != null) data.latitude = latitude;
    if (longitude != null) data.longitude = longitude;

    let updated;
    let socketEvent;

    if (vehicleType === "FIRE_BRIGADE") {
      updated = await prisma.fireBrigade.update({ where: { id: vehicleId }, data });
      socketEvent = "FIRE_BRIGADE_STATUS_UPDATE";
    } else if (vehicleType === "POLICE") {
      updated = await prisma.policeUnit.update({ where: { id: vehicleId }, data });
      socketEvent = "POLICE_STATUS_UPDATE";
    } else {
      updated = await prisma.ambulance.update({ where: { id: vehicleId }, data });
      socketEvent = "AMBULANCE_STATUS_UPDATE";
    }

    // ─── Record status history ───────────────────────────────────────
    if (dispatchId) {
      const dispatchType =
        vehicleType === "FIRE_BRIGADE" ? "FIRE" :
        vehicleType === "POLICE" ? "POLICE" : "ACCIDENT";

      await prisma.statusHistory.create({
        data: {
          dispatchId,
          dispatchType,
          vehicleId,
          vehicleType: vehicleType || "AMBULANCE",
          status: upperStatus,
          latitude: updated.latitude,
          longitude: updated.longitude,
        },
      });
    }

    // ─── Cancel reassignment monitor when vehicle confirms EN_ROUTE ──
    if (upperStatus === "EN_ROUTE" && dispatchId) {
      cancelMonitor(dispatchId);
    }

    const io = socket.getIO();

    // Emit type-specific status event
    io.emit(socketEvent, updated);

    // Emit unified vehicle tracking event
    io.emit("VEHICLE_STATUS_UPDATED", {
      vehicleId: updated.id,
      vehicleNo: updated.vehicleNo,
      vehicleType: vehicleType || "AMBULANCE",
      status: updated.status,
      latitude: updated.latitude,
      longitude: updated.longitude,
      dispatchId: dispatchId || null,
      timestamp: new Date().toISOString(),
    });

    // Location update for map
    if (updated.latitude != null && updated.longitude != null) {
      io.emit("VEHICLE_LOCATION_UPDATE", {
        vehicleId: updated.id,
        vehicleNo: updated.vehicleNo,
        vehicleType: vehicleType || "AMBULANCE",
        latitude: updated.latitude,
        longitude: updated.longitude,
        status: updated.status,
        timestamp: new Date().toISOString(),
      });
    }

    // Green corridor logic
    if (updated.status === "EN_ROUTE" && updated.latitude != null) {
      await activeGreenCorridor(updated);
      const greenSignals = await prisma.trafficSignal.findMany({ where: { state: "GREEN" } });
      io.emit("GREEN_CORRIDOR_ACTIVE", {
        vehicleId: updated.id,
        vehicleType: vehicleType || "AMBULANCE",
        signals: greenSignals.map((s) => ({
          id: s.id,
          junctionId: s.junctionId,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
        timestamp: new Date().toISOString(),
      });
    }

    if (updated.status === "COMPLETED" || updated.status === "ARRIVED" || updated.status === "EN_ROUTE") {
      // Persist vehicle status to dispatch record so it's queryable
      if (dispatchId) {
        try {
          const dispatchStatus = updated.status === "COMPLETED" ? "COMPLETED"
            : updated.status === "ARRIVED" ? "ARRIVED"
            : "EN_ROUTE";
          const dispatchUpdate = { status: dispatchStatus };
          if (updated.status === "COMPLETED") dispatchUpdate.endtime = new Date();

          if (vehicleType === "FIRE_BRIGADE") {
            await prisma.fireDispatch.update({ where: { id: dispatchId }, data: dispatchUpdate });
          } else if (vehicleType === "POLICE") {
            await prisma.policeDispatch.update({ where: { id: dispatchId }, data: dispatchUpdate });
          } else {
            await prisma.dispatch.update({ where: { id: dispatchId }, data: dispatchUpdate });
          }
        } catch (e) {
          console.warn("Failed to update dispatch status:", e.message);
        }

        // Emit DISPATCH_STATUS_CHANGED for real-time UI updates
        io.emit("DISPATCH_STATUS_CHANGED", {
          dispatchId,
          dispatchStatus: updated.status === "COMPLETED" ? "COMPLETED" : updated.status,
          vehicleId: updated.id,
          vehicleNo: updated.vehicleNo,
          vehicleType: vehicleType || "AMBULANCE",
          timestamp: new Date().toISOString(),
        });
      }

      if (updated.status === "COMPLETED") {
        await resetSignals();
        io.emit("GREEN_CORRIDOR_DEACTIVATED", {
          vehicleId: updated.id,
          timestamp: new Date().toISOString(),
        });

        // Emit DISPATCH_COMPLETED event for admin/hospital dashboards
        io.emit("DISPATCH_COMPLETED", {
          dispatchId: dispatchId || null,
          vehicleId: updated.id,
          vehicleNo: updated.vehicleNo,
          vehicleType: vehicleType || "AMBULANCE",
          timestamp: new Date().toISOString(),
        });

        // Reset vehicle to AVAILABLE
        let availableVehicle;
        if (vehicleType === "FIRE_BRIGADE") {
          availableVehicle = await prisma.fireBrigade.update({ where: { id: vehicleId }, data: { status: "AVAILABLE" } });
        } else if (vehicleType === "POLICE") {
          availableVehicle = await prisma.policeUnit.update({ where: { id: vehicleId }, data: { status: "AVAILABLE" } });
        } else {
          availableVehicle = await prisma.ambulance.update({ where: { id: vehicleId }, data: { status: "AVAILABLE" } });
        }

        // Emit vehicle back to AVAILABLE so frontend shows correct status
        io.emit(socketEvent, availableVehicle);
        io.emit("VEHICLE_STATUS_UPDATED", {
          vehicleId: availableVehicle.id,
          vehicleNo: availableVehicle.vehicleNo,
          vehicleType: vehicleType || "AMBULANCE",
          status: "AVAILABLE",
          latitude: availableVehicle.latitude,
          longitude: availableVehicle.longitude,
          dispatchId: dispatchId || null,
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({ message: "Vehicle status updated", vehicle: updated });
  } catch (error) {
    console.error("Error updating vehicle status:", error);
    res.status(500).json({ message: "Failed to update vehicle status", error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const [totalAccidents, totalFires, totalSOS, pendingSOS, ambulances, fireBrigades, policeUnits, hospitals, pendingQueue] = await Promise.all([
      prisma.accident.count(),
      prisma.fireIncident.count(),
      prisma.sOSEvent.count(),
      prisma.sOSEvent.count({ where: { status: "PENDING" } }),
      prisma.ambulance.findMany(),
      prisma.fireBrigade.findMany(),
      prisma.policeUnit.findMany(),
      prisma.hospital.findMany(),
      prisma.emergencyQueue.count({ where: { status: "PENDING" } }),
    ]);
    const availableAmbulances = ambulances.filter(a => a.status === "AVAILABLE").length;
    const busyAmbulances = ambulances.filter(a => a.status !== "AVAILABLE").length;
    const availableFireBrigades = fireBrigades.filter(f => f.status === "AVAILABLE").length;
    const availablePolice = policeUnits.filter(p => p.status === "AVAILABLE").length;
    const totalBeds = hospitals.reduce((sum, h) => sum + h.beds, 0);

    const recentAccidents = await prisma.accident.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { dispatch: true },
    });
    const avgResponseSec = recentAccidents
      .filter(a => a.dispatch?.startTime)
      .reduce((sum, a) => {
        const diff = new Date(a.dispatch.startTime).getTime() - new Date(a.createdAt).getTime();
        return sum + diff / 1000;
      }, 0) / (recentAccidents.filter(a => a.dispatch).length || 1);

    res.json({
      totalIncidents: totalAccidents + totalFires,
      totalAccidents,
      totalFires,
      totalSOS,
      pendingSOS,
      pendingQueue,
      unitsAvailable: availableAmbulances + availableFireBrigades + availablePolice,
      unitsBusy: busyAmbulances + (fireBrigades.length - availableFireBrigades) + (policeUnits.length - availablePolice),
      totalBeds,
      avgResponseTime: Math.round(avgResponseSec / 60 * 10) / 10,
      ambulances: ambulances.length,
      fireBrigades: fireBrigades.length,
      policeUnits: policeUnits.length,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
  }
};

exports.dispatchAmbulance = async (req, res) => {
    const { accidentId } = req.body;

    const accident = await prisma.accident.findUnique({
        where: { id: accidentId }
    });

    if (!accident) return res.status(404).json({ message: "Accident not found" });

    const existingDispatch = await prisma.dispatch.findUnique({
        where: { accidentId: accident.id },
    });

    if (existingDispatch) {
        return res.status(200).json({
            message: "Dispatch already exists for this accident",
            dispatch: existingDispatch,
        });
    }


    const ambulances = await prisma.ambulance.findMany({
        where: { status: 'AVAILABLE' }
    });

    if (ambulances.length === 0) {
        return res.status(404).json({ message: "No available ambulances" });
    }

    //finding nearest ambulance
    let nearest = ambulances[0];
    let minDist = distanceKm(
        accident.latitude,
        accident.longitude,
        nearest.latitude,
        nearest.longitude
    );

    for (const a of ambulances) {
        const d = distanceKm(
            accident.latitude,
            accident.longitude,
            a.latitude,
            a.longitude
        );
        if (d < minDist) {
            minDist = d;
            nearest = a;
        }
    }

    const hospital = await selectBestHospital(accident);

    // Route 1: ambulance → incident scene
    const vehicleRoute = await getRoute({
        fromLat: nearest.latitude,
        fromLng: nearest.longitude,
        toLat: accident.latitude,
        toLng: accident.longitude,
    });

    // Route 2: incident scene → hospital
    const hospitalRoute = await getRoute({
        fromLat: accident.latitude,
        fromLng: accident.longitude,
        toLat: hospital.latitude,
        toLng: hospital.longitude,
    });

    let dispatch;
    try {
        dispatch = await prisma.$transaction(async (tx) => {
            const reservedAmbulance = await tx.ambulance.updateMany({
                where: { id: nearest.id, status: "AVAILABLE" },
                data: { status: "BUSY" }
            });

            if (reservedAmbulance.count === 0) {
                throw new Error("AMBULANCE_TAKEN");
            }

            const decrementedBeds = await tx.hospital.updateMany({
                where: { id: hospital.id, beds: { gt: 0 } },
                data: { beds: { decrement: 1 } }
            });

            if (decrementedBeds.count === 0) {
                throw new Error("NO_BEDS");
            }

            return tx.dispatch.create({
                data: {
                    accidentId: accident.id,
                    ambulanceId: nearest.id,
                    hospitalId: hospital.id,
                    routeProvider: vehicleRoute.provider,
                    routeDistanceKm: vehicleRoute.distanceKm,
                    routeDurationSec: vehicleRoute.durationSec,
                    routeGeometry: vehicleRoute.geometry || null,
                    hospitalRouteProvider: hospitalRoute.provider,
                    hospitalRouteDistanceKm: hospitalRoute.distanceKm,
                    hospitalRouteDurationSec: hospitalRoute.durationSec,
                    hospitalRouteGeometry: hospitalRoute.geometry || null,
                }
            });
        });
    } catch (e) {
        if (e?.code === "P2002") {
            const already = await prisma.dispatch.findUnique({ where: { accidentId: accident.id } });
            return res.status(200).json({ message: "Dispatch already exists for this accident", dispatch: already });
        }
        if (e?.message === "AMBULANCE_TAKEN") {
            return res.status(409).json({ message: "Ambulance was assigned by another request. Retry." });
        }
        if (e?.message === "NO_BEDS") {
            return res.status(409).json({ message: "Hospital beds became unavailable. Retry." });
        }
        throw e;
    }

    const io = socket.getIO();
    io.emit("AMBULANCE_ASSIGNED", { 
        accidentId: accident.id, 
        ambulanceId: nearest.id, 
        hospitalId: hospital.id,
        route: {
            provider: vehicleRoute.provider,
            distanceKm: vehicleRoute.distanceKm,
            durationSec: vehicleRoute.durationSec,
            geometry: vehicleRoute.geometry,
        },
        hospitalRoute: {
            provider: hospitalRoute.provider,
            distanceKm: hospitalRoute.distanceKm,
            durationSec: hospitalRoute.durationSec,
            geometry: hospitalRoute.geometry,
        },
    });

    res.json({
        dispatch,
        assignedAmbulance: nearest,
        assignedHospital: hospital,
        route: {
            provider: vehicleRoute.provider,
            distanceKm: vehicleRoute.distanceKm,
            durationSec: vehicleRoute.durationSec,
            geometry: vehicleRoute.geometry,
        },
        hospitalRoute: {
            provider: hospitalRoute.provider,
            distanceKm: hospitalRoute.distanceKm,
            durationSec: hospitalRoute.durationSec,
            geometry: hospitalRoute.geometry,
        },
    });
};

// ─── Status Timeline for a dispatch ──────────────────────────────────────────
exports.getStatusTimeline = async (req, res) => {
  try {
    const { id } = req.params;

    // Ownership check: verify the operator owns this dispatch
    if (req.operator && req.operator.vehicleId && req.operator.role !== "ADMIN") {
      const [accDisp, fireDisp, policeDisp] = await Promise.all([
        prisma.dispatch.findUnique({ where: { id } }),
        prisma.fireDispatch.findUnique({ where: { id } }),
        prisma.policeDispatch.findUnique({ where: { id } }),
      ]);
      if (!ownsDispatch(req.operator, accDisp, fireDisp, policeDisp)) {
        return res.status(403).json({ message: "Access denied: dispatch belongs to another vehicle" });
      }
    }

    const timeline = await prisma.statusHistory.findMany({
      where: { dispatchId: id },
      orderBy: { timestamp: "asc" },
    });
    res.json(timeline);
  } catch (error) {
    console.error("Error fetching status timeline:", error);
    res.status(500).json({ message: "Failed to fetch timeline", error: error.message });
  }
};

// ─── Dual route info for a dispatch (vehicle→incident, incident→hospital) ────
exports.getDualRoutes = async (req, res) => {
  try {
    const { id } = req.params;

    // Check all 3 dispatch types
    const [accDisp, fireDisp, policeDisp] = await Promise.all([
      prisma.dispatch.findUnique({
        where: { id },
        include: { accident: true, ambulance: true, hospital: true },
      }),
      prisma.fireDispatch.findUnique({
        where: { id },
        include: { fireIncident: true, fireBrigade: true },
      }),
      prisma.policeDispatch.findUnique({
        where: { id },
        include: { sosEvent: true, policeUnit: true },
      }),
    ]);

    const dispatch = accDisp || fireDisp || policeDisp;
    if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });

    // Ownership check
    if (!ownsDispatch(req.operator, accDisp, fireDisp, policeDisp)) {
      return res.status(403).json({ message: "Access denied: dispatch belongs to another vehicle" });
    }

    let vehicleLat, vehicleLng, incidentLat, incidentLng, hospitalLat, hospitalLng, hospital;
    let storedVehicleRoute = null, storedHospitalRoute = null;

    if (accDisp) {
      vehicleLat = accDisp.ambulance.latitude;
      vehicleLng = accDisp.ambulance.longitude;
      incidentLat = accDisp.accident.latitude;
      incidentLng = accDisp.accident.longitude;
      hospital = accDisp.hospital;
      hospitalLat = hospital.latitude;
      hospitalLng = hospital.longitude;
      // Prefer stored route geometry (matches what demo simulation follows)
      if (accDisp.routeGeometry) {
        storedVehicleRoute = {
          provider: accDisp.routeProvider || "STORED",
          distanceKm: accDisp.routeDistanceKm,
          durationSec: accDisp.routeDurationSec,
          geometry: accDisp.routeGeometry,
        };
      }
      if (accDisp.hospitalRouteGeometry) {
        storedHospitalRoute = {
          provider: accDisp.hospitalRouteProvider || "STORED",
          distanceKm: accDisp.hospitalRouteDistanceKm,
          durationSec: accDisp.hospitalRouteDurationSec,
          geometry: accDisp.hospitalRouteGeometry,
        };
      }
    } else if (fireDisp) {
      vehicleLat = fireDisp.fireBrigade.latitude;
      vehicleLng = fireDisp.fireBrigade.longitude;
      incidentLat = fireDisp.fireIncident.latitude;
      incidentLng = fireDisp.fireIncident.longitude;
      // Fire doesn't have a hospital — compute nearest
      const nearest = await selectBestHospital({ latitude: incidentLat, longitude: incidentLng });
      hospital = nearest;
      hospitalLat = nearest.latitude;
      hospitalLng = nearest.longitude;
      if (fireDisp.routeGeometry) {
        storedVehicleRoute = {
          provider: fireDisp.routeProvider || "STORED",
          distanceKm: fireDisp.routeDistanceKm,
          durationSec: fireDisp.routeDurationSec,
          geometry: fireDisp.routeGeometry,
        };
      }
    } else {
      vehicleLat = policeDisp.policeUnit.latitude;
      vehicleLng = policeDisp.policeUnit.longitude;
      incidentLat = policeDisp.sosEvent.latitude;
      incidentLng = policeDisp.sosEvent.longitude;
      const nearest = await selectBestHospital({ latitude: incidentLat, longitude: incidentLng });
      hospital = nearest;
      hospitalLat = nearest.latitude;
      hospitalLng = nearest.longitude;
      if (policeDisp.routeGeometry) {
        storedVehicleRoute = {
          provider: policeDisp.routeProvider || "STORED",
          distanceKm: policeDisp.routeDistanceKm,
          durationSec: policeDisp.routeDurationSec,
          geometry: policeDisp.routeGeometry,
        };
      }
    }

    // Use stored routes if available (consistent with simulation), otherwise compute fresh
    const vehicleToIncidentRoute = storedVehicleRoute || await getRoute({
      fromLat: vehicleLat, fromLng: vehicleLng, toLat: incidentLat, toLng: incidentLng,
    });
    const incidentToHospitalRoute = storedHospitalRoute || await getRoute({
      fromLat: incidentLat, fromLng: incidentLng, toLat: hospitalLat, toLng: hospitalLng,
    });

    res.json({
      dispatchId: dispatch.id,
      dispatchType: accDisp ? "ACCIDENT" : fireDisp ? "FIRE" : "POLICE",
      vehicle: {
        latitude: vehicleLat,
        longitude: vehicleLng,
      },
      incident: {
        latitude: incidentLat,
        longitude: incidentLng,
      },
      hospital: {
        id: hospital.id,
        name: hospital.name,
        latitude: hospitalLat,
        longitude: hospitalLng,
        beds: hospital.beds,
      },
      vehicleToIncident: vehicleToIncidentRoute,
      incidentToHospital: incidentToHospitalRoute,
    });
  } catch (error) {
    console.error("Error computing dual routes:", error);
    res.status(500).json({ message: "Failed to compute dual routes", error: error.message });
  }
};

// ─── Get cluster info for an SOS event ───────────────────────────────────────
exports.getCluster = async (req, res) => {
  try {
    const { eventId } = req.params;
    const info = await getClusterInfo(eventId);
    if (!info) return res.status(404).json({ message: "No cluster found" });
    res.json(info);
  } catch (error) {
    console.error("Error fetching cluster info:", error);
    res.status(500).json({ message: "Failed to fetch cluster", error: error.message });
  }
};

// ─── Get cluster events for a cluster root ───────────────────────────────────
exports.getClusterEvents = async (req, res) => {
  try {
    const { clusterId } = req.params;
    const events = await getClusterEvents(clusterId);
    res.json(events);
  } catch (error) {
    console.error("Error fetching cluster events:", error);
    res.status(500).json({ message: "Failed to fetch cluster events", error: error.message });
  }
};

// ─── Update vehicle location (for tracking) ─────────────────────────────────
exports.updateVehicleLocation = async (req, res) => {
  try {
    const { vehicleId, vehicleType, latitude, longitude } = req.body;
    if (!vehicleId || latitude == null || longitude == null) {
      return res.status(400).json({ message: "Missing vehicleId, latitude, or longitude" });
    }

    let updated;
    if (vehicleType === "FIRE_BRIGADE") {
      updated = await prisma.fireBrigade.update({ where: { id: vehicleId }, data: { latitude, longitude } });
    } else if (vehicleType === "POLICE") {
      updated = await prisma.policeUnit.update({ where: { id: vehicleId }, data: { latitude, longitude } });
    } else {
      updated = await prisma.ambulance.update({ where: { id: vehicleId }, data: { latitude, longitude } });
    }

    const io = socket.getIO();
    io.emit("VEHICLE_LOCATION_UPDATE", {
      vehicleId: updated.id,
      vehicleNo: updated.vehicleNo,
      vehicleType: vehicleType || "AMBULANCE",
      latitude: updated.latitude,
      longitude: updated.longitude,
      status: updated.status,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: "Location updated", vehicle: updated });
  } catch (error) {
    console.error("Error updating vehicle location:", error);
    res.status(500).json({ message: "Failed to update location", error: error.message });
  }
};