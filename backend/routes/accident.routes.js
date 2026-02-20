const express = require('express');
const { createAccident, listAccidents, getAccident } = require('../controllers/accident.controller');

const router = express.Router();

router.get("/", listAccidents);
router.get("/:id", getAccident);
router.post("/", createAccident);

module.exports = router;