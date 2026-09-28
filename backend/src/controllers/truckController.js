const pool = require("../config/db");

const TRUCK_COLUMNS = `
    ft.truck_id,
    ft.station_id,
    fs.fire_station_name,
    ft.registration_number,
    ft.truck_type,
    ft.water_capacity_liters,
    ft.crew_capacity,
    ft.status,
    ft.created_at,
    ft.updated_at
`;

const TRUCK_STATUSES = [
    "AVAILABLE",
    "DISPATCHED",
    "EN_ROUTE",
    "ON_SCENE",
    "MAINTENANCE"
];


// GET /api/trucks?station_id=CHN001&status=AVAILABLE
const getAllTrucks = async (req, res) => {
    try {
        const { station_id, status } = req.query;

        const result = await pool.query(`
            SELECT ${TRUCK_COLUMNS}
            FROM fire_trucks ft
            JOIN fire_stations fs
                ON fs.station_id = ft.station_id
            WHERE ($1::varchar IS NULL OR ft.station_id = $1)
              AND ($2::varchar IS NULL OR ft.status = $2)
            ORDER BY ft.station_id, ft.truck_id;
        `, [
            station_id || null,
            status ? status.toUpperCase() : null
        ]);

        res.json({
            count: result.rows.length,
            trucks: result.rows
        });

    } catch (error) {
        console.error("Error fetching trucks:", error);

        res.status(500).json({
            message: "Failed to fetch fire trucks",
            error: error.message
        });
    }
};


// GET /api/trucks/:truckId
const getTruckById = async (req, res) => {
    try {
        const { truckId } = req.params;

        const result = await pool.query(`
            SELECT ${TRUCK_COLUMNS}
            FROM fire_trucks ft
            JOIN fire_stations fs
                ON fs.station_id = ft.station_id
            WHERE ft.truck_id = $1;
        `, [truckId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Fire truck not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error fetching truck:", error);

        res.status(500).json({
            message: "Failed to fetch fire truck",
            error: error.message
        });
    }
};


// POST /api/trucks
const createTruck = async (req, res) => {
    try {
        const {
            truck_id,
            station_id,
            registration_number,
            truck_type,
            water_capacity_liters,
            crew_capacity
        } = req.body;

        if (
            !truck_id ||
            !station_id ||
            !registration_number ||
            !truck_type
        ) {
            return res.status(400).json({
                message:
                    "truck_id, station_id, registration_number and truck_type are required"
            });
        }

        const result = await pool.query(`
            INSERT INTO fire_trucks (
                truck_id,
                station_id,
                registration_number,
                truck_type,
                water_capacity_liters,
                crew_capacity,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE')
            RETURNING *;
        `, [
            truck_id,
            station_id,
            registration_number,
            truck_type,
            water_capacity_liters ?? null,
            crew_capacity ?? null
        ]);

        res.status(201).json({
            message: "Fire truck created successfully",
            truck: result.rows[0]
        });

    } catch (error) {
        console.error("Error creating truck:", error);

        // Duplicate truck ID or registration
        if (error.code === "23505") {
            return res.status(409).json({
                message: "Truck ID or registration number already exists"
            });
        }

        // Unknown station
        if (error.code === "23503") {
            return res.status(400).json({
                message: "Fire station does not exist"
            });
        }

        res.status(500).json({
            message: "Failed to create fire truck",
            error: error.message
        });
    }
};


// PATCH /api/trucks/:truckId/status
// Manual status changes are limited to taking a truck in and
// out of service. Dispatch-related statuses are driven by the
// dispatch APIs so trucks and dispatches stay in sync.
const updateTruckStatus = async (req, res) => {
    try {
        const { truckId } = req.params;
        const status = req.body.status?.toUpperCase();

        if (!TRUCK_STATUSES.includes(status)) {
            return res.status(400).json({
                message: `Status must be one of ${TRUCK_STATUSES.join(", ")}`
            });
        }

        if (!["AVAILABLE", "MAINTENANCE"].includes(status)) {
            return res.status(400).json({
                message:
                    "Use the dispatch APIs to move a truck into dispatch statuses"
            });
        }

        const result = await pool.query(`
            UPDATE fire_trucks
            SET status = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE truck_id = $1
              AND status IN ('AVAILABLE', 'MAINTENANCE')
            RETURNING *;
        `, [truckId, status]);

        if (result.rows.length === 0) {
            const exists = await pool.query(
                "SELECT status FROM fire_trucks WHERE truck_id = $1",
                [truckId]
            );

            if (exists.rows.length === 0) {
                return res.status(404).json({
                    message: "Fire truck not found"
                });
            }

            return res.status(409).json({
                message:
                    `Truck is currently ${exists.rows[0].status} on a dispatch`
            });
        }

        res.json({
            message: "Truck status updated",
            truck: result.rows[0]
        });

    } catch (error) {
        console.error("Error updating truck status:", error);

        res.status(500).json({
            message: "Failed to update truck status",
            error: error.message
        });
    }
};


module.exports = {
    getAllTrucks,
    getTruckById,
    createTruck,
    updateTruckStatus
};
