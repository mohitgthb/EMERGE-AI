const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const { selectBestHospital } = require("../services/hospitalSelector");

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

    const dispatch = await prisma.dispatch.create({
        data: {
            accidentId: accident.id,
            ambulanceId: nearest.id,
            hospitalId: hospital.id,
        }
    });

    await prisma.ambulance.update({
        where: { id: nearest.id },
        data: { status: 'BUSY' }
    });

    await prisma.hospital.update({
        where: { id: hospital.id },
        data: { beds: { decrement: 1 } }
    });

    res.json({
        dispatch,
        assignedAmbulance: nearest,
        assignedHospital: hospital
    })
};