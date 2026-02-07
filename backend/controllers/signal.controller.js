const prisma = require("../config/db");

exports.addSignal = async (req, res) => {
    const { junctionId, latitude, longitude } = req.body;

    if (!junctionId || latitude == null || longitude == null) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const signal = await prisma.trafficSignal.create({
        data: {
            junctionId,
            latitude,
            longitude,
            state: "NORMAL",
        },
    });
    res.status(201).json(signal);
}