const prisma = require("../config/db");

exports.createAccident = async (req, res) => {
    const { latitude, longitude, severity, detectedBy } = req.body;

    const accident = await prisma.accident.create({
        data: {
            latitude,
            longitude,
            severity,
            detectedBy
        }
    });

    res.status(201).json(accident);
};