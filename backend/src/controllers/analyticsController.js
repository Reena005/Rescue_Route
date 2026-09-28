const pool = require("../config/db");

const storage = require("../services/dataLakeStorage");
const { exportHistory } = require("../services/historyExporter");


// ============================================================
// All analytics accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive),
// applied to the incident's reported_at. Dispatch measures come
// from the v_dispatch_facts view (module5_schema.sql).
// ============================================================

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;


class BadRequest extends Error {}


const parseRange = (query) => {
    const from = query.from || null;
    const to = query.to || null;

    if ((from && !DATE_PATTERN.test(from)) || (to && !DATE_PATTERN.test(to))) {
        throw new BadRequest("from and to must be dates like 2026-07-01");
    }

    if (from && to && from > to) {
        throw new BadRequest("from must be on or before to");
    }

    return [from, to];
};


// Incidents / dispatch facts in the requested period ($1, $2)
const INCIDENTS_IN_RANGE = `
    SELECT *
    FROM incidents
    WHERE ($1::date IS NULL OR reported_at >= $1::date)
      AND ($2::date IS NULL OR reported_at < $2::date + 1)
`;

const FACTS_IN_RANGE = `
    SELECT *
    FROM v_dispatch_facts
    WHERE ($1::date IS NULL OR reported_at >= $1::date)
      AND ($2::date IS NULL OR reported_at < $2::date + 1)
`;


