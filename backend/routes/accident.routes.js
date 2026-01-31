const express = require('express');
const { createAccident } = require('../controllers/accident.controller');

const router = express.Router();

router.post("/", createAccident);

module.exports = router;