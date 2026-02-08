const prisma = require("../config/db");

exports.getAllSignals = async (req, res) => {
    const signals = await prisma.trafficSignal.findMany();
    res.json(signals);
};

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