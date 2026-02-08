const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const { selectBestHospital } = require("../services/hospitalSelector");
const socket = require("../socket");
const { getRoute } = require("../services/routingService");

//distance calculation
// function distance(a, b) {
//     return Math.sqrt(
//         Math.pow(a.latitude - b.latitude, 2) +
//         Math.pow(a.longitude - b.longitude, 2)
//     );
// }

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

    // Generate route from ambulance to hospital
    const route = await getRoute({
        fromLat: nearest.latitude,
        fromLng: nearest.longitude,
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
                    routeProvider: route.provider,
                    routeDistanceKm: route.distanceKm,
                    routeDurationSec: route.durationSec,
                    routeGeometry: route.geometry || null,
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
            provider: route.provider,
            distanceKm: route.distanceKm,
            durationSec: route.durationSec,
            geometry: route.geometry,
        }
    });

    res.json({
        dispatch,
        assignedAmbulance: nearest,
        assignedHospital: hospital,
        route: {
            provider: route.provider,
            distanceKm: route.distanceKm,
            durationSec: route.durationSec,
            geometry: route.geometry,
        }
    });
};