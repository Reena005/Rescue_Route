const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");

const incidentRoutes = require("./routes/incidentRoutes");
const stationRoutes = require("./routes/stationRoutes");
const truckRoutes = require("./routes/truckRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const routeRoutes = require("./routes/routeRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

const trackingStore = require("./services/trackingStore");
const trackingService = require("./services/trackingService");
const truckSimulator = require("./services/truckSimulator");
const historyExporter = require("./services/historyExporter");

const app = express();

app.use(cors());
app.use(express.json());


// Root API
app.get("/", (req, res) => {
    res.json({
        message: "RescueRoute API is running"
    });
});


// Database health check
app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT NOW() AS current_time"
        );

        res.json({
            status: "OK",
            database: "Connected",
            time: result.rows[0].current_time
        });

    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            status: "ERROR",
            database: "Connection failed",
            message: error.message
        });
    }
});


// Incident APIs
app.use("/api/incidents", incidentRoutes);


// Station APIs
app.use("/api/stations", stationRoutes);


// Fire truck APIs (Module 2)
app.use("/api/trucks", truckRoutes);


// Dispatch APIs (Module 2)
app.use("/api/dispatches", dispatchRoutes);


// Routing & ETA APIs (Module 3)
app.use("/api/routes", routeRoutes);


// Real-time tracking APIs (Module 4)
app.use("/api/tracking", trackingRoutes);


// Historical analytics APIs (Module 5)
app.use("/api/analytics", analyticsRoutes);


// Module 4: connect the tracking store (Redis or in-memory),
// give every truck a starting position, and resume any
// simulated trips interrupted by a restart
const startTracking = async () => {
    await trackingStore.init();

    try {
        const seeded =
            await trackingService.seedStationPositions();

        const resumed =
            await truckSimulator.resumeActiveTrips();

        console.log(
            `Tracking ready: ${seeded} trucks placed at stations, ${resumed} trips resumed`
        );

    } catch (error) {
        console.error(
            "Tracking startup skipped (database not ready):",
            error.message
        );
    }
};


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(
        `RescueRoute backend running on http://localhost:${PORT}`
    );

    startTracking();

    // Module 5: optional scheduled exports to HDFS / data lake
    historyExporter.startScheduledExports();
});