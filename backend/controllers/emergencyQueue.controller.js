const prisma = require("../config/db");
const { dispatchEmergency } = require("../services/emergencyDispatchService");
const socket = require("../socket");

exports.listQueue = async (req, res) => {
  try {
    const { status, emergencyType } = req.query;

    const where = {};
    if (status) where.status = status;
    if (emergencyType) where.emergencyType = emergencyType;

    const queue = await prisma.emergencyQueue.findMany({
      where,
      include: {
        accident: true,
        fireIncident: true,
      },
      orderBy: [
        { confidence: "asc" },
        { createdAt: "asc" },
      ],
    });

    res.json(queue);
  } catch (error) {
    console.error("Error listing queue:", error);
    res.status(500).json({ message: "Failed to fetch queue", error: error.message });
  }
};

exports.reviewEmergency = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes, assignedTo, newSeverity } = req.body;

    const queueEntry = await prisma.emergencyQueue.findUnique({
      where: { id },
      include: {
        accident: true,
        fireIncident: true,
      },
    });

    if (!queueEntry) {
      return res.status(404).json({ message: "Queue entry not found" });
    }

    if (action === "CONFIRM") {
      await prisma.emergencyQueue.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          assignedTo,
          reviewedAt: new Date(),
        },
      });

      const emergency = queueEntry.accident || queueEntry.fireIncident;

      if (newSeverity && emergency) {
        const model = queueEntry.emergencyType === "ACCIDENT" ? "accident" : "fireIncident";
        await prisma[model].update({
          where: { id: emergency.id },
          data: { severity: newSeverity },
        });
      }

      const dispatch = await dispatchEmergency({
        accident: queueEntry.accident,
        fireIncident: queueEntry.fireIncident,
        type: queueEntry.emergencyType,
        emergencyType: queueEntry.emergencyType,
      });

      socket.getIO().emit("EMERGENCY_CONFIRMED", {
        queueEntryId: id,
        emergencyType: queueEntry.emergencyType,
        emergencyId: queueEntry.emergencyId,
        dispatchId: dispatch?.id,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        message: "Emergency confirmed and dispatched",
        dispatch,
        queueEntry,
      });
    } else if (action === "REJECT") {
      await prisma.emergencyQueue.update({
        where: { id },
        data: {
          status: "REJECTED",
          assignedTo,
          reviewedAt: new Date(),
        },
      });

      socket.getIO().emit("EMERGENCY_REJECTED", {
        queueEntryId: id,
        emergencyType: queueEntry.emergencyType,
        emergencyId: queueEntry.emergencyId,
        timestamp: new Date().toISOString(),
      });

      return res.json({ message: "Emergency rejected", queueEntry });
    } else if (action === "ESCALATE") {
      const emergency = queueEntry.accident || queueEntry.fireIncident;
      const model = queueEntry.emergencyType === "ACCIDENT" ? "accident" : "fireIncident";

      await prisma[model].update({
        where: { id: emergency.id },
        data: { severity: "HIGH" },
      });

      await prisma.emergencyQueue.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          severity: "HIGH",
          assignedTo,
          reviewedAt: new Date(),
        },
      });

      const dispatch = await dispatchEmergency({
        accident: queueEntry.accident,
        fireIncident: queueEntry.fireIncident,
        type: queueEntry.emergencyType,
        emergencyType: queueEntry.emergencyType,
        priority: "HIGH",
      });

      socket.getIO().emit("EMERGENCY_ESCALATED", {
        queueEntryId: id,
        emergencyType: queueEntry.emergencyType,
        emergencyId: queueEntry.emergencyId,
        dispatchId: dispatch?.id,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        message: "Emergency escalated and dispatched",
        dispatch,
        queueEntry,
      });
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }
  } catch (error) {
    console.error("Error reviewing emergency:", error);
    res.status(500).json({ message: "Review failed", error: error.message });
  }
};

exports.getQueueStats = async (req, res) => {
  try {
    const pending = await prisma.emergencyQueue.count({
      where: { status: "PENDING" },
    });

    const confirmed = await prisma.emergencyQueue.count({
      where: { status: "CONFIRMED" },
    });

    const rejected = await prisma.emergencyQueue.count({
      where: { status: "REJECTED" },
    });

    const avgConfidence = await prisma.emergencyQueue.aggregate({
      where: { status: "PENDING" },
      _avg: { confidence: true },
    });

    res.json({
      pending,
      confirmed,
      rejected,
      avgConfidence: avgConfidence._avg.confidence,
    });
  } catch (error) {
    console.error("Error getting queue stats:", error);
    res.status(500).json({ message: "Failed to fetch stats", error: error.message });
  }
};
