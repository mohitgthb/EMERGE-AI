const express = require("express");
const multer = require("multer");
const { processVideo } = require("../controllers/videoDetection.controller");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/process-video", upload.single("file"), processVideo);

module.exports = router;
