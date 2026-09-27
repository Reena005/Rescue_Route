const pool = require("../config/db");

// GET /api/stations
// Returns all fire stations
const getAllStations = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                station_id,
                source_dataset,
                division_name,
                district,
                fire_station_name,
                fire_station_phone_number,
                fire_station_officer_mobile,
                tab_number,
                landline_number,
                cug_number,
                fire_station_mail_id,
                latitude,
                longitude,
                spatial_source,
                created_at
            FROM fire_stations
            ORDER BY station_id;
        `);

        res.json({
            count: result.rows.length,
            stations: result.rows
        });

    } catch (error) {
        console.error("Error fetching fire stations:", error);

        res.status(500).json({
            message: "Failed to fetch fire stations",
            error: error.message
        });
    }
};


// GET /api/stations/:stationId
// Returns one fire station
const getStationById = async (req, res) => {
    try {
        const { stationId } = req.params;

        const result = await pool.query(`
            SELECT
                station_id,
                source_dataset,
                division_name,
                district,
                fire_station_name,
                fire_station_phone_number,
                fire_station_officer_mobile,
                tab_number,
                landline_number,
                cug_number,
                fire_station_mail_id,
                latitude,
                longitude,
                spatial_source,
                created_at
            FROM fire_stations
            WHERE station_id = $1;
        `, [stationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Fire station not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error fetching fire station:", error);

        res.status(500).json({
            message: "Failed to fetch fire station",
            error: error.message
        });
    }
};


// GET /api/stations/nearby/:incidentId
// Returns the 3 nearest fire stations for an incident
const getNearbyStations = async (req, res) => {
    try {
        const { incidentId } = req.params;

        // First check whether the incident exists
        const incidentResult = await pool.query(`
            SELECT
                incident_id,
                incident_type,
                severity,
                latitude,
                longitude
            FROM incidents
            WHERE incident_id = $1;
        `, [incidentId]);

        if (incidentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        // Find the 3 nearest stations using PostGIS
        const result = await pool.query(`
            SELECT
                i.incident_id,
                i.incident_type,
                i.severity,

                fs.station_id,
                fs.fire_station_name,
                fs.division_name,
                fs.district,
                fs.fire_station_phone_number,

                fs.latitude,
                fs.longitude,

                ROUND(
                    (
                        ST_Distance(
                            i.location,
                            fs.location
                        ) / 1000
                    )::numeric,
                    2
                ) AS distance_km

            FROM incidents i

            JOIN LATERAL (
                SELECT
                    station_id,
                    fire_station_name,
                    division_name,
                    district,
                    fire_station_phone_number,
                    latitude,
                    longitude,
                    location
                FROM fire_stations
                WHERE location IS NOT NULL
                ORDER BY location <-> i.location
                LIMIT 3
            ) fs ON TRUE

            WHERE i.incident_id = $1

            ORDER BY distance_km;
        `, [incidentId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "No nearby fire stations found"
            });
        }

        res.json({
            incident: incidentResult.rows[0],
            count: result.rows.length,
            nearbyStations: result.rows
        });

    } catch (error) {
        console.error("Error finding nearby stations:", error);

        res.status(500).json({
            message: "Failed to find nearby fire stations",
            error: error.message
        });
    }
};


module.exports = {
    getAllStations,
    getStationById,
    getNearbyStations
};