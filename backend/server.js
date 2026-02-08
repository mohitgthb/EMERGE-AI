require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const socket = require("./socket");
const http = require("http");

const app = express();

app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5000", "null"],
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(cookieParser());

// Serve static files (HTML test dashboard)
app.use(express.static(__dirname));

const prisma = require("./config/db");
const accidentRoutes = require("./routes/accident.routes");
const dispatchRoutes = require("./routes/dispatch.routes");
const ambulanceRoutes = require("./routes/ambulance.routes");
const ambulanceStatusRoutes = require("./routes/ambulanceStatus.routes");
const hospitalRoutes = require("./routes/hospital.routes");
const signalRoutes = require("./routes/signal.routes");
const sosRoutes = require("./routes/sos.routes");

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

app.use("/api/accidents", accidentRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/ambulances", ambulanceRoutes);
// Alias route for exact flow match: POST /api/ambulance-status
app.use("/api/ambulance-status", ambulanceStatusRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/sos", sosRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`server running on the port ${PORT}`)
});