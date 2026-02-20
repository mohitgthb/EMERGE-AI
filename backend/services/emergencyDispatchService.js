const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const { selectBestHospital } = require("./hospitalSelector");
const { getRoute } = require("./routingService");
const socket = require("../socket");
const { monitorDispatch } = require("./reassignmentService");

const findNearest = (entities, latitude, longitude) => {
  if (entities.length === 0) return null;

  let nearest = entities[0];
  let minDist = distanceKm(latitude, longitude, nearest.latitude, nearest.longitude);

  for (const entity of entities) {
    const d = distanceKm(latitude, longitude, entity.latitude, entity.longitude);
    if (d < minDist) {
      minDist = d;
      nearest = entity;
    }
  }

  return nearest;
};

exports.dispatchEmergency = async ({ accident, sosEvent, fireIncident, type, emergencyType, priority }) => {
  const MAX_ATTEMPTS = 3;

  const source =
    accident ||
    sosEvent ||
    fireIncident;

  const lat = source.latitude;
  const lng = source.longitude;

  const actualEmergencyType = emergencyType || accident?.emergencyType || "ACCIDENT";

  if (actualEmergencyType === "FIRE") {
    return await dispatchFireBrigade({ fireIncident: fireIncident || accident, lat, lng, MAX_ATTEMPTS });
  } else if (actualEmergencyType === "SAFETY" && sosEvent) {
    return await dispatchPolice({ sosEvent, lat, lng, MAX_ATTEMPTS });
  } else {
    return await dispatchAmbulance({ accident: accident || sosEvent, lat, lng, MAX_ATTEMPTS });
  }
};

const dispatchAmbulance = async ({ accident, lat, lng, MAX_ATTEMPTS }) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existingDispatch = await prisma.dispatch.findUnique({
      where: { accidentId: accident.id },
    });

    if (existingDispatch) return existingDispatch;

    const ambulances = await prisma.ambulance.findMany({
      where: { status: "AVAILABLE" },
    });

    if (ambulances.length === 0) return null;

    const nearest = findNearest(ambulances, lat, lng);
    const hospital = await selectBestHospital({ latitude: lat, longitude: lng });

    // Compute dual routes: vehicle→incident and incident→hospital
    const [vehicleToIncidentRoute, incidentToHospitalRoute] = await Promise.all([
      getRoute({
        fromLat: nearest.latitude,
        fromLng: nearest.longitude,
        toLat: lat,
        toLng: lng,
      }),
      getRoute({
        fromLat: lat,
        fromLng: lng,
        toLat: hospital.latitude,
        toLng: hospital.longitude,
      }),
    ]);

    try {
      const dispatch = await prisma.$transaction(async (tx) => {
        const reservedAmbulance = await tx.ambulance.updateMany({
          where: { id: nearest.id, status: "AVAILABLE" },
          data: { status: "BUSY" },
        });

        if (reservedAmbulance.count === 0) throw new Error("AMBULANCE_TAKEN");

        const decrementedBeds = await tx.hospital.updateMany({
          where: { id: hospital.id, beds: { gt: 0 } },
          data: { beds: { decrement: 1 } },
        });

        if (decrementedBeds.count === 0) throw new Error("NO_BEDS");

        return await tx.dispatch.create({
          data: {
            accidentId: accident.id,
            ambulanceId: nearest.id,
            hospitalId: hospital.id,
            routeProvider: vehicleToIncidentRoute.provider,
            routeDistanceKm: vehicleToIncidentRoute.distanceKm,
            routeDurationSec: vehicleToIncidentRoute.durationSec,
            routeGeometry: vehicleToIncidentRoute.geometry || null,
            hospitalRouteProvider: incidentToHospitalRoute.provider,
            hospitalRouteDistanceKm: incidentToHospitalRoute.distanceKm,
            hospitalRouteDurationSec: incidentToHospitalRoute.durationSec,
            hospitalRouteGeometry: incidentToHospitalRoute.geometry || null,
          },
        });
      });

      // Create initial ACCEPTED status history entry
      try {
        await prisma.statusHistory.create({
          data: {
            dispatchId: dispatch.id,
            dispatchType: "ACCIDENT",
            vehicleId: nearest.id,
            vehicleType: "AMBULANCE",
            status: "ACCEPTED",
            latitude: nearest.latitude,
            longitude: nearest.longitude,
          },
        });
      } catch (shErr) {
        console.warn("StatusHistory create failed:", shErr.message);
      }

      // Emit to the specific ambulance operator's room
      try {
        const io = socket.getIO();
        const dispatchPayload = {
          type: "AMBULANCE_DISPATCH",
          dispatchId: dispatch.id,
          ambulanceId: nearest.id,
          accidentId: accident.id,
          hospitalId: hospital.id,
          incidentLat: lat,
          incidentLng: lng,
          vehicleToIncident: vehicleToIncidentRoute,
          incidentToHospital: incidentToHospitalRoute,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            latitude: hospital.latitude,
            longitude: hospital.longitude,
            beds: hospital.beds,
          },
          timestamp: new Date().toISOString(),
        };
        io.to(`vehicle:${nearest.id}`).emit("DISPATCH_ASSIGNED", dispatchPayload);
        io.emit("AMBULANCE_ASSIGNED", dispatchPayload);
      } catch (socketErr) {
        console.warn("Socket emit failed (dispatch still created):", socketErr.message);
      }

      // Start reassignment monitoring
      try {
        monitorDispatch({
          dispatchId: dispatch.id,
          dispatchType: "ACCIDENT",
          vehicleId: nearest.id,
          vehicleType: "AMBULANCE",
          incidentLat: lat,
          incidentLng: lng,
          initialVehicleLat: nearest.latitude,
          initialVehicleLng: nearest.longitude,
          excludeVehicleIds: [],
        });
      } catch (monitorErr) {
        console.warn("Monitor setup failed:", monitorErr.message);
      }

      return dispatch;
    } catch (e) {
      if (e?.code === "P2002" || e?.message === "AMBULANCE_TAKEN" || e?.message === "NO_BEDS") {
        continue;
      }
      throw e;
    }
  }

  throw new Error("Failed to dispatch ambulance after retries");
};

