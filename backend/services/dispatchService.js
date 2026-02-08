const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const { selectBestHospital } = require("./hospitalSelector");
const { getRoute } = require("./routingService");

exports.autoDispatch = async (accident) => {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Check if dispatch already exists (idempotency)
    const existingDispatch = await prisma.dispatch.findUnique({
      where: { accidentId: accident.id },
    });

    if (existingDispatch) {
      return existingDispatch;
    }

    const ambulances = await prisma.ambulance.findMany({
      where: { status: "AVAILABLE" },
    });

    if (ambulances.length === 0) {
      return null;
    }

    // finding nearest ambulance
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

    // Generate route from ambulance to hospital
    const route = await getRoute({
      fromLat: nearest.latitude,
      fromLng: nearest.longitude,
      toLat: hospital.latitude,
      toLng: hospital.longitude,
    });

    try {
      // Atomic reservation/decrement inside a single transaction
      // - reserve ambulance only if it's still AVAILABLE
      // - decrement hospital beds only if beds > 0
      return await prisma.$transaction(async (tx) => {
        const reservedAmbulance = await tx.ambulance.updateMany({
          where: { id: nearest.id, status: "AVAILABLE" },
          data: { status: "BUSY" },
        });

        if (reservedAmbulance.count === 0) {
          throw new Error("AMBULANCE_TAKEN");
        }

        const decrementedBeds = await tx.hospital.updateMany({
          where: { id: hospital.id, beds: { gt: 0 } },
          data: { beds: { decrement: 1 } },
        });

        if (decrementedBeds.count === 0) {
          throw new Error("NO_BEDS");
        }

        const dispatch = await tx.dispatch.create({
          data: {
            accidentId: accident.id,
            ambulanceId: nearest.id,
            hospitalId: hospital.id,
            routeProvider: route.provider,
            routeDistanceKm: route.distanceKm,
            routeDurationSec: route.durationSec,
            routeGeometry: route.geometry || null,
          },
        });

        return dispatch;
      });
    } catch (e) {
      // Prisma unique constraint / race conditions: retry a few times
      if (e?.code === "P2002") {
        continue;
      }
      if (e?.message === "AMBULANCE_TAKEN" || e?.message === "NO_BEDS") {
        continue;
      }

      throw e;
    }
  }

  throw new Error("Failed to auto-dispatch after retries");
};