// Wrap a handler with range parsing and uniform error responses
const handler = (label, fn) => async (req, res) => {
    try {
        const range = parseRange(req.query);

        res.json(await fn(req, range));

    } catch (error) {
        if (error instanceof BadRequest) {
            return res.status(400).json({ message: error.message });
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error(`Error in analytics ${label}:`, error);

        res.status(500).json({
            message: `Failed to load ${label}`,
            error: error.message
        });
    }
};


const countsBy = async (range, column) => {
    const result = await pool.query(`
        SELECT ${column} AS key, COUNT(*)::int AS count
        FROM (${INCIDENTS_IN_RANGE}) inc
        GROUP BY 1
        ORDER BY 2 DESC;
    `, range);

    return Object.fromEntries(
        result.rows.map((row) => [row.key, row.count])
    );
};


// GET /api/analytics/summary
const getSummary = handler("summary", async (req, range) => {
    const [
        byStatus,
        bySeverity,
        byType,
        dispatchResult,
        responseResult,
        etaResult
    ] = await Promise.all([
        countsBy(range, "status"),
        countsBy(range, "severity"),
        countsBy(range, "incident_type"),

        pool.query(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
                COUNT(*) FILTER (
                    WHERE status IN ('DISPATCHED', 'EN_ROUTE', 'ON_SCENE')
                )::int AS open,
                MIN(dispatched_at) AS first_dispatch,
                MAX(dispatched_at) AS last_dispatch
            FROM (${FACTS_IN_RANGE}) f;
        `, range),

        // Response time = first truck on scene after the report
        pool.query(`
            WITH first_arrival AS (
                SELECT
                    incident_id,
                    MIN(response_min) AS response_min,
                    MIN(dispatch_delay_min) AS dispatch_delay_min
                FROM (${FACTS_IN_RANGE}) f
                WHERE arrived_at IS NOT NULL
                GROUP BY incident_id
            )
            SELECT
                COUNT(*)::int AS incidents_with_arrival,
                ROUND(AVG(response_min), 1)::float8 AS avg_response_min,
                ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_min)::numeric, 1)::float8
                    AS median_response_min,
                ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_min)::numeric, 1)::float8
                    AS p90_response_min,
                -- Median: a few very late dispatches (e.g. old demo
                -- incidents dispatched weeks later) would skew an average
                ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY dispatch_delay_min)::numeric, 1)::float8
                    AS median_dispatch_delay_min
            FROM first_arrival;
        `, range),

        pool.query(`
            SELECT
                ROUND(AVG(travel_min), 1)::float8 AS avg_travel_min,
                ROUND(AVG(on_scene_min), 1)::float8 AS avg_on_scene_min,
                ROUND(AVG(eta_error_min), 1)::float8 AS avg_eta_error_min,
                ROUND(AVG(ABS(eta_error_min)), 1)::float8 AS mean_abs_eta_error_min,
                ROUND(
                    100.0 * COUNT(*) FILTER (WHERE ABS(eta_error_min) <= 2)
                    / NULLIF(COUNT(eta_error_min), 0),
                    1
                )::float8 AS eta_within_2_min_pct
            FROM (${FACTS_IN_RANGE}) f
            WHERE arrived_at IS NOT NULL;
        `, range)
    ]);

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return {
        period: { from: range[0], to: range[1] },
        incidents: {
            total,
            by_status: byStatus,
            by_severity: bySeverity,
            by_type: byType
        },
        dispatches: dispatchResult.rows[0],
        response: {
            ...responseResult.rows[0],
            ...etaResult.rows[0]
        }
    };
});


// Grouping options for response times (whitelisted SQL)
const RESPONSE_GROUPS = {
    severity: {
        key: "severity",
        label: "severity",
        order: `CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END`
    },
    incident_type: { key: "incident_type", label: "incident_type", order: "dispatches DESC" },
    station: { key: "station_id", label: "fire_station_name", order: "dispatches DESC" },
    division: { key: "division_name", label: "division_name", order: "dispatches DESC" },
    hour: {
        key: "EXTRACT(HOUR FROM reported_at)::int",
        label: "EXTRACT(HOUR FROM reported_at)::int",
        order: "1"
    }
};


// GET /api/analytics/response-times?group_by=severity
const getResponseTimes = handler("response times", async (req, range) => {
    const groupBy = req.query.group_by || "severity";
    const group = RESPONSE_GROUPS[groupBy];

    if (!group) {
        throw new BadRequest(
            `group_by must be one of ${Object.keys(RESPONSE_GROUPS).join(", ")}`
        );
    }

    const result = await pool.query(`
        SELECT
            ${group.key} AS group_key,
            MIN(${group.label}) AS group_label,
            COUNT(DISTINCT incident_id)::int AS incidents,
            COUNT(*)::int AS dispatches,
            ROUND(AVG(response_min), 1)::float8 AS avg_response_min,
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_min)::numeric, 1)::float8
                AS median_response_min,
            ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_min)::numeric, 1)::float8
                AS p90_response_min,
            ROUND(AVG(travel_min), 1)::float8 AS avg_travel_min,
            ROUND(AVG(eta_error_min), 1)::float8 AS avg_eta_error_min
        FROM (${FACTS_IN_RANGE}) f
        WHERE arrived_at IS NOT NULL
        GROUP BY 1
        ORDER BY ${group.order};
    `, range);

    return {
        group_by: groupBy,
        count: result.rows.length,
        groups: result.rows
    };
});


// GET /api/analytics/stations  (workload per station)
const getStationWorkload = handler("station workload", async (req, range) => {
    const result = await pool.query(`
        WITH f AS (${FACTS_IN_RANGE})
        SELECT
            fs.station_id,
            fs.fire_station_name,
            fs.division_name,
            fs.latitude,
            fs.longitude,
            COUNT(f.dispatch_id)::int AS dispatches,
            COUNT(DISTINCT f.incident_id)::int AS incidents,
            COUNT(f.dispatch_id) FILTER (WHERE f.status = 'COMPLETED')::int AS completed,
            ROUND(AVG(f.travel_min), 1)::float8 AS avg_travel_min,
            ROUND(COALESCE(SUM(f.busy_min), 0) / 60, 1)::float8 AS busy_hours,
            ROUND(
                100.0 * COUNT(f.dispatch_id)
                / NULLIF(SUM(COUNT(f.dispatch_id)) OVER (), 0),
                1
            )::float8 AS share_pct
        FROM fire_stations fs
        LEFT JOIN f ON f.station_id = fs.station_id
        GROUP BY fs.station_id
        ORDER BY dispatches DESC, fs.station_id;
    `, range);

    return {
        count: result.rows.length,
        stations: result.rows
    };
});


// GET /api/analytics/trucks  (utilization per truck)
const getTruckUtilization = handler("truck utilization", async (req, range) => {
    const result = await pool.query(`
        WITH f AS (${FACTS_IN_RANGE}),

        -- Period length: the requested dates, else the data's span
        period AS (
            SELECT GREATEST(
                EXTRACT(EPOCH FROM (
                    COALESCE($2::date + 1, MAX(COALESCE(completed_at, LOCALTIMESTAMP)))
                    - COALESCE($1::date, MIN(dispatched_at))
                )) / 60,
                1
            ) AS minutes
            FROM f
        )

        SELECT
            ft.truck_id,
            ft.truck_type,
            ft.station_id,
            fs.fire_station_name,
            ft.status AS current_status,
            COUNT(f.dispatch_id)::int AS dispatches,
            COUNT(f.dispatch_id) FILTER (WHERE f.status = 'COMPLETED')::int AS completed,
            ROUND(COALESCE(SUM(f.busy_min), 0) / 60, 1)::float8 AS busy_hours,
            ROUND(
                (100 * COALESCE(SUM(f.busy_min), 0) / MAX(period.minutes))::numeric,
                2
            )::float8 AS utilization_pct,
            -- Road distance to the scene and back
            ROUND(
                COALESCE(SUM(f.road_distance_km) FILTER (WHERE f.status = 'COMPLETED'), 0) * 2,
                1
            )::float8 AS est_km_driven
        FROM fire_trucks ft
        JOIN fire_stations fs ON fs.station_id = ft.station_id
        CROSS JOIN period
        LEFT JOIN f ON f.truck_id = ft.truck_id
        GROUP BY ft.truck_id, fs.fire_station_name
        ORDER BY busy_hours DESC, ft.truck_id;
    `, range);

    return {
        count: result.rows.length,
        trucks: result.rows
    };
});


const TREND_INTERVALS = ["day", "week", "month"];


// GET /api/analytics/trends?interval=day
const getTrends = handler("trends", async (req, range) => {
    const interval = req.query.interval || "day";

    if (!TREND_INTERVALS.includes(interval)) {
        throw new BadRequest(`interval must be one of ${TREND_INTERVALS.join(", ")}`);
    }

    const result = await pool.query(`
        SELECT
            to_char(date_trunc('${interval}', reported_at), 'YYYY-MM-DD') AS period,
            COUNT(*)::int AS incidents,
            COUNT(*) FILTER (WHERE severity = 'CRITICAL')::int AS critical,
            COUNT(*) FILTER (WHERE severity = 'HIGH')::int AS high,
            COUNT(*) FILTER (WHERE severity = 'MEDIUM')::int AS medium,
            COUNT(*) FILTER (WHERE severity = 'LOW')::int AS low
        FROM (${INCIDENTS_IN_RANGE}) inc
        GROUP BY 1
        ORDER BY 1;
    `, range);

    return {
        interval,
        count: result.rows.length,
        trends: result.rows
    };
});


// GET /api/analytics/hourly  (incidents and response by hour of day)
const getHourlyPattern = handler("hourly pattern", async (req, range) => {
    const result = await pool.query(`
        WITH inc AS (${INCIDENTS_IN_RANGE}),
        f AS (${FACTS_IN_RANGE}),

        first_arrival AS (
            SELECT incident_id, MIN(response_min) AS response_min
            FROM f
            WHERE arrived_at IS NOT NULL
            GROUP BY incident_id
        )

        SELECT
            h.hour,
            COUNT(inc.incident_id)::int AS incidents,
            ROUND(AVG(fa.response_min), 1)::float8 AS avg_response_min
        FROM generate_series(0, 23) AS h(hour)
        LEFT JOIN inc ON EXTRACT(HOUR FROM inc.reported_at) = h.hour
        LEFT JOIN first_arrival fa ON fa.incident_id = inc.incident_id
        GROUP BY h.hour
        ORDER BY h.hour;
    `, range);

    return {
        hours: result.rows
    };
});


// GET /api/analytics/hotspots?cell_km=1
// Incidents clustered on a grid (PostGIS ST_SnapToGrid)
const getHotspots = handler("hotspots", async (req, range) => {
    const cellKm = Math.min(Math.max(Number(req.query.cell_km) || 1, 0.2), 10);

    // ~111 km per degree of latitude
    const cellDegrees = cellKm / 111;

    const result = await pool.query(`
        SELECT
            ROUND(AVG(latitude)::numeric, 5)::float8 AS latitude,
            ROUND(AVG(longitude)::numeric, 5)::float8 AS longitude,
            COUNT(*)::int AS incidents,
            COUNT(*) FILTER (WHERE severity IN ('HIGH', 'CRITICAL'))::int AS serious,
            mode() WITHIN GROUP (ORDER BY incident_type) AS top_incident_type
        FROM (${INCIDENTS_IN_RANGE}) inc
        GROUP BY ST_SnapToGrid(location::geometry, $3)
        ORDER BY incidents DESC
        LIMIT 25;
    `, [...range, cellDegrees]);

    return {
        cell_km: cellKm,
        count: result.rows.length,
        hotspots: result.rows
    };
});


// POST /api/analytics/export   body: { from?, to? }
const runExport = async (req, res) => {
    try {
        const [from, to] = parseRange(req.body || {});

        const result = await exportHistory({ from, to });

        res.status(201).json({
            message: `Exported ${result.file_count} files to ${result.storage}`,
            ...result
        });

    } catch (error) {
        if (error instanceof BadRequest) {
            return res.status(400).json({ message: error.message });
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error("Error exporting history:", error);

        res.status(500).json({
            message: "Failed to export history",
            error: error.message
        });
    }
};


// GET /api/analytics/exports  (recent export runs)
const getExports = handler("exports", async () => {
    const result = await pool.query(`
        SELECT
            run_id,
            storage,
            MIN(exported_at) AS started_at,
            MAX(exported_at) AS finished_at,
            COUNT(*)::int AS files,
            COALESCE(SUM(row_count) FILTER (WHERE dataset = 'incidents'), 0)::int
                AS incident_rows,
            COALESCE(SUM(row_count) FILTER (WHERE dataset = 'dispatch_facts'), 0)::int
                AS dispatch_rows,
            COALESCE(SUM(row_count) FILTER (WHERE dataset = 'truck_gps'), 0)::int
                AS gps_rows
        FROM analytics_exports
        GROUP BY run_id, storage
        ORDER BY started_at DESC
        LIMIT 10;
    `);

    return {
        storage: storage.getStorage(),
        location: storage.getLocation(),
        runs: result.rows
    };
});


module.exports = {
    getSummary,
    getResponseTimes,
    getStationWorkload,
    getTruckUtilization,
    getTrends,
    getHourlyPattern,
    getHotspots,
    runExport,
    getExports
};
