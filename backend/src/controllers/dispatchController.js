const pool = require("../config/db");


// How many trucks to send by default for each severity
const TRUCKS_BY_SEVERITY = {
    LOW: 1,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3
};

const OPEN_DISPATCH_STATUSES = [
    "DISPATCHED",
    "EN_ROUTE",
    "ON_SCENE"
];

// Allowed dispatch status transitions
const NEXT_STATUSES = {
    DISPATCHED: ["EN_ROUTE", "ON_SCENE", "CANCELLED"],
    EN_ROUTE: ["ON_SCENE", "CANCELLED"],
    ON_SCENE: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: []
};

// Timestamp column to fill when a dispatch enters a status
const STATUS_TIMESTAMP = {
    EN_ROUTE: "en_route_at",
    ON_SCENE: "arrived_at",
    COMPLETED: "completed_at",
    CANCELLED: "completed_at"
};

const DISPATCH_COLUMNS = `
    d.dispatch_id,
    d.incident_id,
    i.incident_type,
    i.severity,
    d.truck_id,
    ft.truck_type,
    ft.registration_number,
    d.station_id,
    fs.fire_station_name,
    fs.latitude AS station_latitude,
    fs.longitude AS station_longitude,
    d.distance_km,
    d.status,
    d.dispatched_at,
    d.en_route_at,
    d.arrived_at,
    d.completed_at,
    d.notes
`;

const DISPATCH_FROM = `
    FROM dispatches d
    JOIN incidents i ON i.incident_id = d.incident_id
    JOIN fire_trucks ft ON ft.truck_id = d.truck_id
    JOIN fire_stations fs ON fs.station_id = d.station_id
`;


const getRecommendedCount = (severity) =>
    TRUCKS_BY_SEVERITY[severity] || 1;


// Recompute incident status from its dispatches.
//   any truck on scene        -> ACTIVE
//   any other open dispatch   -> DISPATCHED
//   none open, some completed -> RESOLVED
//   none open, none completed -> PENDING
const syncIncidentStatus = async (client, incidentId) => {
    const result = await client.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'ON_SCENE') AS on_scene,
            COUNT(*) FILTER (
                WHERE status IN ('DISPATCHED', 'EN_ROUTE')
            ) AS travelling,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed
        FROM dispatches
        WHERE incident_id = $1;
    `, [incidentId]);

    const counts = result.rows[0];

    let status = "PENDING";

    if (Number(counts.on_scene) > 0) {
        status = "ACTIVE";
    } else if (Number(counts.travelling) > 0) {
        status = "DISPATCHED";
    } else if (Number(counts.completed) > 0) {
        status = "RESOLVED";
    }

    await client.query(
        "UPDATE incidents SET status = $2 WHERE incident_id = $1",
        [incidentId, status]
    );

    return status;
};


// GET /api/dispatches?status=EN_ROUTE&incident_id=INC1001
const getAllDispatches = async (req, res) => {
    try {
        const { status, incident_id } = req.query;

        const result = await pool.query(`
            SELECT ${DISPATCH_COLUMNS}
            ${DISPATCH_FROM}
            WHERE ($1::varchar IS NULL OR d.status = $1)
              AND ($2::varchar IS NULL OR d.incident_id = $2)
            ORDER BY d.dispatched_at DESC, d.dispatch_id DESC;
        `, [
            status ? status.toUpperCase() : null,
            incident_id || null
        ]);

        res.json({
            count: result.rows.length,
            dispatches: result.rows
        });

    } catch (error) {
        console.error("Error fetching dispatches:", error);

        res.status(500).json({
            message: "Failed to fetch dispatches",
            error: error.message
        });
    }
};


// GET /api/incidents/:id/dispatches
const getIncidentDispatches = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT ${DISPATCH_COLUMNS}
            ${DISPATCH_FROM}
            WHERE d.incident_id = $1
            ORDER BY d.dispatched_at, d.dispatch_id;
        `, [id]);

        res.json({
            incident_id: id,
            count: result.rows.length,
            dispatches: result.rows
        });

    } catch (error) {
        console.error("Error fetching incident dispatches:", error);

        res.status(500).json({
            message: "Failed to fetch incident dispatches",
            error: error.message
        });
    }
};


