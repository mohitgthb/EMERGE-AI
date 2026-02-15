const prisma = require("../config/db");

// Get all cameras
exports.getAllCameras = async (req, res) => {
  try {
    const cameras = await prisma.camera.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, cameras });
  } catch (error) {
    console.error("Error fetching cameras:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single camera by ID
exports.getCameraById = async (req, res) => {
  try {
    const { id } = req.params;
    const camera = await prisma.camera.findUnique({
      where: { id },
    });
    
    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }
    
    res.json({ success: true, camera });
  } catch (error) {
    console.error("Error fetching camera:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get camera by cameraId (unique identifier)
exports.getCameraByCameraId = async (req, res) => {
  try {
    const { cameraId } = req.params;
    const camera = await prisma.camera.findUnique({
      where: { cameraId },
    });
    
    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }
    
    res.json({ success: true, camera });
  } catch (error) {
    console.error("Error fetching camera:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new camera
exports.createCamera = async (req, res) => {
  try {
    const { cameraId, name, location, latitude, longitude, rtspUrl, videoPath, streamType, isActive } = req.body;
    
    // Validate required fields
    if (!cameraId || !name || !location || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: "cameraId, name, location, latitude, and longitude are required" 
      });
    }

    // Check if camera already exists
    const existingCamera = await prisma.camera.findUnique({
      where: { cameraId },
    });

    if (existingCamera) {
      return res.status(400).json({ 
        success: false, 
        message: "Camera with this cameraId already exists" 
      });
    }

    const camera = await prisma.camera.create({
      data: {
        cameraId,
        name,
        location,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        rtspUrl: rtspUrl || null,
        videoPath: videoPath || null,
        streamType: streamType || "RTSP",
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    res.status(201).json({ success: true, camera });
  } catch (error) {
    console.error("Error creating camera:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update camera
exports.updateCamera = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, latitude, longitude, rtspUrl, videoPath, streamType, isActive } = req.body;

    const camera = await prisma.camera.findUnique({
      where: { id },
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }

    const updatedCamera = await prisma.camera.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(location && { location }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(rtspUrl !== undefined && { rtspUrl }),
        ...(videoPath !== undefined && { videoPath }),
        ...(streamType && { streamType }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, camera: updatedCamera });
  } catch (error) {
    console.error("Error updating camera:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update camera by cameraId (e.g., CAM_TEST_FILE)
exports.updateCameraByCameraId = async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { name, location, latitude, longitude, rtspUrl, videoPath, streamType, isActive } = req.body;

    const camera = await prisma.camera.findUnique({
      where: { cameraId },
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }

    const updatedCamera = await prisma.camera.update({
      where: { cameraId },
      data: {
        ...(name && { name }),
        ...(location && { location }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(rtspUrl !== undefined && { rtspUrl }),
        ...(videoPath !== undefined && { videoPath }),
        ...(streamType && { streamType }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, camera: updatedCamera });
  } catch (error) {
    console.error("Error updating camera by cameraId:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete camera
exports.deleteCamera = async (req, res) => {
  try {
    const { id } = req.params;

    const camera = await prisma.camera.findUnique({
      where: { id },
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }

    await prisma.camera.delete({
      where: { id },
    });

    res.json({ success: true, message: "Camera deleted successfully" });
  } catch (error) {
    console.error("Error deleting camera:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get active cameras
exports.getActiveCameras = async (req, res) => {
  try {
    const cameras = await prisma.camera.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, cameras });
  } catch (error) {
    console.error("Error fetching active cameras:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
