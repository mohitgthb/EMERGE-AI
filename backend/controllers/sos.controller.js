const prisma = require("../config/db");

exports.triggerSOS = async (req, res) => {
    try {
        const {
            latitude,
            longitude,
            severity = "HIGH",
            source = "MOBILE",
            userId = null
        } = req.body;

        console.log("SOS Request received:", { latitude, longitude, severity, source });

        if(latitude == null || longitude == null) {
            return res.status(400).json({ message: "Location required"});
        }

        const sosEvent = await prisma.accident.create({
            data: {
                latitude,
                longitude,
                severity,
                detectedBy: "SOS",
                cameraId: source
            },
        });

        console.log("SOS Event created:", sosEvent);

        res.status(201).json({
            message: "SOS triggered",
            accidentId: sosEvent.id,
        });
    } catch (error) {
        console.error("Error creating SOS event:", error);
        res.status(500).json({ 
            message: "Failed to create SOS event", 
            error: error.message 
        });
    }
};