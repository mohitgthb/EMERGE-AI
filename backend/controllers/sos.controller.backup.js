const prisma = require("../config/db");
const { dispatchEmergency } = require("../services/emergencyDispatchService");
const socket = require("../socket");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

const AI_API_URL = process.env.AI_API_URL || "http://localhost:8000";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "sos-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  },
}).single("emergencyImage");

exports.uploadMiddleware = upload;

// ─── Verify SOS with AI image analysis ────────────────────────────────────────
exports.verifySOSWithImage = async (req, res) => {
  try {
    const { latitude, longitude, timestamp, deviceRole } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Location (latitude, longitude) required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Image file required" });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const imagePath = path.join(__dirname, "../uploads", req.file.filename);

    // Device info from middleware or request
    const deviceIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const deviceFingerprint = `${deviceIP}_${userAgent}`;

    // Rate limit check
    const now = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
    const recentSOS = await prisma.sOSEvent.findMany({
      where: {
        deviceFingerprint,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    if (recentSOS.length > 0 && recentSOS[0].sosCount >= 3) {
      const timeSinceLastSOS = now.getTime() - recentSOS[0].createdAt.getTime();
      const retryAfter = Math.ceil((5 * 60 * 1000 - timeSinceLastSOS) / 1000);
      return res.status(429).json({
        message: "Rate limit exceeded. Too many SOS requests.",
        retryAfter,
      });
    }

    const sosCount = recentSOS.length > 0 ? recentSOS[0].sosCount + 1 : 1;

    // Call AI model for image verification
    let aiResult = { event_type: "NONE", confidence: 0 };
    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(imagePath));

      const aiResponse = await axios.post(`${AI_API_URL}/analyze`, formData, {
        headers: { ...formData.getHeaders() },
        timeout: 30000,
      });

      if (aiResponse.data) {
        const d = aiResponse.data;
        if (d.accident_detected) {
          aiResult.event_type = "ACCIDENT";
          aiResult.confidence = d.confidence || 0.9;
        } else if (d.fire_detected) {
          aiResult.event_type = "FIRE";
          aiResult.confidence = d.confidence || 0.9;
        } else {
          aiResult.event_type = "NONE";
          aiResult.confidence = d.confidence || 0;
        }
      }
    } catch (aiError) {
      console.warn("AI verification unavailable, defaulting to manual review:", aiError.message);
      // If AI is unavailable, treat as a legitimate SOS that needs dispatch
      aiResult = { event_type: "ACCIDENT", confidence: 0.6 };
    }

    const emergencyType = aiResult.event_type === "FIRE" ? "FIRE" :
                          aiResult.event_type === "ACCIDENT" ? "ACCIDENT" : "MEDICAL";

    // Create SOS event regardless of AI result
    const sosEvent = await prisma.sOSEvent.create({
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        emergencyType,
        severity: aiResult.confidence >= 0.8 ? "CRITICAL" : "HIGH",
        imageUrl,
        deviceIP,
        deviceMAC: null,
        userAgent,
        deviceFingerprint,
        status: aiResult.event_type === "NONE" ? "PENDING" : "CONFIRMED",
        isVerified: aiResult.event_type !== "NONE",
        verificationMethod: "AI",
        sosCount,
        lastSOSAt: now,
      },
    });

    socket.getIO().emit("SOS_TRIGGERED", {
      sosEventId: sosEvent.id,
      latitude: sosEvent.latitude,
      longitude: sosEvent.longitude,
      emergencyType,
      severity: sosEvent.severity,
      imageUrl,
      deviceIP,
      timestamp: sosEvent.createdAt,
    });

    // If emergency detected, dispatch immediately
    let dispatch = null;
    if (aiResult.event_type !== "NONE") {
      try {
        dispatch = await dispatchEmergency({
          sosEvent,
          type: "SOS",
          emergencyType,
        });

        if (dispatch) {
          socket.getIO().emit("INCIDENT_CONFIRMED", {
            sosEventId: sosEvent.id,
            event_type: aiResult.event_type,
            confidence: aiResult.confidence,
            dispatchId: dispatch.id,
            timestamp: new Date().toISOString(),
          });

          socket.getIO().emit("DISPATCH_CREATED", {
            sosEventId: sosEvent.id,
            dispatchId: dispatch.id,
            timestamp: new Date().toISOString(),
          });

          socket.getIO().emit("VEHICLE_EN_ROUTE", {
            sosEventId: sosEvent.id,
            dispatchId: dispatch.id,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (dispatchErr) {
        console.error("Dispatch error (SOS still recorded):", dispatchErr.message);
      }
    }

    return res.status(aiResult.event_type === "NONE" ? 200 : 201).json({
      event_type: aiResult.event_type,
      confidence: aiResult.confidence,
      incident_id: sosEvent.id,
      dispatch_created: dispatch !== null,
      dispatch: dispatch || undefined,
      sosEvent: {
        id: sosEvent.id,
        latitude: sosEvent.latitude,
        longitude: sosEvent.longitude,
        emergencyType: sosEvent.emergencyType,
        severity: sosEvent.severity,
        status: sosEvent.status,
        imageUrl: sosEvent.imageUrl,
      },
    });
  } catch (error) {
    console.error("Error in SOS verify:", error);
    res.status(500).json({
      message: "Failed to verify SOS",
      error: error.message,
    });
  }
};

exports.triggerSOS = async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      emergencyType = "MEDICAL",
      severity = "HIGH",
      deviceMAC,
    } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Location required" });
    }

    const deviceInfo = req.deviceInfo;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const now = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

    const recentSOS = await prisma.sOSEvent.findMany({
      where: {
        deviceFingerprint: deviceInfo.deviceFingerprint,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const sosCount = recentSOS.length > 0 ? recentSOS[0].sosCount + 1 : 1;

    const sosEvent = await prisma.sOSEvent.create({
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        emergencyType,
        severity,
        imageUrl,
        deviceIP: deviceInfo.deviceIP,
        deviceMAC: deviceMAC || null,
        userAgent: deviceInfo.userAgent,
        deviceFingerprint: deviceInfo.deviceFingerprint,
        status: "PENDING",
        isVerified: false,
        sosCount,
        lastSOSAt: now,
      },
    });

    socket.getIO().emit("SOS_TRIGGERED", {
      sosEventId: sosEvent.id,
      latitude: sosEvent.latitude,
      longitude: sosEvent.longitude,
      emergencyType,
      severity,
      imageUrl,
      deviceIP: deviceInfo.deviceIP,
      timestamp: sosEvent.createdAt,
    });

    if (!imageUrl) {
      const dispatch = await dispatchEmergency({
        sosEvent,
        type: "SOS",
        emergencyType,
      });

      if (dispatch) {
        await prisma.sOSEvent.update({
          where: { id: sosEvent.id },
          data: {
            status: "CONFIRMED",
            isVerified: true,
            verificationMethod: "AUTO",
          },
        });

        socket.getIO().emit("SOS_CONFIRMED", {
          sosEventId: sosEvent.id,
          dispatchId: dispatch.id,
          timestamp: new Date().toISOString(),
        });

        return res.status(201).json({
          message: "SOS triggered and help dispatched",
          sosEventId: sosEvent.id,
          dispatch,
        });
      }
    }

    return res.status(202).json({
      message: "SOS received. Awaiting image verification.",
      sosEventId: sosEvent.id,
      status: "PENDING_VERIFICATION",
    });
  } catch (error) {
    console.error("Error creating SOS event:", error);
    res.status(500).json({
      message: "Failed to create SOS event",
      error: error.message,
    });
  }
};

exports.verifySOSEvent = async (req, res) => {
  try {
    const { sosEventId } = req.params;
    const { isConfirmed, notes } = req.body;

    const sosEvent = await prisma.sOSEvent.findUnique({
      where: { id: sosEventId },
    });

    if (!sosEvent) {
      return res.status(404).json({ message: "SOS event not found" });
    }

    if (isConfirmed) {
      const dispatch = await dispatchEmergency({
        sosEvent,
        type: "SOS",
        emergencyType: sosEvent.emergencyType,
      });

      await prisma.sOSEvent.update({
        where: { id: sosEventId },
        data: {
          status: "CONFIRMED",
          isVerified: true,
          verificationMethod: "MANUAL",
        },
      });

      socket.getIO().emit("SOS_CONFIRMED", {
        sosEventId: sosEvent.id,
        dispatchId: dispatch?.id,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        message: "SOS confirmed and help dispatched",
        dispatch,
      });
    } else {
      await prisma.sOSEvent.update({
        where: { id: sosEventId },
        data: { status: "REJECTED" },
      });

      socket.getIO().emit("SOS_REJECTED", {
        sosEventId: sosEvent.id,
        timestamp: new Date().toISOString(),
      });

      return res.json({ message: "SOS rejected" });
    }
  } catch (error) {
    console.error("Error verifying SOS event:", error);
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

exports.escalateSOSEvent = async (req, res) => {
  try {
    const { sosEventId } = req.params;

    const sosEvent = await prisma.sOSEvent.update({
      where: { id: sosEventId },
      data: {
        status: "ESCALATED",
        severity: "CRITICAL",
      },
    });

    const dispatch = await dispatchEmergency({
      sosEvent,
      type: "SOS",
      emergencyType: sosEvent.emergencyType,
      priority: "CRITICAL",
    });

    socket.getIO().emit("SOS_ESCALATED", {
      sosEventId: sosEvent.id,
      dispatchId: dispatch?.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: "SOS escalated to critical priority",
      dispatch,
    });
  } catch (error) {
    console.error("Error escalating SOS event:", error);
    res.status(500).json({ message: "Escalation failed", error: error.message });
  }
};

exports.listSOSEvents = async (req, res) => {
  try {
    const { status, emergencyType } = req.query;

    const where = {};
    if (status) where.status = status;
    if (emergencyType) where.emergencyType = emergencyType;

    const sosEvents = await prisma.sOSEvent.findMany({
      where,
      include: {
        policeDispatch: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(sosEvents);
  } catch (error) {
    console.error("Error listing SOS events:", error);
    res.status(500).json({ message: "Failed to fetch SOS events", error: error.message });
  }
};