const dispatchFireBrigade = async ({ fireIncident, lat, lng, MAX_ATTEMPTS }) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existingDispatch = await prisma.fireDispatch.findUnique({
      where: { fireIncidentId: fireIncident.id },
    });

    if (existingDispatch) return existingDispatch;

    const fireBrigades = await prisma.fireBrigade.findMany({
      where: { status: "AVAILABLE" },
    });

    if (fireBrigades.length === 0) return null;

    const nearest = findNearest(fireBrigades, lat, lng);

    const route = await getRoute({
      fromLat: nearest.latitude,
      fromLng: nearest.longitude,
      toLat: lat,
      toLng: lng,
    });

    try {
      const dispatch = await prisma.$transaction(async (tx) => {
        const reserved = await tx.fireBrigade.updateMany({
          where: { id: nearest.id, status: "AVAILABLE" },
          data: { status: "BUSY" },
        });

        if (reserved.count === 0) throw new Error("FIRE_BRIGADE_TAKEN");

        return await tx.fireDispatch.create({
          data: {
            fireIncidentId: fireIncident.id,
            fireBrigadeId: nearest.id,
            routeProvider: route.provider,
            routeDistanceKm: route.distanceKm,
            routeDurationSec: route.durationSec,
            routeGeometry: route.geometry || null,
          },
        });
      });

      // Create initial ACCEPTED status history entry
      try {
        await prisma.statusHistory.create({
          data: {
            dispatchId: dispatch.id,
            dispatchType: "FIRE",
            vehicleId: nearest.id,
            vehicleType: "FIRE_BRIGADE",
            status: "ACCEPTED",
            latitude: nearest.latitude,
            longitude: nearest.longitude,
          },
        });
      } catch (shErr) {
        console.warn("StatusHistory create failed:", shErr.message);
      }

      // Emit to the specific fire brigade operator's room
      try {
        const io = socket.getIO();
        const dispatchPayload = {
          type: "FIRE_DISPATCH",
          dispatchId: dispatch.id,
          fireBrigadeId: nearest.id,
          fireIncidentId: fireIncident.id,
          incidentLat: lat,
          incidentLng: lng,
          vehicleToIncident: route,
          timestamp: new Date().toISOString(),
        };
        io.to(`vehicle:${nearest.id}`).emit("DISPATCH_ASSIGNED", dispatchPayload);
        io.emit("FIRE_BRIGADE_ASSIGNED", dispatchPayload);
      } catch (socketErr) {
        console.warn("Socket emit failed (fire dispatch still created):", socketErr.message);
      }

      // Start reassignment monitoring
      try {
        monitorDispatch({
          dispatchId: dispatch.id,
          dispatchType: "FIRE",
          vehicleId: nearest.id,
          vehicleType: "FIRE_BRIGADE",
          incidentLat: lat,
          incidentLng: lng,
          initialVehicleLat: nearest.latitude,
          initialVehicleLng: nearest.longitude,
          excludeVehicleIds: [],
        });
      } catch (monitorErr) {
        console.warn("Fire monitor setup failed:", monitorErr.message);
      }

      return dispatch;
    } catch (e) {
      if (e?.code === "P2002" || e?.message === "FIRE_BRIGADE_TAKEN") {
        continue;
      }
      throw e;
    }
  }

  throw new Error("Failed to dispatch fire brigade after retries");
};

