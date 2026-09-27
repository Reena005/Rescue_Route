const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");

const incidentRoutes = require("./routes/incidentRoutes");
const stationRoutes = require("./routes/stationRoutes");

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


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(
        `RescueRoute backend running on http://localhost:${PORT}`
    );
});