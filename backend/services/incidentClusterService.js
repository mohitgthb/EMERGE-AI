/**
 * Incident Clustering Service
 *
 * Detects nearby SOS events within 50 meter radius and 5 minute window.
 * Merges them into a single incident cluster to avoid duplicate dispatches.
 */

const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const socket = require("../socket");

const CLUSTER_RADIUS_KM = 0.05; // 50 meters
const CLUSTER_TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a new SOS event should be clustered with existing nearby events.
 * 
 * @param {Object} newEvent - The new SOS event being created
 * @param {number} newEvent.latitude
 * @param {number} newEvent.longitude
 * @param {string} newEvent.emergencyType
 * @returns {Object|null} - The parent cluster event if found, null otherwise
 */
exports.findNearbyCluster = async ({ latitude, longitude, emergencyType }) => {
  const timeThreshold = new Date(Date.now() - CLUSTER_TIME_WINDOW_MS);

  // Find recent SOS events that could be the parent cluster
  const recentEvents = await prisma.sOSEvent.findMany({
    where: {
      createdAt: { gte: timeThreshold },
      emergencyType,
      // Only consider root events (not already clustered to another)
      OR: [
        { clusterId: null }, // standalone events
        { clusterId: { not: null } }, // or cluster roots
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50, // limit search scope
  });

  for (const event of recentEvents) {
    const dist = distanceKm(latitude, longitude, event.latitude, event.longitude);
    if (dist <= CLUSTER_RADIUS_KM) {
      // Found a nearby event — determine the cluster root
      const rootId = event.clusterId || event.id;
      return {
        clusterId: rootId,
        parentEvent: event,
        distance: dist,
      };
    }
  }

  return null;
};

/**
 * Merge a new SOS event into an existing cluster.
 * Updates the parent event's severity score and cluster count.
 * Emits INCIDENT_UPDATED socket event.
 *
 * @param {string} newEventId - ID of the newly created SOS event
 * @param {string} clusterId - ID of the parent/root cluster event
 * @param {string} imageUrl - Optional image from the new report
 * @returns {Object} - Updated parent event
 */
exports.mergeIntoCluster = async (newEventId, clusterId, imageUrl = null) => {
  // Update the new event to point to the cluster
  await prisma.sOSEvent.update({
    where: { id: newEventId },
    data: { clusterId },
  });

  // Increment parent's cluster count and severity score
  const parentEvent = await prisma.sOSEvent.update({
    where: { id: clusterId },
    data: {
      clusterCount: { increment: 1 },
      severityScore: { increment: 1 },
      // Escalate severity if multiple reports
      severity: await calculateClusterSeverity(clusterId),
    },
  });

  // Emit cluster update
  try {
    const io = socket.getIO();
    io.emit("INCIDENT_UPDATED", {
      incidentId: clusterId,
      eventType: "CLUSTER_MERGED",
      clusterCount: parentEvent.clusterCount,
      severityScore: parentEvent.severityScore,
      severity: parentEvent.severity,
      newReportId: newEventId,
      newImageUrl: imageUrl,
      latitude: parentEvent.latitude,
      longitude: parentEvent.longitude,
      emergencyType: parentEvent.emergencyType,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[Clustering] Socket emit failed:", err.message);
  }

  console.log(
    `[Clustering] Merged SOS ${newEventId.slice(0, 8)} into cluster ${clusterId.slice(0, 8)} ` +
    `(count: ${parentEvent.clusterCount}, severity: ${parentEvent.severity})`
  );

  return parentEvent;
};

/**
 * Calculate severity based on cluster count.
 */
async function calculateClusterSeverity(clusterId) {
  const parent = await prisma.sOSEvent.findUnique({
    where: { id: clusterId },
    select: { clusterCount: true },
  });

  const count = (parent?.clusterCount || 1) + 1; // +1 for the new one being added
  if (count >= 5) return "CRITICAL";
  if (count >= 3) return "HIGH";
  return "MEDIUM";
}

/**
 * Get all events in a cluster.
 */
exports.getClusterEvents = async (clusterId) => {
  const events = await prisma.sOSEvent.findMany({
    where: {
      OR: [
        { id: clusterId },
        { clusterId: clusterId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  return events;
};

/**
 * Get cluster info for a given event (whether it's the root or a child).
 */
exports.getClusterInfo = async (eventId) => {
  const event = await prisma.sOSEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const rootId = event.clusterId || event.id;
  const root = rootId === event.id
    ? event
    : await prisma.sOSEvent.findUnique({ where: { id: rootId } });

  if (!root) return null;

  const members = await exports.getClusterEvents(rootId);

  return {
    clusterId: rootId,
    clusterCount: root.clusterCount,
    severityScore: root.severityScore,
    severity: root.severity,
    members,
  };
};
