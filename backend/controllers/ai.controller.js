const prisma = require("../config/db");
const { dispatchEmergency } = require("../services/emergencyDispatchService");
const socket = require("../socket");

const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

exports.handleDetection = async (req, res) => {
  console.log("\n🔔 Received AI detection callback");
  console.log("   Request body:", JSON.stringify(req.body, null, 2));

  const {
    accident_detected,
    fire_detected,
    confidence,
    severity,
    latitude,
    longitude,
    clip_path,
    event_type,
  } = req.body;

  const emergencyType = event_type || (fire_detected ? "FIRE" : "ACCIDENT");
  const isEmergency = accident_detected || fire_detected;

  if (!isEmergency || confidence < LOW_CONFIDENCE_THRESHOLD) {
    console.log(`⚠️  Detection ignored (confidence: ${confidence})`);
    return res.status(200).json({ message: "Detection ignored" });
  }

  console.log(`✅ Processing ${emergencyType} (confidence: ${confidence}, severity: ${severity})`);

  try {
    if (emergencyType === "FIRE") {
      const fireIncident = await prisma.fireIncident.create({
        data: {
          latitude,
          longitude,
          severity: severity || "HIGH",
          detectedBy: "CAMERA",
          confidence,
          cameraId: "AI_CAMERA",
        },
      });

      console.log(`🔥 Fire incident created in DB: ID ${fireIncident.id}`);

      if (confidence >= LOW_CONFIDENCE_THRESHOLD && confidence < HIGH_CONFIDENCE_THRESHOLD) {
        const queueEntry = await prisma.emergencyQueue.create({
          data: {
            emergencyType: "FIRE",
            emergencyId: fireIncident.id,
            confidence,
            severity: severity || "HIGH",
            latitude,
            longitude,
            status: "PENDING",
          },
        });

        socket.getIO().emit("FIRE_QUEUED", {
          queueEntryId: queueEntry.id,
          fireIncidentId: fireIncident.id,
          confidence,
          clip: clip_path,
          timestamp: new Date().toISOString(),
        });

        return res.status(202).json({
          message: "Medium confidence. Queued for human review.",
          fireIncident,
          queueEntry,
        });
      }

      const dispatch = await dispatchEmergency({
        fireIncident,
        type: "FIRE",
        emergencyType: "FIRE",
      });

      console.log(`🚒 Fire brigade dispatched: ${dispatch?.fireBrigadeId || "N/A"}`);

      socket.getIO().emit("FIRE_CONFIRMED", {
        fireIncidentId: fireIncident.id,
        clip: clip_path,
        dispatchId: dispatch?.id,
      });

      return res.status(201).json({
        message: "Fire incident processed",
        fireIncident,
        dispatch,
      });
    } else {
      const accident = await prisma.accident.create({
        data: {
          latitude,
          longitude,
          severity: severity || "HIGH",
          detectedBy: "CAMERA",
          confidence,
          cameraId: "AI_CAMERA",
          emergencyType: "ACCIDENT",
        },
      });

      console.log(`✅ Accident created in DB: ID ${accident.id}`);

      if (confidence >= LOW_CONFIDENCE_THRESHOLD && confidence < HIGH_CONFIDENCE_THRESHOLD) {
        const queueEntry = await prisma.emergencyQueue.create({
          data: {
            emergencyType: "ACCIDENT",
            emergencyId: accident.id,
            confidence,
            severity: severity || "HIGH",
            latitude,
            longitude,
            status: "PENDING",
          },
        });

        socket.getIO().emit("ACCIDENT_QUEUED", {
          queueEntryId: queueEntry.id,
          accidentId: accident.id,
          confidence,
          clip: clip_path,
          timestamp: new Date().toISOString(),
        });

        return res.status(202).json({
          message: "Medium confidence. Queued for human review.",
          accident,
          queueEntry,
        });
      }

      const dispatch = await dispatchEmergency({
        accident,
        type: "ACCIDENT",
        emergencyType: "ACCIDENT",
      });

      console.log(`🚑 Ambulance dispatched: ${dispatch?.ambulanceId || "N/A"}`);

      socket.getIO().emit("ACCIDENT_CONFIRMED", {
        accidentId: accident.id,
        clip: clip_path,
        dispatchId: dispatch?.id,
      });

      return res.status(201).json({
        message: "Accident processed",
        accident,
        dispatch,
      });
    }
  } catch (err) {
    console.error("❌ Error processing emergency:", err.message);
    console.error(err.stack);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};
