const prisma = require("../config/db");

exports.createFireIncident = async (req, res) => {
  try {
    const { latitude, longitude, severity, detectedBy, confidence, cameraId } = req.body;

    if (latitude == null || longitude == null || !severity || !detectedBy) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const fireIncident = await prisma.fireIncident.create({
      data: {
        latitude,
        longitude,
        severity,
        detectedBy,
        confidence,
        cameraId,
      },
    });

    const { dispatchEmergency } = require("../services/emergencyDispatchService");
    const dispatch = await dispatchEmergency({
      fireIncident,
      type: "FIRE",
      emergencyType: "FIRE",
    });

    const socket = require("../socket");
    socket.getIO().emit("FIRE_DETECTED", fireIncident);

    if (dispatch) {
      socket.getIO().emit("FIRE_BRIGADE_DISPATCHED", {
        fireIncidentId: fireIncident.id,
        dispatchId: dispatch.id,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({ fireIncident, dispatch });
  } catch (error) {
    console.error("Error creating fire incident:", error);
    res.status(500).json({ message: "Failed to create fire incident", error: error.message });
  }
};

exports.listFireIncidents = async (req, res) => {
  try {
    const fireIncidents = await prisma.fireIncident.findMany({
      include: { dispatch: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(fireIncidents);
  } catch (error) {
    console.error("Error listing fire incidents:", error);
    res.status(500).json({ message: "Failed to fetch fire incidents", error: error.message });
  }
};

exports.getFireIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const fireIncident = await prisma.fireIncident.findUnique({
      where: { id },
      include: { dispatch: true },
    });

    if (!fireIncident) {
      return res.status(404).json({ message: "Fire incident not found" });
    }

    res.json(fireIncident);
  } catch (error) {
    console.error("Error getting fire incident:", error);
    res.status(500).json({ message: "Failed to fetch fire incident", error: error.message });
  }
};
