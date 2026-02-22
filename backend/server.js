require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const socket = require("./socket");
const http = require("http");

const app = express();

app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5000", "http://localhost:8000", "http://localhost:8080", "http://127.0.0.1:5000", "http://127.0.0.1:8080", "null"],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
    if (req.method === 'POST' && req.path.includes('/ai')) {
        console.log("Request Body:", JSON.stringify(req.body, null, 2));
    }
    next();
});

app.use(express.static(__dirname));

const prisma = require("./config/db");
const accidentRoutes = require("./routes/accident.routes");
const dispatchRoutes = require("./routes/dispatch.routes");
const ambulanceRoutes = require("./routes/ambulance.routes");
const ambulanceStatusRoutes = require("./routes/ambulanceStatus.routes");
const hospitalRoutes = require("./routes/hospital.routes");
const signalRoutes = require("./routes/signal.routes");
const sosRoutes = require("./routes/sos.routes");
const videoDetectionRoutes = require("./routes/videoDetection.routes");
const aiRoutes = require("./routes/ai.routes");
const cameraRoutes = require("./routes/camera.routes");
const detectionRoutes = require("./routes/detection.routes");
const fireRoutes = require("./routes/fire.routes");
const fireBrigadeRoutes = require("./routes/fireBrigade.routes");
const policeRoutes = require("./routes/police.routes");
const emergencyQueueRoutes = require("./routes/emergencyQueue.routes");
const authRoutes = require("./routes/auth.routes");
const demoRoutes = require("./routes/demo.routes");
const predictiveRoutes = require("./routes/predictive.routes");
const vehicleCrashRoutes = require("./routes/vehicleCrash.routes");
const { startPeriodicRecalc } = require("./services/predictiveReadinessService");

const server = http.createServer(app);
socket.init(server);

app.get("/", (req, res) => {
    res.send(`
        <html>
            <head>
                <title>EMERGE-AI Backend</title>
                <style>
                    body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                    .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); text-align: center; }
                    h1 { color: #667eea; margin-bottom: 20px; }
                    a { display: inline-block; margin: 10px; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
                    a:hover { background: #764ba2; }
                    .status { color: #28a745; font-weight: 600; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚑 EMERGE-AI Backend</h1>
                    <p class="status">✅ Server Running</p>
                    <a href="/test-system.html">🧪 Open Test Dashboard</a>
                    <a href="/api/accidents" style="background: #6c757d;">📡 API Docs</a>
                </div>
            </body>
        </html>
    `);
});

async function checkDB() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed", err);
  }
}

checkDB();

app.use("/api/auth", authRoutes);
app.use("/api/accidents", accidentRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/ambulances", ambulanceRoutes);
app.use("/api/ambulance-status", ambulanceStatusRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/video-detection", videoDetectionRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/cameras", cameraRoutes);
app.use("/api/detections", detectionRoutes);
app.use("/api/fire", fireRoutes);
app.use("/api/fire-brigades", fireBrigadeRoutes);
app.use("/api/police", policeRoutes);
app.use("/api/emergency-queue", emergencyQueueRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/predictive", predictiveRoutes);
app.use("/api/vehicle", vehicleCrashRoutes);
app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`server running on the port ${PORT}`);
    // Start predictive readiness periodic recalculation
    startPeriodicRecalc();
});