const dispatchPolice = async ({ sosEvent, lat, lng, MAX_ATTEMPTS }) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existingDispatch = await prisma.policeDispatch.findUnique({
      where: { sosEventId: sosEvent.id },
    });

    if (existingDispatch) return existingDispatch;

    const policeUnits = await prisma.policeUnit.findMany({
      where: { status: "AVAILABLE" },
    });

    if (policeUnits.length === 0) return null;

    const nearest = findNearest(policeUnits, lat, lng);

    const route = await getRoute({
      fromLat: nearest.latitude,
      fromLng: nearest.longitude,
      toLat: lat,
      toLng: lng,
    });

    try {
      const dispatch = await prisma.$transaction(async (tx) => {
        const reserved = await tx.policeUnit.updateMany({
          where: { id: nearest.id, status: "AVAILABLE" },
          data: { status: "BUSY" },
        });

        if (reserved.count === 0) throw new Error("POLICE_TAKEN");

        return await tx.policeDispatch.create({
          data: {
            sosEventId: sosEvent.id,
            policeUnitId: nearest.id,
            routeProvider: route.provider,
            routeDistanceKm: route.distanceKm,
            routeDurationSec: route.durationSec,
            routeGeometry: route.geometry || null,
          },
        });
      });

      // Create initial ACCEPTED status history entry
      try {
        await prisma.statusHistory.create({
          data: {
            dispatchId: dispatch.id,
            dispatchType: "POLICE",
            vehicleId: nearest.id,
            vehicleType: "POLICE",
            status: "ACCEPTED",
            latitude: nearest.latitude,
            longitude: nearest.longitude,
          },
        });
      } catch (shErr) {
        console.warn("StatusHistory create failed:", shErr.message);
      }

      // Emit to the specific police unit operator's room
      try {
        const io = socket.getIO();
        const dispatchPayload = {
          type: "POLICE_DISPATCH",
          dispatchId: dispatch.id,
          policeUnitId: nearest.id,
          sosEventId: sosEvent.id,
          incidentLat: lat,
          incidentLng: lng,
          vehicleToIncident: route,
          timestamp: new Date().toISOString(),
        };
        io.to(`vehicle:${nearest.id}`).emit("DISPATCH_ASSIGNED", dispatchPayload);
        io.emit("POLICE_UNIT_ASSIGNED", dispatchPayload);
      } catch (socketErr) {
        console.warn("Socket emit failed (police dispatch still created):", socketErr.message);
      }

      // Start reassignment monitoring
      try {
        monitorDispatch({
          dispatchId: dispatch.id,
          dispatchType: "POLICE",
          vehicleId: nearest.id,
          vehicleType: "POLICE",
          incidentLat: lat,
          incidentLng: lng,
          initialVehicleLat: nearest.latitude,
          initialVehicleLng: nearest.longitude,
          excludeVehicleIds: [],
        });
      } catch (monitorErr) {
        console.warn("Police monitor setup failed:", monitorErr.message);
      }

      return dispatch;
    } catch (e) {
      if (e?.code === "P2002" || e?.message === "POLICE_TAKEN") {
        continue;
      }
      throw e;
    }
  }

  throw new Error("Failed to dispatch police after retries");
};
