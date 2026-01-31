const prisma = require("../config/db");

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
