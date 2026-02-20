const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "emerge-ai-secret-key-change-in-production";

/**
 * Verify JWT token from Authorization header or cookie
 */
exports.authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.operator = decoded; // { id, operatorId, role, vehicleId, name }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/**
 * Optional authentication — sets req.operator if token present, but does not
 * block the request if missing. Useful for endpoints that behave differently
 * for authenticated vs public users (e.g. dispatch list scoping).
 */
exports.optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies?.token;

  if (token) {
    try {
      req.operator = jwt.verify(token, JWT_SECRET);
    } catch {
      // token invalid — proceed without operator
    }
  }
  next();
};

/**
 * Restrict to specific roles
 */
exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.operator) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!roles.includes(req.operator.role) && req.operator.role !== "ADMIN") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
};

/**
 * Guard: ensure the authenticated operator owns the vehicle specified in the
 * request body (req.body.vehicleId). ADMIN users bypass this check.
 * Usage: router.post("/vehicle-status", authenticate, requireVehicleOwnership, handler);
 */
exports.requireVehicleOwnership = (req, res, next) => {
  if (!req.operator) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // Admins can update any vehicle
  if (req.operator.role === "ADMIN") return next();

  const targetVehicleId = req.body.vehicleId || req.params.vehicleId;

  if (!targetVehicleId) {
    return res.status(400).json({ message: "vehicleId is required" });
  }

  if (req.operator.vehicleId !== targetVehicleId) {
    return res.status(403).json({ message: "You can only update your own vehicle" });
  }

  next();
};

exports.JWT_SECRET = JWT_SECRET;
