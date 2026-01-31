const prisma = require("../config/db");

exports.createAccident = async (req, res) => {
    const { latitude, longitude, severity, detectedBy, confidence, cameraId } = req.body;

    if (confidence && confidence < 0.6) {
        return res.status(200).json({ message: "Low confidence, ignored" });
    }

    const accident = await prisma.accident.create({
        data: {
            latitude,
            longitude,
            severity,
            detectedBy,
            confidence,
            cameraId
        }
    });

    res.status(201).json(accident);
};


//how ml service interact with the backend 

// import requests

// data = {
//   "latitude": 28.6139,
//   "longitude": 77.2090,
//   "severity": "HIGH",
//   "detectedBy": "CAMERA",
//   "confidence": 0.92,
//   "cameraId": "CAM_12"
// }

// requests.post(
//   "http://backend-server/api/accidents",
//   json=data,
//   timeout=2
// )
