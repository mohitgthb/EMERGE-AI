const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const detectionController = require("../controllers/detection.controller");

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "video-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|mkv|flv|wmv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

// Trigger detection for a specific camera
router.post("/camera/:cameraId", detectionController.detectFromCamera);

// Upload and process video file
router.post("/video", upload.single("video"), detectionController.detectFromVideo);

// Start continuous monitoring
router.post("/monitoring/start/:cameraId", detectionController.startCameraMonitoring);

// Stop continuous monitoring
router.post("/monitoring/stop/:cameraId", detectionController.stopCameraMonitoring);

// Get camera info (used by AI service)
router.get("/camera-info/:cameraId", detectionController.getCameraInfo);

module.exports = router;
