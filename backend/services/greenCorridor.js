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
            // Only update if not already GREEN (avoid redundant DB writes)
            const updated = await prisma.trafficSignal.updateMany({
                where: { id: signal.id, state: { not: "GREEN" } },
                data: { state: "GREEN" },
            });

            if (updated.count > 0) {
                socket.getIO().emit("SIGNAL_GREEN", {
                    junctionId: signal.junctionId,
                    state: "GREEN",
                });
            }
        }
    }
};

exports.resetSignals = async () => {
    // Only reset signals that are not already NORMAL
    const updated = await prisma.trafficSignal.updateMany({
        where: { state: { not: "NORMAL" } },
        data: { state: "NORMAL"},
    });

    if (updated.count > 0) {
        socket.getIO().emit("SIGNAL_RESET", { state: "NORMAL" });
    }
};