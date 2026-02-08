const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const socket = require("../socket");

const ACTIVATION_RADIUS_KM = 0.3; // Radius within which to activate green corridor

exports.activeGreenCorridor = async (ambulance) => {
    const signals = await prisma.trafficSignal.findMany();

    if (signals.length === 0) {
        console.log("⚠️ No traffic signals in database - add signals first!");
        // Emit event to notify frontend
        socket.getIO().emit("GREEN_CORRIDOR_STATUS", {
            ambulanceId: ambulance.id,
            status: "NO_SIGNALS",
            message: "No traffic signals in database",
        });
        return;
    }

    let activatedCount = 0;
    let inRangeCount = 0;

    for (const signal of signals) {
        const d = distanceKm(
            ambulance.latitude,
            ambulance.longitude,
            signal.latitude,
            signal.longitude
        );

        if(d <= ACTIVATION_RADIUS_KM) {
            inRangeCount++;
            // Only update if not already GREEN (avoid redundant DB writes)
            const updated = await prisma.trafficSignal.updateMany({
                where: { id: signal.id, state: { not: "GREEN" } },
                data: { state: "GREEN" },
            });

            if (updated.count > 0) {
                activatedCount++;
                socket.getIO().emit("SIGNAL_GREEN", {
                    junctionId: signal.junctionId,
                    state: "GREEN",
                    distance: d.toFixed(3) + " km",
                });
            } else {
                // Signal already green - still notify
                socket.getIO().emit("SIGNAL_GREEN", {
                    junctionId: signal.junctionId,
                    state: "GREEN",
                    distance: d.toFixed(3) + " km",
                    alreadyActive: true,
                });
            }
        }
    }

    // Summary event
    socket.getIO().emit("GREEN_CORRIDOR_STATUS", {
        ambulanceId: ambulance.id,
        status: inRangeCount > 0 ? "ACTIVE" : "NO_SIGNALS_IN_RANGE",
        signalsInRange: inRangeCount,
        signalsActivated: activatedCount,
        radius: ACTIVATION_RADIUS_KM + " km",
    });

    console.log(`✅ Green corridor: ${inRangeCount} signals in range, ${activatedCount} newly activated`);
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