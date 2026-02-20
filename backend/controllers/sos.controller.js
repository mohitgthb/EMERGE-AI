const prisma = require("../config/db");
const { dispatchEmergency } = require("../services/emergencyDispatchService");
const { findNearbyCluster, mergeIntoCluster } = require("../services/incidentClusterService");
const socket = require("../socket");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

const AI_API_URL = process.env.AI_API_URL || "http://localhost:8000";

// ─── Multer setup ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
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
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Only image files are allowed"));
  },
}).single("emergencyImage");

exports.uploadMiddleware = upload;

// ─── Helper: rate-limit check ─────────────────────────────────────────────────
async function checkRateLimit(deviceFingerprint) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
  const recentSOS = await prisma.sOSEvent.findMany({
    where: { deviceFingerprint, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (recentSOS.length > 0 && recentSOS[0].sosCount >= 3) {
    const timeSinceLastSOS = now.getTime() - recentSOS[0].createdAt.getTime();
    const retryAfter = Math.ceil((5 * 60 * 1000 - timeSinceLastSOS) / 1000);
    return { limited: true, retryAfter };
  }

  return { limited: false, sosCount: recentSOS.length > 0 ? recentSOS[0].sosCount + 1 : 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-Type SOS with image + emergencyType
// Frontend sends emergencyType: ACCIDENT | FIRE | CRIME
//   ACCIDENT → AI verify via /analyze → create Accident → dispatch ambulance
//   FIRE     → AI verify via /analyze → create FireIncident → dispatch fire brigade
//   CRIME    → skip AI, create directly → dispatch police + instant POLICE_ALERT
// ═══════════════════════════════════════════════════════════════════════════════
exports.verifySOSWithImage = async (req, res) => {
  try {
    const { latitude, longitude, timestamp, deviceRole, emergencyType: requestedType } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Location (latitude, longitude) required" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Image file required" });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const imagePath = path.join(__dirname, "../uploads", req.file.filename);
    const deviceIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const deviceFingerprint = `${deviceIP}_${userAgent}`;

    // Rate limit
    const rateCheck = await checkRateLimit(deviceFingerprint);
    if (rateCheck.limited) {
      return res.status(429).json({ message: "Rate limit exceeded.", retryAfter: rateCheck.retryAfter });
    }
    const sosCount = rateCheck.sosCount;
    const now = new Date();
    const io = socket.getIO();

    // ─── CRIME PATH ──────────────────────────────────────────────────
    if (requestedType === "CRIME") {
      // Check for nearby cluster first
      const cluster = await findNearbyCluster({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        emergencyType: "SAFETY",
      });

      const sosEvent = await prisma.sOSEvent.create({
        data: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          emergencyType: "SAFETY",
          severity: "HIGH",
          imageUrl,
          deviceIP,
          deviceMAC: null,
          userAgent,
          deviceFingerprint,
          status: "CONFIRMED",
          isVerified: true,
          verificationMethod: "DIRECT",
          sosCount,
          lastSOSAt: now,
          clusterId: cluster ? cluster.clusterId : null,
        },
      });

      // If clustered, merge and don't create new dispatch
      if (cluster) {
        const parentEvent = await mergeIntoCluster(sosEvent.id, cluster.clusterId, imageUrl);
        return res.status(201).json({
          event_type: "CRIME",
          confidence: 1.0,
          incident_id: cluster.clusterId,
          dispatch_created: false,
          clustered: true,
          clusterCount: parentEvent.clusterCount,
          severityScore: parentEvent.severityScore,
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
      }

      io.emit("SOS_TRIGGERED", {
        sosEventId: sosEvent.id,
        latitude: sosEvent.latitude,
        longitude: sosEvent.longitude,
        emergencyType: "SAFETY",
        severity: sosEvent.severity,
        imageUrl,
        deviceIP,
        timestamp: sosEvent.createdAt,
      });

      io.emit("NEW_INCIDENT", {
        id: sosEvent.id,
        type: "CRIME",
        emergencyType: "SAFETY",
        latitude: sosEvent.latitude,
        longitude: sosEvent.longitude,
        severity: sosEvent.severity,
        imageUrl,
        timestamp: sosEvent.createdAt,
      });

      // Dispatch nearest police
      let dispatch = null;
      try {
        dispatch = await dispatchEmergency({
          sosEvent,
          type: "SOS",
          emergencyType: "SAFETY",
        });

        if (dispatch) {
          io.emit("DISPATCH_CREATED", {
            sosEventId: sosEvent.id,
            dispatchId: dispatch.id,
            dispatchType: "POLICE",
            timestamp: new Date().toISOString(),
          });

          // POLICE_ALERT: instant popup + loud sound on police dashboard
          io.emit("POLICE_ALERT", {
            sosEventId: sosEvent.id,
            dispatchId: dispatch.id,
            type: "CRIME",
            latitude: sosEvent.latitude,
            longitude: sosEvent.longitude,
            severity: "HIGH",
            imageUrl,
            timestamp: new Date().toISOString(),
          });

          io.emit("VEHICLE_EN_ROUTE", {
            sosEventId: sosEvent.id,
            dispatchId: dispatch.id,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (dispatchErr) {
        console.error("Police dispatch error:", dispatchErr.message);
      }

      return res.status(201).json({
        event_type: "CRIME",
        confidence: 1.0,
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
    }

    // ─── ACCIDENT / FIRE PATH: AI verification ──────────────────────
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
        if (requestedType === "FIRE") {
          aiResult.event_type = d.fire_detected || d.accident_detected ? "FIRE" : "NONE";
          aiResult.confidence = d.confidence || (d.fire_detected ? 0.9 : 0);
        } else {
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
      }
    } catch (aiError) {
      console.warn("AI verification unavailable:", aiError.message);
      aiResult = {
        event_type: requestedType === "FIRE" ? "FIRE" : "ACCIDENT",
        confidence: 0.6,
      };
    }

    const emergencyType =
      aiResult.event_type === "FIRE" ? "FIRE" :
      aiResult.event_type === "ACCIDENT" ? "ACCIDENT" : "MEDICAL";

    // Check for nearby cluster before creating new incident
    const cluster = aiResult.event_type !== "NONE"
      ? await findNearbyCluster({
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          emergencyType,
        })
      : null;

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
        clusterId: cluster ? cluster.clusterId : null,
      },
    });

    // If clustered, merge and return without new dispatch
    if (cluster) {
      const parentEvent = await mergeIntoCluster(sosEvent.id, cluster.clusterId, imageUrl);
      io.emit("SOS_TRIGGERED", {
        sosEventId: sosEvent.id,
        latitude: sosEvent.latitude,
        longitude: sosEvent.longitude,
        emergencyType,
        severity: sosEvent.severity,
        imageUrl,
        deviceIP,
        timestamp: sosEvent.createdAt,
      });

      return res.status(201).json({
        event_type: aiResult.event_type,
        confidence: aiResult.confidence,
        incident_id: cluster.clusterId,
        dispatch_created: false,
        clustered: true,
        clusterCount: parentEvent.clusterCount,
        severityScore: parentEvent.severityScore,
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
    }

    io.emit("SOS_TRIGGERED", {
      sosEventId: sosEvent.id,
      latitude: sosEvent.latitude,
      longitude: sosEvent.longitude,
      emergencyType,
      severity: sosEvent.severity,
      imageUrl,
      deviceIP,
      timestamp: sosEvent.createdAt,
    });

    // If emergency detected → create incident record + dispatch
    let dispatch = null;
    let incident = null;
    if (aiResult.event_type !== "NONE") {
      try {
        if (aiResult.event_type === "FIRE") {
          incident = await prisma.fireIncident.create({
            data: {
              latitude: parseFloat(latitude),
              longitude: parseFloat(longitude),
              severity: aiResult.confidence >= 0.8 ? "CRITICAL" : "HIGH",
              detectedBy: "SOS_CAMERA",
              confidence: aiResult.confidence,
            },
          });

          io.emit("FIRE_DETECTED", incident);
          io.emit("NEW_INCIDENT", {
            id: incident.id,
            type: "FIRE",
            emergencyType: "FIRE",
            latitude: incident.latitude,
            longitude: incident.longitude,
            severity: incident.severity,
            confidence: incident.confidence,
            imageUrl,
            timestamp: incident.createdAt,
          });

          dispatch = await dispatchEmergency({
            fireIncident: incident,
            sosEvent,
            type: "SOS",
            emergencyType: "FIRE",
          });
        } else {
          // ACCIDENT
          incident = await prisma.accident.create({
            data: {
              latitude: parseFloat(latitude),
              longitude: parseFloat(longitude),
              severity: aiResult.confidence >= 0.8 ? "CRITICAL" : "HIGH",
              detectedBy: "SOS_CAMERA",
              confidence: aiResult.confidence,
              emergencyType: "ACCIDENT",
            },
          });

          io.emit("new_accident", incident);
          io.emit("NEW_INCIDENT", {
            id: incident.id,
            type: "ACCIDENT",
            emergencyType: "ACCIDENT",
            latitude: incident.latitude,
            longitude: incident.longitude,
            severity: incident.severity,
            confidence: incident.confidence,
            imageUrl,
            timestamp: incident.createdAt,
          });

          dispatch = await dispatchEmergency({
            accident: incident,
            sosEvent,
            type: "SOS",
            emergencyType: "ACCIDENT",
          });
        }

        if (dispatch) {
          io.emit("INCIDENT_CONFIRMED", {
            sosEventId: sosEvent.id,
            incidentId: incident.id,
            event_type: aiResult.event_type,
            confidence: aiResult.confidence,
            dispatchId: dispatch.id,
            timestamp: new Date().toISOString(),
          });

          io.emit("DISPATCH_CREATED", {
            sosEventId: sosEvent.id,
            incidentId: incident.id,
            dispatchId: dispatch.id,
            dispatchType: aiResult.event_type === "FIRE" ? "FIRE" : "AMBULANCE",
            timestamp: new Date().toISOString(),
          });

          io.emit("VEHICLE_EN_ROUTE", {
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
    res.status(500).json({ message: "Failed to verify SOS", error: error.message });
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

    const rateCheck = await checkRateLimit(deviceInfo.deviceFingerprint);
    if (rateCheck.limited) {
      return res.status(429).json({ message: "Rate limit exceeded.", retryAfter: rateCheck.retryAfter });
    }

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
        sosCount: rateCheck.sosCount,
        lastSOSAt: now,
      },
    });

    const io = socket.getIO();

    io.emit("SOS_TRIGGERED", {
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
          data: { status: "CONFIRMED", isVerified: true, verificationMethod: "AUTO" },
        });

        io.emit("SOS_CONFIRMED", {
          sosEventId: sosEvent.id,
          dispatchId: dispatch.id,
          timestamp: new Date().toISOString(),
        });

        io.emit("DISPATCH_CREATED", {
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
    res.status(500).json({ message: "Failed to create SOS event", error: error.message });
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
