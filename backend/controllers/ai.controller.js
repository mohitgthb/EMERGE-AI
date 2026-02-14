const prisma = require("../config/db");
const { autoDispatch } = require("../services/dispatchService");
const socket = require("../socket");

exports.handleDetection = async (req, res) => {
  const {
    accident_detected,
    confidence,
    severity,
    latitude,
    longitude,
    clip_path
  } = req.body;

  // Ignore low confidence
  if (!accident_detected || confidence < 0.75) {
    return res.status(200).json({ message: "Detection ignored" });
  }

  try {
    // 1️⃣ Create accident record
    const accident = await prisma.accident.create({
      data: {
        latitude,
        longitude,
        severity: severity || "HIGH",
        detectedBy: "CAMERA",
        confidence,
        cameraId: "AI_CAMERA"
      }
    });

    // 2️⃣ Auto dispatch
    const dispatch = await autoDispatch(accident);

    // 3️⃣ Emit real-time event
    socket.getIO().emit("ACCIDENT_CONFIRMED", {
      accidentId: accident.id,
      clip: clip_path
    });

    res.status(201).json({
      message: "Accident processed",
      accident,
      dispatch
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal error" });
  }
};
