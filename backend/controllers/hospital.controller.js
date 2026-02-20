const prisma = require("../config/db");

exports.listHospitals = async (req, res) => {
  try {
    const hospitals = await prisma.hospital.findMany({
      orderBy: { name: "asc" },
    });
    res.json(hospitals);
  } catch (error) {
    console.error("Error listing hospitals:", error);
    res.status(500).json({ message: "Failed to fetch hospitals", error: error.message });
  }
};

exports.addHospital = async (req, res) => {
  const { name, latitude, longitude, beds } = req.body;

  if (!name || latitude == null || longitude == null || beds == null) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const hospital = await prisma.hospital.create({
    data: {
      name,
      latitude,
      longitude,
      beds,
    },
  });

  res.status(201).json(hospital);
};
