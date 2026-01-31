const prisma = require("../config/db");

//distance calculation
function distance(a, b) {
    return Math.sqrt(
        Math.pow(a.latitude - b.latitude, 2) +
        Math.pow(a.longitude - b.longitude, 2)
    );
}

exports.dispatchAmbulance = async (req, res) => {
    const { accidentId } = req.body;

    const accident = await prisma.accident.findUnique({
        where: { id: accidentId }
    });

    if(!accident) return res.status(404).json({ message: "Accident not found" });

    const ambulances = await prisma.ambulance.findMany({
        where: { status: 'AVAILABLE' }
    });

    if(ambulances.length === 0) {
        return res.status(404).json({ message: "No available ambulances" });
    }

    //finding nearest ambulance
    let nearest = ambulances[0];
    let minDist = distance(accident, nearest);

    for(let amb of ambulances) {
        const d = distance(accident, amb);
        if(d < minDist) {
            minDist = d;
            nearest = amb;
        }
    }

    const hospital = await prisma.hospital.findFirst();

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

    res.json(dispatch);
};