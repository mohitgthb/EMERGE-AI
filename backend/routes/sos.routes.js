const express = require("express");
const { triggerSOS } = require("../controllers/sos.controller");

const router = express.Router();

router.post("/", triggerSOS);

module.exports = router;