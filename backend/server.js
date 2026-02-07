require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const socket = require("./socket");
const http = require("http");

const app = express();

app.use(cors({
    origin: ["http://localhost:5173", "null"],
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const prisma = require("./config/db");
const accidentRoutes = require("./routes/accident.routes");
const dispatchRoutes = require("./routes/dispatch.routes");
const ambulanceRoutes = require("./routes/ambulance.routes");
const hospitalRoutes = require("./routes/hospital.routes");
const signalRoutes = require("./routes/signal.routes");
const sosRoutes = require("./routes/sos.routes");

const server = http.createServer(app);
socket.init(server);

app.get("/", (req, res) => {
    res.send("Server running")
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
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/sos", sosRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`server running on the port ${PORT}`)
});