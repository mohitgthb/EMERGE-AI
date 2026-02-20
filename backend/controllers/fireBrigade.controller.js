const prisma = require("../config/db");

exports.listFireBrigades = async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const fireBrigades = await prisma.fireBrigade.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    res.json(fireBrigades);
  } catch (error) {
    console.error("Error listing fire brigades:", error);
    res.status(500).json({ message: "Failed to fetch fire brigades", error: error.message });
  }
};

exports.createFireBrigade = async (req, res) => {
  try {
    const { vehicleNo, latitude, longitude, status = "AVAILABLE" } = req.body;

    const fireBrigade = await prisma.fireBrigade.create({
      data: { vehicleNo, latitude, longitude, status },
    });

    res.status(201).json(fireBrigade);
  } catch (error) {
    console.error("Error creating fire brigade:", error);
    res.status(500).json({ message: "Failed to create fire brigade", error: error.message });
  }
};

exports.updateFireBrigadeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, latitude, longitude } = req.body;

    const data = {};
    if (status) data.status = status;
    if (latitude != null) data.latitude = latitude;
    if (longitude != null) data.longitude = longitude;

    const fireBrigade = await prisma.fireBrigade.update({
      where: { id },
      data,
    });

    const socket = require("../socket");
    socket.getIO().emit("FIRE_BRIGADE_STATUS_UPDATE", fireBrigade);

    res.json(fireBrigade);
  } catch (error) {
    console.error("Error updating fire brigade status:", error);
    res.status(500).json({ message: "Failed to update status", error: error.message });
  }
};
