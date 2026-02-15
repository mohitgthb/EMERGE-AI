const prisma = require("./config/db");

async function seedCameras() {
  console.log("🎥 Seeding cameras...\n");

  // Sample cameras with different configurations
  const cameras = [
    {
      cameraId: "CAM_JUNCTION_01",
      name: "Main Junction - North",
      location: "MG Road & 5th Avenue Intersection",
      latitude: 28.6139,
      longitude: 77.2090,
      rtspUrl: "rtsp://192.168.1.100:554/stream1",
      streamType: "RTSP",
      isActive: true,
    },
    {
      cameraId: "CAM_JUNCTION_02",
      name: "Main Junction - South",
      location: "MG Road & 5th Avenue Intersection",
      latitude: 28.6135,
      longitude: 77.2088,
      rtspUrl: "rtsp://192.168.1.101:554/stream1",
      streamType: "RTSP",
      isActive: true,
    },
    {
      cameraId: "CAM_HIGHWAY_01",
      name: "Highway Mile 15",
      location: "National Highway 8 - KM 15",
      latitude: 28.4595,
      longitude: 77.0266,
      rtspUrl: "rtsp://192.168.1.102:554/stream1",
      streamType: "RTSP",
      isActive: true,
    },
    {
      cameraId: "CAM_BRIDGE_01",
      name: "Metro Bridge - East",
      location: "Metro Line 2 Bridge - East Side",
      latitude: 28.5355,
      longitude: 77.3910,
      rtspUrl: "rtsp://192.168.1.103:554/stream1",
      streamType: "RTSP",
      isActive: true,
    },
    {
      cameraId: "CAM_TEST_FILE",
      name: "Test Video File",
      location: "Test Location",
      latitude: 28.6139,
      longitude: 77.2090,
      videoPath: "D:\\test_videos\\accident_test.mp4",
      streamType: "FILE",
      isActive: true,
    },
  ];

  for (const camera of cameras) {
    try {
      // Check if camera already exists
      const existing = await prisma.camera.findUnique({
        where: { cameraId: camera.cameraId },
      });

      if (existing) {
        console.log(`⚠️  Camera ${camera.cameraId} already exists, skipping...`);
        continue;
      }

      const created = await prisma.camera.create({
        data: camera,
      });

      console.log(`✅ Created camera: ${created.cameraId} - ${created.name}`);
      console.log(`   Location: ${created.latitude}, ${created.longitude}`);
      console.log(`   Source: ${created.rtspUrl || created.videoPath}\n`);
    } catch (error) {
      console.error(`❌ Error creating camera ${camera.cameraId}:`, error.message);
    }
  }

  console.log("\n✅ Camera seeding complete!\n");
}

async function main() {
  try {
    await seedCameras();
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
