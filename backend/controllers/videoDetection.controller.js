const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const prisma = require("../config/db");
const { dispatchEmergency } = require("../services/emergencyDispatchService");
const socket = require("../socket");

exports.processVideo = async (req, res) => {
  try {
    const videoPath = req.file.path; // uploaded via multer

    // 1️⃣ Send video to AI detection service
    const form = new FormData();
    form.append("file", fs.createReadStream(videoPath));

    const aiResponse = await axios.post(
      "http://localhost:8000/detect/video",
      form,
      { headers: form.getHeaders() }
    );

    const result = aiResponse.data;

    // 2️⃣ If no accident detected → stop
    if (!result.accident_detected || result.confidence < 0.75) {
      return res.json({ message: "No emergency detected", result });
    }

    // 3️⃣ Create accident in DB
    const accident = await prisma.accident.create({
      data: {
        latitude: result.latitude,
        longitude: result.longitude,
        severity: result.severity,
        detectedBy: "CAMERA",
        confidence: result.confidence,
        cameraId: result.accident_id || "VIDEO_UPLOAD"
      }
    });

    // 4️⃣ Auto dispatch
    const dispatch = await dispatchEmergency({ accident, type: "ACCIDENT", emergencyType: "ACCIDENT" });

    // 5️⃣ Emit real-time update
    socket.getIO().emit("ACCIDENT_CONFIRMED", {
      accidentId: accident.id,
      severity: result.severity,
      clip: result.clip_path
    });

    res.json({
      message: "Emergency triggered",
      accident,
      dispatch
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Video processing failed" });
  }
};
