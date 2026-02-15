const express = require("express");
const router = express.Router();
const cameraController = require("../controllers/camera.controller");

// Get all cameras
router.get("/", cameraController.getAllCameras);

// Get active cameras only
router.get("/active", cameraController.getActiveCameras);

// Get camera by cameraId (unique identifier) - MUST come before /:id
router.get("/code/:cameraId", cameraController.getCameraByCameraId);

// Update camera by cameraId - MUST come before /:id
router.put("/code/:cameraId", cameraController.updateCameraByCameraId);

// Get camera by ID
router.get("/:id", cameraController.getCameraById);

// Create new camera
router.post("/", cameraController.createCamera);

// Update camera
router.put("/:id", cameraController.updateCamera);

// Delete camera
router.delete("/:id", cameraController.deleteCamera);

module.exports = router;
