const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const { selectBestHospital } = require("./hospitalSelector");

exports.autoDispatch = async (accident) => {
  const ambulances = await prisma.ambulance.findMany({
    where: { status: "AVAILABLE" },
  });

  if (ambulances.length === 0) {
        return res.status(404).json({ message: "No available ambulances" });
    }

  let nearest = ambulances[0];
  let minDist = distanceKm(
    accident.latitude,
    accident.longitude,
    nearest.latitude,
    nearest.longitude
  );

  for (const a of ambulances) {
    const d = distanceKm(
      accident.latitude,
      accident.longitude,
      a.latitude,
      a.longitude
    );
    if (d < minDist) {
      minDist = d;
      nearest = a;
    }
  }

  const hospital = await selectBestHospital(accident);

  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.create({
      data: {
        accidentId: accident.id,
        ambulanceId: nearest.id,
        hospitalId: hospital.id,
      },
    });

    await tx.ambulance.update({
      where: { id: nearest.id },
      data: { status: "BUSY" },
    });

    return dispatch;
  });
};
