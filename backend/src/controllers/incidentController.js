const pool = require("../config/db");

// Source of the Module 5 synthetic history seed
const HISTORY_SOURCE = "RescueRoute Synthetic History";


// GET /api/incidents
// GET /api/incidents?include_history=false  (hide Module 5 history)
const getAllIncidents = async (req, res) => {
    try {
        const includeHistory = req.query.include_history !== "false";

        const result = await pool.query(`
            SELECT
                incident_id,
                source_dataset,
                incident_type,
                severity,
                description,
                latitude,
                longitude,
                reported_at,
                status,
                created_at
            FROM incidents
            WHERE $1 OR source_dataset <> $2
            ORDER BY reported_at DESC;
        `, [includeHistory, HISTORY_SOURCE]);

        res.json({
            count: result.rows.length,
            incidents: result.rows
        });
    } catch (error) {
        console.error("Error fetching incidents:", error);

        res.status(500).json({
            message: "Failed to fetch incidents",
            error: error.message
        });
    }
};


// GET /api/incidents/:id
const getIncidentById = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                incident_id,
                source_dataset,
                incident_type,
                severity,
                description,
                latitude,
                longitude,
                reported_at,
                status,
                created_at
            FROM incidents
            WHERE incident_id = $1;
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error fetching incident:", error);

        res.status(500).json({
            message: "Failed to fetch incident",
            error: error.message
        });
    }
};


// POST /api/incidents
const createIncident = async (req, res) => {
    try {
        const {
            incident_id,
            incident_type,
            severity,
            description,
            latitude,
            longitude,
            reported_at
        } = req.body;


        // Check required fields
        if (
            !incident_id ||
            !incident_type ||
            !severity ||
            latitude === undefined ||
            longitude === undefined
        ) {
            return res.status(400).json({
                message:
                    "incident_id, incident_type, severity, latitude and longitude are required"
            });
        }


        // Validate latitude
        if (latitude < -90 || latitude > 90) {
            return res.status(400).json({
                message: "Latitude must be between -90 and 90"
            });
        }


        // Validate longitude
        if (longitude < -180 || longitude > 180) {
            return res.status(400).json({
                message: "Longitude must be between -180 and 180"
            });
        }


        // Validate severity
        const allowedSeverities = [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"
        ];

        if (!allowedSeverities.includes(severity.toUpperCase())) {
            return res.status(400).json({
                message:
                    "Severity must be LOW, MEDIUM, HIGH or CRITICAL"
            });
        }


        // Insert incident into PostgreSQL + PostGIS
        const result = await pool.query(
            `
            INSERT INTO incidents (
                incident_id,
                source_dataset,
                incident_type,
                severity,
                description,
                latitude,
                longitude,
                location,
                reported_at,
                status
            )
            VALUES (
                $1,
                'RescueRoute Live Incident Report',
                $2,
                $3,
                $4,
                $5,
                $6,
                ST_SetSRID(
                    ST_MakePoint($6, $5),
                    4326
                )::geography,
                -- Parse with time zone ("...Z" from the browser),
                -- then store as local time like CURRENT_TIMESTAMP
                COALESCE($7::timestamptz::timestamp, CURRENT_TIMESTAMP),
                'PENDING'
            )
            RETURNING
                incident_id,
                source_dataset,
                incident_type,
                severity,
                description,
                latitude,
                longitude,
                reported_at,
                status,
                created_at;
            `,
            [
                incident_id,
                incident_type,
                severity.toUpperCase(),
                description || null,
                Number(latitude),
                Number(longitude),
                reported_at || null
            ]
        );


        res.status(201).json({
            message: "Incident created successfully",
            incident: result.rows[0]
        });


    } catch (error) {
        console.error("Error creating incident:", error);


        // Duplicate incident ID
        if (error.code === "23505") {
            return res.status(409).json({
                message: "Incident ID already exists"
            });
        }


        res.status(500).json({
            message: "Failed to create incident",
            error: error.message
        });
    }
};


module.exports = {
    getAllIncidents,
    getIncidentById,
    createIncident
};

