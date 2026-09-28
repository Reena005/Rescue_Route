const express = require("express");

const {
    getSummary,
    getResponseTimes,
    getStationWorkload,
    getTruckUtilization,
    getTrends,
    getHourlyPattern,
    getHotspots,
    runExport,
    getExports
} = require("../controllers/analyticsController");

const router = express.Router();

// All GET routes accept ?from=YYYY-MM-DD&to=YYYY-MM-DD

router.get("/summary", getSummary);

router.get("/response-times", getResponseTimes);

router.get("/stations", getStationWorkload);

router.get("/trucks", getTruckUtilization);

router.get("/trends", getTrends);

router.get("/hourly", getHourlyPattern);

router.get("/hotspots", getHotspots);

// Export history to HDFS / local data lake
router.post("/export", runExport);

router.get("/exports", getExports);

module.exports = router;
