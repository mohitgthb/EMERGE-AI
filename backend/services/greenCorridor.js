const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const socket = require("../socket");

const ACTIVATION_RADIUS_KM = 0.3; // Radius within which to activate green corridor

exports.activeGreenCorridor = async (ambulance) => {
    const signals = await prisma.trafficSignal.findMany();

    for (const signal of signals) {
        const d = distanceKm(
            ambulance.latitude,
            ambulance.longitude,
            signal.latitude,
            signal.longitude
        );

        if(d <= ACTIVATION_RADIUS_KM) {
            await prisma.trafficSignal.update({
                where: { id: signal.id },
                data: { state: "GREEN" },
            });

            socket.getIO().emit("SIGNAl_GREEN", {
                junctionId: signal.junctionId,
            });
        }
    }
};

exports.resetSignals = async () => {
    await prisma.trafficSignal.updateMany({
        data: { state: "NORMAL"},
    });

    socket.getIO().emit("SIGNAL_RESET");
};