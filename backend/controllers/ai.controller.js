const prisma = require("../config/db");
const { autoDispatch } = require("../services/dispatchService");
const socket = require("../socket");

exports.handleDetection = async (req, res) => {
  console.log("\n🔔 Received AI detection callback");
  console.log("   Request body:", JSON.stringify(req.body, null, 2));
  
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
    console.log(`⚠️  Detection ignored (confidence: ${confidence})`);
    return res.status(200).json({ message: "Detection ignored" });
  }
  
  console.log(`✅ Processing accident (confidence: ${confidence}, severity: ${severity})`);

  try {
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

    console.log(`✅ Accident created in DB: ID ${accident.id}`);

    const dispatch = await autoDispatch(accident);
    console.log(`🚑 Ambulance dispatched: ${dispatch?.ambulanceId || 'N/A'}`);

    socket.getIO().emit("ACCIDENT_CONFIRMED", {
      accidentId: accident.id,
      clip: clip_path
    });
    console.log("📡 WebSocket event emitted: ACCIDENT_CONFIRMED");

    res.status(201).json({
      message: "Accident processed",
      accident,
      dispatch
    });

  } catch (err) {
    console.error("❌ Error processing accident:", err.message);
    console.error(err.stack);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};
