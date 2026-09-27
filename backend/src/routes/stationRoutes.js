const express = require("express");

const {
    getAllStations,
    getStationById,
    getNearbyStations
} = require("../controllers/stationController");

const router = express.Router();

router.get("/", getAllStations);

router.get("/nearby/:incidentId", getNearbyStations);

router.get("/:stationId", getStationById);

module.exports = router;