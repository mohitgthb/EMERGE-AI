const prisma = require("../config/db");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

// Trigger detection for a specific camera
exports.detectFromCamera = async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { duration } = req.body; // Optional: duration in seconds for live stream

    // Fetch camera from database
    const camera = await prisma.camera.findUnique({
      where: { cameraId },
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }

    if (!camera.isActive) {
      return res.status(400).json({ success: false, message: "Camera is not active" });
    }

    // Prepare request to AI service
    const aiPayload = {
      camera_id: camera.cameraId,
      latitude: camera.latitude,
      longitude: camera.longitude,
      stream_type: camera.streamType,
    };

    if (camera.rtspUrl) {
      aiPayload.stream_url = camera.rtspUrl;
    } else if (camera.videoPath) {
      aiPayload.video_path = camera.videoPath;
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Camera has no RTSP URL or video path configured" 
      });
    }

    if (duration) {
      aiPayload.duration_seconds = parseInt(duration);
    }

    console.log(`🎥 Triggering AI detection for camera: ${camera.cameraId} (${camera.name})`);
    console.log(`   Location: ${camera.latitude}, ${camera.longitude}`);

    // Send to AI service
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/detect/camera`,
      aiPayload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 300000, // 5 minutes timeout
      }
    );

    res.json({
      success: true,
      message: "Detection started for camera",
      camera: {
        cameraId: camera.cameraId,
        name: camera.name,
        location: camera.location,
      },
      aiResponse: aiResponse.data,
    });
  } catch (error) {
    console.error("Error triggering camera detection:", error.message || error.code || error);
    
    // Check if AI service is unreachable
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: `AI service unreachable at ${AI_SERVICE_URL}. Please ensure the AI service is running.`,
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "AI service error",
        error: error.response.data,
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || "Unknown error occurred" 
    });
  }
};

// Trigger detection for uploaded video file
exports.detectFromVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No video file uploaded" });
    }

    const { cameraId, latitude, longitude } = req.body;

    console.log(`📹 Processing uploaded video: ${req.file.filename}`);

    // Prepare FormData for AI service
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path), req.file.filename);

    // Build query params
    const queryParams = new URLSearchParams();
    
    if (cameraId) {
      // If camera_id provided, fetch location from database
      const camera = await prisma.camera.findUnique({
        where: { cameraId },
      });
      
      if (camera) {
        queryParams.append("camera_id", camera.cameraId);
        queryParams.append("latitude", camera.latitude);
        queryParams.append("longitude", camera.longitude);
        console.log(`   Using camera location: ${camera.latitude}, ${camera.longitude}`);
      } else {
        queryParams.append("camera_id", cameraId);
        if (latitude && longitude) {
          queryParams.append("latitude", latitude);
          queryParams.append("longitude", longitude);
        }
      }
    } else if (latitude && longitude) {
      queryParams.append("latitude", latitude);
      queryParams.append("longitude", longitude);
    }

    const url = `${AI_SERVICE_URL}/detect/video?${queryParams.toString()}`;

    // Send to AI service
    const aiResponse = await axios.post(url, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 600000, // 10 minutes timeout for large videos
    });

    // Clean up uploaded file after processing
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: "Video processed successfully",
      result: aiResponse.data,
    });
  } catch (error) {
    console.error("Error processing video:", error.message);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "AI service error",
        error: error.response.data,
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Start continuous monitoring for a camera
exports.startCameraMonitoring = async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { checkInterval } = req.body; // seconds between checks

    const camera = await prisma.camera.findUnique({
      where: { cameraId },
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }

    if (!camera.isActive) {
      return res.status(400).json({ success: false, message: "Camera is not active" });
    }

    const aiPayload = {
      camera_id: camera.cameraId,
      latitude: camera.latitude,
      longitude: camera.longitude,
      stream_url: camera.rtspUrl,
      continuous: true,
      check_interval: checkInterval || 300, // default 5 minutes
    };

    console.log(`🔄 Starting continuous monitoring for camera: ${camera.cameraId}`);

    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/monitoring/start`,
      aiPayload,
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    res.json({
      success: true,
      message: "Monitoring started",
      camera: {
        cameraId: camera.cameraId,
        name: camera.name,
      },
      aiResponse: aiResponse.data,
    });
  } catch (error) {
    console.error("Error starting monitoring:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Stop continuous monitoring
exports.stopCameraMonitoring = async (req, res) => {
  try {
    const { cameraId } = req.params;

    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/monitoring/stop`,
      { camera_id: cameraId },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    res.json({
      success: true,
      message: "Monitoring stopped",
      aiResponse: aiResponse.data,
    });
  } catch (error) {
    console.error("Error stopping monitoring:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get camera info for AI service (used by AI service to lookup camera details)
exports.getCameraInfo = async (req, res) => {
  try {
    const { cameraId } = req.params;

    const camera = await prisma.camera.findUnique({
      where: { cameraId },
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }

    res.json({
      success: true,
      camera: {
        cameraId: camera.cameraId,
        name: camera.name,
        location: camera.location,
        latitude: camera.latitude,
        longitude: camera.longitude,
        rtspUrl: camera.rtspUrl,
        videoPath: camera.videoPath,
        streamType: camera.streamType,
        isActive: camera.isActive,
      },
    });
  } catch (error) {
    console.error("Error fetching camera info:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
