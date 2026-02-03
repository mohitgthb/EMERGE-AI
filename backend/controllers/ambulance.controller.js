const prisma = require("../config/db");
const socket = require("../socket");

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
  const { ambulanceId, status } = req.body;

  await prisma.ambulance.update({
    where: { id: ambulanceId },
    data: { status },
  });

  socket.getIO().emit("AMBULANCE_STATUS_UPDATE", {
    ambulanceId,
    status,
  });

  res.json({ message: "Status updated" });
};
