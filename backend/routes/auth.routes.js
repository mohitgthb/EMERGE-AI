const express = require("express");
const {
  login,
  vehicleLogin,
  hospitalLogin,
  getMe,
  logout,
  listOperators,
  createOperator,
  updateOperator,
  deleteOperator,
} = require("../controllers/auth.controller");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public
router.post("/login", login);
router.post("/vehicle-login", vehicleLogin);
router.post("/hospital-login", hospitalLogin);
router.post("/logout", logout);

// Authenticated
router.get("/me", authenticate, getMe);

// Admin only — operator management
router.get("/operators", authenticate, requireRole("ADMIN"), listOperators);
router.post("/operators", authenticate, requireRole("ADMIN"), createOperator);
router.put("/operators/:id", authenticate, requireRole("ADMIN"), updateOperator);
router.delete("/operators/:id", authenticate, requireRole("ADMIN"), deleteOperator);

module.exports = router;
