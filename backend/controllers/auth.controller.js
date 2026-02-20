const prisma = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "24h";

/**
 * POST /api/auth/login
 * Body: { operatorId, password }
 */
exports.login = async (req, res) => {
  try {
    const { operatorId, password } = req.body;

    if (!operatorId || !password) {
      return res.status(400).json({ message: "operatorId and password are required" });
    }

    const operator = await prisma.operator.findUnique({
      where: { operatorId },
    });

    if (!operator || !operator.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, operator.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Resolve the linked vehicle/hospital details
    let vehicle = null;
    let hospital = null;
    if (operator.vehicleId) {
      if (operator.role === "AMBULANCE") {
        vehicle = await prisma.ambulance.findUnique({ where: { id: operator.vehicleId } });
      } else if (operator.role === "FIRE_BRIGADE") {
        vehicle = await prisma.fireBrigade.findUnique({ where: { id: operator.vehicleId } });
      } else if (operator.role === "POLICE") {
        vehicle = await prisma.policeUnit.findUnique({ where: { id: operator.vehicleId } });
      }
    }
    if (operator.hospitalId) {
      hospital = await prisma.hospital.findUnique({ where: { id: operator.hospitalId } });
    }

    const tokenPayload = {
      id: operator.id,
      operatorId: operator.operatorId,
      role: operator.role,
      vehicleId: operator.vehicleId,
      hospitalId: operator.hospitalId,
      name: operator.name,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    // Set HTTP-only cookie as well
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

    return res.json({
      token,
      operator: {
        id: operator.id,
        operatorId: operator.operatorId,
        name: operator.name,
        role: operator.role,
        vehicleId: operator.vehicleId,
        hospitalId: operator.hospitalId,
        vehicle,
        hospital,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

/**
 * GET /api/auth/me
 * Returns current operator info (requires auth)
 */
exports.getMe = async (req, res) => {
  try {
    const operator = await prisma.operator.findUnique({
      where: { id: req.operator.id },
    });

    if (!operator) {
      return res.status(404).json({ message: "Operator not found" });
    }

    let vehicle = null;
    let hospital = null;
    if (operator.vehicleId) {
      if (operator.role === "AMBULANCE") {
        vehicle = await prisma.ambulance.findUnique({ where: { id: operator.vehicleId } });
      } else if (operator.role === "FIRE_BRIGADE") {
        vehicle = await prisma.fireBrigade.findUnique({ where: { id: operator.vehicleId } });
      } else if (operator.role === "POLICE") {
        vehicle = await prisma.policeUnit.findUnique({ where: { id: operator.vehicleId } });
      }
    }
    if (operator.hospitalId) {
      hospital = await prisma.hospital.findUnique({ where: { id: operator.hospitalId } });
    }

    return res.json({
      operator: {
        id: operator.id,
        operatorId: operator.operatorId,
        name: operator.name,
        role: operator.role,
        vehicleId: operator.vehicleId,
        hospitalId: operator.hospitalId,
        vehicle,
        hospital,
      },
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ message: "Failed to get operator info", error: error.message });
  }
};

/**
 * POST /api/auth/vehicle-login
 * Body: { vehicleNo, password }
 * Login using the vehicle registration number instead of operator ID
 */
exports.vehicleLogin = async (req, res) => {
  try {
    const { vehicleNo, password } = req.body;

    if (!vehicleNo || !password) {
      return res.status(400).json({ message: "vehicleNo and password are required" });
    }

    // Look up the vehicle across all three vehicle tables
    let vehicle = null;
    let vehicleType = null;

    vehicle = await prisma.ambulance.findUnique({ where: { vehicleNo } });
    if (vehicle) {
      vehicleType = "AMBULANCE";
    }

    if (!vehicle) {
      vehicle = await prisma.fireBrigade.findUnique({ where: { vehicleNo } });
      if (vehicle) vehicleType = "FIRE_BRIGADE";
    }

    if (!vehicle) {
      vehicle = await prisma.policeUnit.findUnique({ where: { vehicleNo } });
      if (vehicle) vehicleType = "POLICE";
    }

    if (!vehicle) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Find the operator assigned to this vehicle
    const operator = await prisma.operator.findUnique({
      where: { vehicleId: vehicle.id },
    });

    if (!operator || !operator.isActive) {
      return res.status(401).json({ message: "No active operator assigned to this vehicle" });
    }

    // Verify the operator's role matches the vehicle type
    if (operator.role !== vehicleType) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, operator.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const tokenPayload = {
      id: operator.id,
      operatorId: operator.operatorId,
      role: operator.role,
      vehicleId: operator.vehicleId,
      hospitalId: operator.hospitalId || null,
      name: operator.name,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      token,
      operator: {
        id: operator.id,
        operatorId: operator.operatorId,
        name: operator.name,
        role: operator.role,
        vehicleId: operator.vehicleId,
        hospitalId: operator.hospitalId || null,
        vehicle,
      },
    });
  } catch (error) {
    console.error("Vehicle login error:", error);
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

/**
 * POST /api/auth/logout
 */
exports.logout = (req, res) => {
  res.clearCookie("token");
  return res.json({ message: "Logged out" });
};

/**
 * POST /api/auth/hospital-login
 * Body: { hospitalName, password }
 * Login using the hospital name — finds the assigned HOSPITAL operator
 */
exports.hospitalLogin = async (req, res) => {
  try {
    const { hospitalName, password } = req.body;

    if (!hospitalName || !password) {
      return res.status(400).json({ message: "hospitalName and password are required" });
    }

    // Look up hospital by name (case-insensitive partial match)
    const hospitals = await prisma.hospital.findMany();
    const hospital = hospitals.find(
      (h) => h.name.toLowerCase() === hospitalName.toLowerCase()
    );

    if (!hospital) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Find the HOSPITAL operator assigned to this hospital
    const operator = await prisma.operator.findUnique({
      where: { hospitalId: hospital.id },
    });

    if (!operator || !operator.isActive) {
      return res.status(401).json({ message: "No active operator assigned to this hospital" });
    }

    if (operator.role !== "HOSPITAL") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, operator.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const tokenPayload = {
      id: operator.id,
      operatorId: operator.operatorId,
      role: operator.role,
      vehicleId: null,
      hospitalId: operator.hospitalId,
      name: operator.name,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      token,
      operator: {
        id: operator.id,
        operatorId: operator.operatorId,
        name: operator.name,
        role: operator.role,
        vehicleId: null,
        hospitalId: operator.hospitalId,
        hospital,
      },
    });
  } catch (error) {
    console.error("Hospital login error:", error);
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ADMIN: Operator management
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/auth/operators  (admin only)
 */
exports.listOperators = async (req, res) => {
  try {
    const operators = await prisma.operator.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        operatorId: true,
        name: true,
        role: true,
        vehicleId: true,
        hospitalId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Resolve vehicle/hospital info for each operator
    const result = await Promise.all(
      operators.map(async (op) => {
        let vehicle = null;
        let hospital = null;
        if (op.vehicleId) {
          if (op.role === "AMBULANCE") {
            vehicle = await prisma.ambulance.findUnique({ where: { id: op.vehicleId } });
          } else if (op.role === "FIRE_BRIGADE") {
            vehicle = await prisma.fireBrigade.findUnique({ where: { id: op.vehicleId } });
          } else if (op.role === "POLICE") {
            vehicle = await prisma.policeUnit.findUnique({ where: { id: op.vehicleId } });
          }
        }
        if (op.hospitalId) {
          hospital = await prisma.hospital.findUnique({ where: { id: op.hospitalId } });
        }
        return { ...op, vehicle, hospital };
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("List operators error:", error);
    res.status(500).json({ message: "Failed to list operators", error: error.message });
  }
};

/**
 * POST /api/auth/operators  (admin only)
 * Body: { operatorId, password, name, role, vehicleId? }
 */
exports.createOperator = async (req, res) => {
  try {
    const { operatorId, password, name, role, vehicleId } = req.body;

    if (!operatorId || !password || !name || !role) {
      return res.status(400).json({
        message: "operatorId, password, name, and role are required",
      });
    }

    const validRoles = ["AMBULANCE", "FIRE_BRIGADE", "POLICE", "HOSPITAL", "ADMIN"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        message: `role must be one of: ${validRoles.join(", ")}`,
      });
    }

    // Check uniqueness
    const existing = await prisma.operator.findUnique({ where: { operatorId } });
    if (existing) {
      return res.status(409).json({ message: "operatorId already exists" });
    }

    // Validate vehicleId if provided
    if (vehicleId) {
      let vehicleExists = false;
      if (role === "AMBULANCE") {
        vehicleExists = !!(await prisma.ambulance.findUnique({ where: { id: vehicleId } }));
      } else if (role === "FIRE_BRIGADE") {
        vehicleExists = !!(await prisma.fireBrigade.findUnique({ where: { id: vehicleId } }));
      } else if (role === "POLICE") {
        vehicleExists = !!(await prisma.policeUnit.findUnique({ where: { id: vehicleId } }));
      }

      if (!vehicleExists) {
        return res.status(400).json({ message: `Vehicle with id ${vehicleId} not found for role ${role}` });
      }

      // Check no other operator is assigned to this vehicle
      const alreadyAssigned = await prisma.operator.findUnique({ where: { vehicleId } });
      if (alreadyAssigned) {
        return res.status(409).json({
          message: `Vehicle is already assigned to operator ${alreadyAssigned.operatorId}`,
        });
      }
    }

    // Validate hospitalId if provided (for HOSPITAL role)
    const hospitalId = req.body.hospitalId;
    if (hospitalId) {
      if (role !== "HOSPITAL") {
        return res.status(400).json({ message: "hospitalId can only be set for HOSPITAL role" });
      }
      const hospitalExists = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!hospitalExists) {
        return res.status(400).json({ message: `Hospital with id ${hospitalId} not found` });
      }
      const alreadyAssigned = await prisma.operator.findUnique({ where: { hospitalId } });
      if (alreadyAssigned) {
        return res.status(409).json({
          message: `Hospital is already assigned to operator ${alreadyAssigned.operatorId}`,
        });
      }
    }

    if (role === "HOSPITAL" && !hospitalId) {
      return res.status(400).json({ message: "hospitalId is required for HOSPITAL role" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const operator = await prisma.operator.create({
      data: {
        operatorId,
        password: hashedPassword,
        name,
        role,
        vehicleId: vehicleId || null,
        hospitalId: hospitalId || null,
      },
      select: {
        id: true,
        operatorId: true,
        name: true,
        role: true,
        vehicleId: true,
        hospitalId: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.status(201).json(operator);
  } catch (error) {
    console.error("Create operator error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ message: "Operator ID or vehicle already assigned" });
    }
    res.status(500).json({ message: "Failed to create operator", error: error.message });
  }
};

/**
 * PUT /api/auth/operators/:id  (admin only)
 */
exports.updateOperator = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, vehicleId, isActive, password } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (vehicleId !== undefined) updateData.vehicleId = vehicleId || null;
    if (req.body.hospitalId !== undefined) updateData.hospitalId = req.body.hospitalId || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = await bcrypt.hash(password, SALT_ROUNDS);

    const operator = await prisma.operator.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        operatorId: true,
        name: true,
        role: true,
        vehicleId: true,
        hospitalId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return res.json(operator);
  } catch (error) {
    console.error("Update operator error:", error);
    if (error.code === "P2025") return res.status(404).json({ message: "Operator not found" });
    res.status(500).json({ message: "Failed to update operator", error: error.message });
  }
};

/**
 * DELETE /api/auth/operators/:id  (admin only)
 */
exports.deleteOperator = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.operator.delete({ where: { id } });

    return res.json({ message: "Operator deleted" });
  } catch (error) {
    console.error("Delete operator error:", error);
    if (error.code === "P2025") return res.status(404).json({ message: "Operator not found" });
    res.status(500).json({ message: "Failed to delete operator", error: error.message });
  }
};
