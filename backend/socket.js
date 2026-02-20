let io;

module.exports = {
    init: (httpServer) => {
        io = require("socket.io")(httpServer, {
            cors: {
                origin: ["http://localhost:5173", "http://localhost:5000", "http://localhost:8080", "http://127.0.0.1:8080", "null"],
                methods: ["GET", "POST", "PUT", "DELETE"],
                credentials: true,
            },
        });

        io.on("connection", (socket) => {
            console.log("New client connected:", socket.id);

            // Allow operators to join their vehicle-specific room
            socket.on("JOIN_VEHICLE_ROOM", (vehicleId) => {
                if (vehicleId) {
                    socket.join(`vehicle:${vehicleId}`);
                    console.log(`[Socket] ${socket.id} joined room vehicle:${vehicleId}`);
                }
            });

            socket.on("LEAVE_VEHICLE_ROOM", (vehicleId) => {
                if (vehicleId) {
                    socket.leave(`vehicle:${vehicleId}`);
                    console.log(`[Socket] ${socket.id} left room vehicle:${vehicleId}`);
                }
            });

            // Allow hospital operators to join their hospital-specific room
            socket.on("JOIN_HOSPITAL_ROOM", (hospitalId) => {
                if (hospitalId) {
                    socket.join(`hospital:${hospitalId}`);
                    console.log(`[Socket] ${socket.id} joined room hospital:${hospitalId}`);
                }
            });

            socket.on("LEAVE_HOSPITAL_ROOM", (hospitalId) => {
                if (hospitalId) {
                    socket.leave(`hospital:${hospitalId}`);
                    console.log(`[Socket] ${socket.id} left room hospital:${hospitalId}`);
                }
            });

            // Demo simulation controls via socket
            socket.on("DEMO_REQUEST_STATUS", () => {
                try {
                    const demoService = require("./services/demoSimulationService");
                    socket.emit("DEMO_STATUS_RESPONSE", demoService.getActiveSimulations());
                } catch (e) {
                    socket.emit("DEMO_STATUS_RESPONSE", { enabled: false, simulations: [] });
                }
            });

            socket.on("disconnect", () => {
                console.log("Client disconnected:", socket.id);
            });
        });

        return io;
    },
    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized");
        }
        return io;
    },
};