const prisma = require("../config/db");
const { dispatchEmergency } = require("../services/emergencyDispatchService");
const socket = require("../socket");

const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

exports.createAccident = async (req, res) => {
  const { latitude, longitude, severity, detectedBy, confidence, cameraId, emergencyType = "ACCIDENT" } = req.body;

  if (latitude == null || longitude == null || !severity || !detectedBy) {
    return res.status(400).json({ message: "Missing required fields: latitude, longitude, severity, detectedBy" });
  }

  if (confidence && confidence < LOW_CONFIDENCE_THRESHOLD) {
    return res.status(200).json({ message: "Low confidence, ignored" });
  }

  const accident = await prisma.accident.create({
    data: {
      latitude,
      longitude,
      severity,
      detectedBy,
      confidence,
      cameraId,
      emergencyType,
    },
  });

  socket.getIO().emit("new_accident", accident);

  if (confidence && confidence >= LOW_CONFIDENCE_THRESHOLD && confidence < HIGH_CONFIDENCE_THRESHOLD) {
    const queueEntry = await prisma.emergencyQueue.create({
      data: {
        emergencyType: "ACCIDENT",
        emergencyId: accident.id,
        confidence,
        severity,
        latitude,
        longitude,
        status: "PENDING",
      },
    });

    socket.getIO().emit("EMERGENCY_QUEUED", {
      queueEntryId: queueEntry.id,
      accidentId: accident.id,
      confidence,
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
    emergencyType,
  });

  if (dispatch) {
    socket.getIO().emit("EMERGENCY_STARTED", {
      accidentId: accident.id,
      dispatchId: dispatch.id,
      timestamp: new Date().toISOString(),
    });

    socket.getIO().emit("AMBULANCE_ASSIGNED", {
      accidentId: accident.id,
      dispatchId: dispatch.id,
      ambulanceId: dispatch.ambulanceId,
      hospitalId: dispatch.hospitalId,
      route: {
        provider: dispatch.routeProvider,
        distanceKm: dispatch.routeDistanceKm,
        durationSec: dispatch.routeDurationSec,
        geometry: dispatch.routeGeometry,
      },
    });
  }

  res.status(201).json({ accident, dispatch });
};

exports.listAccidents = async (req, res) => {
  try {
    const accidents = await prisma.accident.findMany({
      include: { dispatch: true, queueEntry: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(accidents);
  } catch (error) {
    console.error("Error listing accidents:", error);
    res.status(500).json({ message: "Failed to fetch accidents", error: error.message });
  }
};

exports.getAccident = async (req, res) => {
  try {
    const { id } = req.params;
    const accident = await prisma.accident.findUnique({
      where: { id },
      include: { dispatch: true, queueEntry: true },
    });
    if (!accident) return res.status(404).json({ message: "Accident not found" });
    res.json(accident);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch accident", error: error.message });
  }
};
