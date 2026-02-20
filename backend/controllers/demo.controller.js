/**
 * Demo Simulation Controller
 * 
 * API endpoints for managing the demo simulation mode.
 */

const {
  isDemoMode,
  setDemoMode,
  getActiveSimulations,
  startSimulation,
  stopSimulation,
  stopAllSimulations,
  startAllActiveSimulations,
  overrideStatus,
} = require("../services/demoSimulationService");

/**
 * GET /api/demo/status
 * Returns current demo mode state and active simulations.
 */
exports.getStatus = (req, res) => {
  res.json(getActiveSimulations());
};

/**
 * POST /api/demo/toggle
 * Enable or disable demo mode.
 * Body: { enabled: boolean }
 */
exports.toggleDemoMode = (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ message: "Missing 'enabled' boolean field" });
  }
  setDemoMode(enabled);
  res.json({ enabled: isDemoMode(), message: `Demo mode ${enabled ? "enabled" : "disabled"}` });
};

/**
 * POST /api/demo/simulate/:dispatchId
 * Start simulation for a specific dispatch.
 * Body (optional): { intervalMs: number }
 */
exports.startSimulation = async (req, res) => {
  try {
    const { dispatchId } = req.params;
    const { intervalMs } = req.body || {};
    const result = await startSimulation(dispatchId, { intervalMs });
    res.json({ message: "Simulation started", ...result });
  } catch (error) {
    console.error("[DemoController] Start simulation error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/demo/simulate-all
 * Start simulation for all active dispatches.
 * Body (optional): { intervalMs: number }
 */
exports.startAllSimulations = async (req, res) => {
  try {
    const { intervalMs } = req.body || {};
    const results = await startAllActiveSimulations({ intervalMs });
    res.json({ message: `Started ${results.filter((r) => r.status === "started").length} simulations`, results });
  } catch (error) {
    console.error("[DemoController] Start all simulations error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/demo/stop/:dispatchId
 * Stop simulation for a specific dispatch.
 */
exports.stopSimulation = (req, res) => {
  const { dispatchId } = req.params;
  const stopped = stopSimulation(dispatchId);
  if (stopped) {
    res.json({ message: "Simulation stopped", dispatchId });
  } else {
    res.status(404).json({ message: "No active simulation found for this dispatch" });
  }
};

/**
 * POST /api/demo/stop-all
 * Stop all running simulations.
 */
exports.stopAllSimulations = (req, res) => {
  stopAllSimulations();
  res.json({ message: "All simulations stopped" });
};

/**
 * POST /api/demo/override-status/:dispatchId
 * Override the status of a running simulation.
 * Body: { status: "ARRIVED" | "COMPLETED" }
 */
exports.overrideStatus = (req, res) => {
  const { dispatchId } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ message: "Missing 'status' field" });
  }
  const result = overrideStatus(dispatchId, status);
  if (result) {
    res.json({ message: `Status overridden to ${status}`, dispatchId });
  } else {
    res.status(404).json({ message: "No active simulation found for this dispatch" });
  }
};