// GET /api/dispatches/recommend/:incidentId
// Nearest AVAILABLE trucks to an incident (Module 1 spatial
// lookup + Module 2 availability).
const getDispatchRecommendations = async (req, res) => {
    try {
        const { incidentId } = req.params;

        const incidentResult = await pool.query(`
            SELECT
                incident_id,
                incident_type,
                severity,
                status,
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

        const incident = incidentResult.rows[0];

        const result = await pool.query(`
            SELECT
                ft.truck_id,
                ft.truck_type,
                ft.registration_number,
                ft.water_capacity_liters,
                ft.crew_capacity,
                fs.station_id,
                fs.fire_station_name,
                fs.division_name,
                ROUND(
                    (ST_Distance(i.location, fs.location) / 1000)::numeric,
                    2
                ) AS distance_km
            FROM incidents i
            JOIN fire_stations fs
                ON fs.location IS NOT NULL
            JOIN fire_trucks ft
                ON ft.station_id = fs.station_id
            WHERE i.incident_id = $1
              AND ft.status = 'AVAILABLE'
            ORDER BY distance_km, ft.truck_id
            LIMIT 10;
        `, [incidentId]);

        res.json({
            incident,
            recommended_count: getRecommendedCount(incident.severity),
            count: result.rows.length,
            availableTrucks: result.rows
        });

    } catch (error) {
        console.error("Error building dispatch recommendations:", error);

        res.status(500).json({
            message: "Failed to recommend trucks",
            error: error.message
        });
    }
};


// POST /api/dispatches
// Body:
//   { incident_id, truck_ids: ["TRK-CHN001-WT"] }  -> dispatch these trucks
//   { incident_id, count: 2 }                      -> nearest N available
//   { incident_id }                                -> nearest N by severity
const createDispatch = async (req, res) => {
    const { incident_id, truck_ids, count, notes } = req.body;

    if (!incident_id) {
        return res.status(400).json({
            message: "incident_id is required"
        });
    }

    if (
        truck_ids !== undefined &&
        (!Array.isArray(truck_ids) || truck_ids.length === 0)
    ) {
        return res.status(400).json({
            message: "truck_ids must be a non-empty array"
        });
    }

    if (
        count !== undefined &&
        (!Number.isInteger(count) || count < 1 || count > 10)
    ) {
        return res.status(400).json({
            message: "count must be a whole number between 1 and 10"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Lock the incident so concurrent dispatches serialize
        const incidentResult = await client.query(`
            SELECT incident_id, severity, status
            FROM incidents
            WHERE incident_id = $1
            FOR UPDATE;
        `, [incident_id]);

        if (incidentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = incidentResult.rows[0];

        if (incident.status === "RESOLVED") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Incident is already resolved"
            });
        }


        // Pick and lock the trucks
        let trucks;

        if (truck_ids) {
            const result = await client.query(`
                SELECT
                    ft.truck_id,
                    ft.station_id,
                    ft.status,
                    ROUND(
                        (ST_Distance(i.location, fs.location) / 1000)::numeric,
                        2
                    ) AS distance_km
                FROM fire_trucks ft
                JOIN fire_stations fs
                    ON fs.station_id = ft.station_id
                JOIN incidents i
                    ON i.incident_id = $1
                WHERE ft.truck_id = ANY($2::varchar[])
                FOR UPDATE OF ft;
            `, [incident_id, truck_ids]);

            const found = result.rows.map((t) => t.truck_id);
            const missing = truck_ids.filter((id) => !found.includes(id));

            if (missing.length > 0) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: `Fire truck not found: ${missing.join(", ")}`
                });
            }

            const busy = result.rows.filter(
                (t) => t.status !== "AVAILABLE"
            );

            if (busy.length > 0) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: `Truck not available: ${busy
                        .map((t) => `${t.truck_id} (${t.status})`)
                        .join(", ")}`
                });
            }

            trucks = result.rows;

        } else {
            const wanted = count || getRecommendedCount(incident.severity);

            const result = await client.query(`
                SELECT
                    ft.truck_id,
                    ft.station_id,
                    ROUND(
                        (ST_Distance(i.location, fs.location) / 1000)::numeric,
                        2
                    ) AS distance_km
                FROM incidents i
                JOIN fire_stations fs
                    ON fs.location IS NOT NULL
                JOIN fire_trucks ft
                    ON ft.station_id = fs.station_id
                WHERE i.incident_id = $1
                  AND ft.status = 'AVAILABLE'
                ORDER BY ST_Distance(i.location, fs.location), ft.truck_id
                LIMIT $2
                FOR UPDATE OF ft SKIP LOCKED;
            `, [incident_id, wanted]);

            if (result.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: "No fire trucks are currently available"
                });
            }

            trucks = result.rows;
        }


        // Create dispatch records and mark trucks as dispatched
        const dispatchIds = [];

        for (const truck of trucks) {
            const inserted = await client.query(`
                INSERT INTO dispatches (
                    incident_id,
                    truck_id,
                    station_id,
                    distance_km,
                    status,
                    notes
                )
                VALUES ($1, $2, $3, $4, 'DISPATCHED', $5)
                RETURNING dispatch_id;
            `, [
                incident_id,
                truck.truck_id,
                truck.station_id,
                truck.distance_km,
                notes || null
            ]);

            dispatchIds.push(inserted.rows[0].dispatch_id);

            await client.query(`
                UPDATE fire_trucks
                SET status = 'DISPATCHED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE truck_id = $1;
            `, [truck.truck_id]);
        }

        const incidentStatus =
            await syncIncidentStatus(client, incident_id);

        const created = await client.query(`
            SELECT ${DISPATCH_COLUMNS}
            ${DISPATCH_FROM}
            WHERE d.dispatch_id = ANY($1::int[])
            ORDER BY d.distance_km, d.dispatch_id;
        `, [dispatchIds]);

        await client.query("COMMIT");

        const requested = truck_ids
            ? truck_ids.length
            : count || getRecommendedCount(incident.severity);

        res.status(201).json({
            message:
                trucks.length < requested
                    ? `Only ${trucks.length} of ${requested} requested trucks were available`
                    : "Trucks dispatched successfully",
            incident_status: incidentStatus,
            count: created.rows.length,
            dispatches: created.rows
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Error creating dispatch:", error);

        // Open-dispatch-per-truck unique index
        if (error.code === "23505") {
            return res.status(409).json({
                message: "Truck is already on an open dispatch"
            });
        }

        res.status(500).json({
            message: "Failed to dispatch trucks",
            error: error.message
        });

    } finally {
        client.release();
    }
};


// PATCH /api/dispatches/:dispatchId/status
// Body: { status: "EN_ROUTE" | "ON_SCENE" | "COMPLETED" | "CANCELLED" }
const updateDispatchStatus = async (req, res) => {
    const { dispatchId } = req.params;
    const status = req.body.status?.toUpperCase();

    if (!STATUS_TIMESTAMP[status]) {
        return res.status(400).json({
            message:
                "Status must be EN_ROUTE, ON_SCENE, COMPLETED or CANCELLED"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const current = await client.query(`
            SELECT dispatch_id, incident_id, truck_id, status
            FROM dispatches
            WHERE dispatch_id = $1
            FOR UPDATE;
        `, [dispatchId]);

        if (current.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Dispatch not found"
            });
        }

        const dispatch = current.rows[0];

        if (!NEXT_STATUSES[dispatch.status].includes(status)) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message:
                    `Cannot change dispatch from ${dispatch.status} to ${status}`
            });
        }


        // Timestamp column comes from a fixed whitelist above
        const timestampColumn = STATUS_TIMESTAMP[status];

        await client.query(`
            UPDATE dispatches
            SET status = $2,
                ${timestampColumn} = CURRENT_TIMESTAMP
            WHERE dispatch_id = $1;
        `, [dispatchId, status]);


        // Keep truck status in step with its dispatch
        const truckStatus = OPEN_DISPATCH_STATUSES.includes(status)
            ? status
            : "AVAILABLE";

        await client.query(`
            UPDATE fire_trucks
            SET status = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE truck_id = $1;
        `, [dispatch.truck_id, truckStatus]);


        const incidentStatus =
            await syncIncidentStatus(client, dispatch.incident_id);

        const updated = await client.query(`
            SELECT ${DISPATCH_COLUMNS}
            ${DISPATCH_FROM}
            WHERE d.dispatch_id = $1;
        `, [dispatchId]);

        await client.query("COMMIT");

        res.json({
            message: "Dispatch status updated",
            incident_status: incidentStatus,
            dispatch: updated.rows[0]
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Error updating dispatch status:", error);

        res.status(500).json({
            message: "Failed to update dispatch status",
            error: error.message
        });

    } finally {
        client.release();
    }
};


module.exports = {
    getAllDispatches,
    getIncidentDispatches,
    getDispatchRecommendations,
    createDispatch,
    updateDispatchStatus
};
