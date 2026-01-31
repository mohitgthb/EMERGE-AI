const prisma = require("../config/db");

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
