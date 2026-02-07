const prisma = require("../config/db");
const socket = require("../socket");
const { activeGreenCorridor } = require("../services/greenCorridor");

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

  await prisma.ambulance.update({
    where: { id: ambulanceId },
    data: { status, latitude, longitude },
  });

  socket.getIO().emit("AMBULANCE_STATUS_UPDATE", {
    ambulanceId,
    status,
  });

  if (status === "EN_ROUTE") {
    const ambulance = await prisma.ambulance.findUnique({ where: { id: ambulanceId } });
    await activeGreenCorridor(ambulance);

    console.log(`Green corridor activated for ambulance ${ambulance.vehicleNo}`);
  }

  res.json({ message: "Status updated" });
};
