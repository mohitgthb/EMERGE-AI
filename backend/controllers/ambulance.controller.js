const prisma = require("../config/db");
const socket = require("../socket");
const { activeGreenCorridor, resetSignals } = require("../services/greenCorridor");

exports.getAllAmbulances = async (req, res) => {
  const ambulances = await prisma.ambulance.findMany();
  res.json(ambulances);
};

exports.addAmbulance = async (req, res) => {
  const { vehicleNo, latitude, longitude } = req.body;

  if (!vehicleNo || latitude == null || longitude == null) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const ambulance = await prisma.ambulance.create({
    data: {
      vehicleNo,
      latitude,
      longitude,
      status: "AVAILABLE",
    },
  });

  res.status(201).json(ambulance);
};


exports.updateAmbulanceStatus = async (req, res) => {
  const { ambulanceId, status, latitude, longitude } = req.body;

  if (!ambulanceId) {
    return res.status(400).json({ message: "Missing required field: ambulanceId" });
  }

  // Build update payload safely (avoid writing undefined)
  const data = {};
  if (status != null) data.status = String(status).toUpperCase();
  if (latitude != null) data.latitude = latitude;
  if (longitude != null) data.longitude = longitude;

  const updated = await prisma.ambulance.update({
    where: { id: ambulanceId },
    data,
  });

  // Status event (existing)
  socket.getIO().emit("AMBULANCE_STATUS_UPDATE", {
    ambulanceId: updated.id,
    status: updated.status,
  });

  // NEW: Real-time GPS tracking event
  if (updated.latitude != null && updated.longitude != null) {
    socket.getIO().emit("AMBULANCE_LOCATION_UPDATE", {
      ambulanceId: updated.id,
      latitude: updated.latitude,
      longitude: updated.longitude,
      status: updated.status,
      timestamp: new Date().toISOString(),
    });
  }

  // Green corridor: activate whenever EN_ROUTE AND we have location (supports continuous GPS)
  if (updated.status === "EN_ROUTE" && updated.latitude != null && updated.longitude != null) {
    await activeGreenCorridor(updated);
    console.log(`Green corridor activated for ambulance ${updated.vehicleNo}`);
  }

  if (updated.status === "ARRIVED") {
    await resetSignals();
    console.log(`Green corridor reset for ambulance ID ${ambulanceId}`);
  }

  res.json({ message: "Ambulance updated", ambulance: updated });
};
