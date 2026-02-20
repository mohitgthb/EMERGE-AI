const prisma = require("../config/db");

exports.listPoliceUnits = async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const policeUnits = await prisma.policeUnit.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    res.json(policeUnits);
  } catch (error) {
    console.error("Error listing police units:", error);
    res.status(500).json({ message: "Failed to fetch police units", error: error.message });
  }
};

exports.createPoliceUnit = async (req, res) => {
  try {
    const { vehicleNo, latitude, longitude, status = "AVAILABLE" } = req.body;

    const policeUnit = await prisma.policeUnit.create({
      data: { vehicleNo, latitude, longitude, status },
    });

    res.status(201).json(policeUnit);
  } catch (error) {
    console.error("Error creating police unit:", error);
    res.status(500).json({ message: "Failed to create police unit", error: error.message });
  }
};

exports.updatePoliceUnitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, latitude, longitude } = req.body;

    const data = {};
    if (status) data.status = status;
    if (latitude != null) data.latitude = latitude;
    if (longitude != null) data.longitude = longitude;

    const policeUnit = await prisma.policeUnit.update({
      where: { id },
      data,
    });

    const socket = require("../socket");
    socket.getIO().emit("POLICE_STATUS_UPDATE", policeUnit);

    res.json(policeUnit);
  } catch (error) {
    console.error("Error updating police unit status:", error);
    res.status(500).json({ message: "Failed to update status", error: error.message });
  }
};
