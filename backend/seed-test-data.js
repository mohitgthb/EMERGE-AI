/**
 * Seed Test Data for EMERGE AI
 * Creates test ambulances, hospitals, and traffic signals
 */

const prisma = require('./config/db');

async function main() {
  console.log('🌱 Seeding test data...\n');

  console.log('🗑️  Clearing existing data...');
  await prisma.dispatch.deleteMany({});
  await prisma.ambulance.deleteMany({});
  await prisma.hospital.deleteMany({});
  await prisma.trafficSignal.deleteMany({});
  console.log('✅ Existing data cleared\n');

  console.log('🏥 Creating hospitals...');
  const hospitals = await Promise.all([
    prisma.hospital.create({
      data: {
        name: 'AIIMS Delhi',
        latitude: 28.5672,
        longitude: 77.2100,
        beds: 50
      }
    }),
    prisma.hospital.create({
      data: {
        name: 'Safdarjung Hospital',
        latitude: 28.5678,
        longitude: 77.2067,
        beds: 35
      }
    }),
    prisma.hospital.create({
      data: {
        name: 'Max Super Specialty Hospital',
        latitude: 28.5244,
        longitude: 77.2066,
        beds: 25
      }
    }),
    prisma.hospital.create({
      data: {
        name: 'Fortis Hospital',
        latitude: 28.5200,
        longitude: 77.1500,
        beds: 30
      }
    })
  ]);
  console.log(`✅ Created ${hospitals.length} hospitals\n`);

  console.log('🚑 Creating ambulances...');
  const ambulances = await Promise.all([
    prisma.ambulance.create({
      data: {
        vehicleNo: 'DL-1A-0001',
        latitude: 28.6139,
        longitude: 77.2090,
        status: 'AVAILABLE'
      }
    }),
    prisma.ambulance.create({
      data: {
        vehicleNo: 'DL-1A-0002',
        latitude: 28.6500,
        longitude: 77.2300,
        status: 'AVAILABLE'
      }
    }),
    prisma.ambulance.create({
      data: {
        vehicleNo: 'DL-1A-0003',
        latitude: 28.5900,
        longitude: 77.1800,
        status: 'AVAILABLE'
      }
    }),
    prisma.ambulance.create({
      data: {
        vehicleNo: 'DL-1A-0004',
        latitude: 28.6200,
        longitude: 77.2200,
        status: 'AVAILABLE'
      }
    }),
    prisma.ambulance.create({
      data: {
        vehicleNo: 'DL-1A-0005',
        latitude: 28.5800,
        longitude: 77.1900,
        status: 'AVAILABLE'
      }
    })
  ]);
  console.log(`✅ Created ${ambulances.length} ambulances\n`);

  console.log('🚦 Creating traffic signals...');
  const signals = await Promise.all([
    prisma.trafficSignal.create({
      data: {
        junctionId: 'SIG-001',
        latitude: 28.6100,
        longitude: 77.2050,
        state: 'GREEN'
      }
    }),
    prisma.trafficSignal.create({
      data: {
        junctionId: 'SIG-002',
        latitude: 28.6150,
        longitude: 77.2100,
        state: 'GREEN'
      }
    }),
    prisma.trafficSignal.create({
      data: {
        junctionId: 'SIG-003',
        latitude: 28.6200,
        longitude: 77.2150,
        state: 'GREEN'
      }
    }),
    prisma.trafficSignal.create({
      data: {
        junctionId: 'SIG-004',
        latitude: 28.6250,
        longitude: 77.2200,
        state: 'GREEN'
      }
    })
  ]);
  console.log(`✅ Created ${signals.length} traffic signals\n`);

  console.log('='.repeat(70));
  console.log('✅ Seed complete!\n');
  console.log('📊 Summary:');
  console.log(`   Hospitals: ${hospitals.length}`);
  console.log(`   Ambulances: ${ambulances.length} (all AVAILABLE)`);
  console.log(`   Traffic Signals: ${signals.length}`);
  console.log('\n🚑 Now when accidents are detected, ambulances will be dispatched!');
  console.log('='.repeat(70));
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
