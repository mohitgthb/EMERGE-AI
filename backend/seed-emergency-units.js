require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding fire brigades...");
  
  const fireBrigades = [
    { vehicleNo: "FB-101", latitude: 28.7041, longitude: 77.1025, status: "AVAILABLE" },
    { vehicleNo: "FB-102", latitude: 28.5355, longitude: 77.3910, status: "AVAILABLE" },
    { vehicleNo: "FB-103", latitude: 28.4595, longitude: 77.0266, status: "AVAILABLE" },
    { vehicleNo: "FB-104", latitude: 28.6139, longitude: 77.2090, status: "AVAILABLE" },
    { vehicleNo: "FB-105", latitude: 28.6692, longitude: 77.4538, status: "AVAILABLE" },
  ];

  for (const fb of fireBrigades) {
    await prisma.fireBrigade.upsert({
      where: { vehicleNo: fb.vehicleNo },
      update: fb,
      create: fb,
    });
  }

  console.log("Seeding police units...");

  const policeUnits = [
    { vehicleNo: "PU-201", latitude: 28.7041, longitude: 77.1025, status: "AVAILABLE" },
    { vehicleNo: "PU-202", latitude: 28.5355, longitude: 77.3910, status: "AVAILABLE" },
    { vehicleNo: "PU-203", latitude: 28.4595, longitude: 77.0266, status: "AVAILABLE" },
    { vehicleNo: "PU-204", latitude: 28.6139, longitude: 77.2090, status: "AVAILABLE" },
    { vehicleNo: "PU-205", latitude: 28.6692, longitude: 77.4538, status: "AVAILABLE" },
    { vehicleNo: "PU-206", latitude: 28.5244, longitude: 77.1855, status: "AVAILABLE" },
  ];

  for (const pu of policeUnits) {
    await prisma.policeUnit.upsert({
      where: { vehicleNo: pu.vehicleNo },
      update: pu,
      create: pu,
    });
  }

  console.log("Seeding SOS users...");

  const sosUsers = [
    {
      deviceId: "DEV-MOBILE-001",
      name: "Test User 1",
      phone: "+911234567890",
      email: "user1@test.com",
      isVerified: true,
    },
    {
      deviceId: "DEV-WATCH-002",
      name: "Test User 2",
      phone: "+919876543210",
      email: "user2@test.com",
      isVerified: true,
    },
    {
      deviceId: "DEV-IOT-003",
      name: "Test User 3",
      phone: "+911122334455",
      isVerified: false,
    },
  ];

  for (const user of sosUsers) {
    await prisma.sOSUser.upsert({
      where: { deviceId: user.deviceId },
      update: user,
      create: user,
    });
  }

  const fireBrigadeCount = await prisma.fireBrigade.count();
  const policeUnitCount = await prisma.policeUnit.count();
  const sosUserCount = await prisma.sOSUser.count();

  console.log(`\n✅ Seeded ${fireBrigadeCount} fire brigades`);
  console.log(`✅ Seeded ${policeUnitCount} police units`);
  console.log(`✅ Seeded ${sosUserCount} SOS users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
