const express = require("express");

const {
    getTrackedTrucks,
    getTrackedTruck,
    reportTruckLocation,
    getTruckHistory,
    getNearbyTrucks,
    getTrackingStatus,
    streamTracking
} = require("../controllers/trackingController");

const router = express.Router();

router.get("/status", getTrackingStatus);

// Live updates (Server-Sent Events)
router.get("/stream", streamTracking);

router.get("/nearby", getNearbyTrucks);

router.get("/trucks", getTrackedTrucks);

router.get("/trucks/:truckId", getTrackedTruck);

router.get("/trucks/:truckId/history", getTruckHistory);

// GPS devices report positions here
router.post("/trucks/:truckId/location", reportTruckLocation);

module.exports = router;
