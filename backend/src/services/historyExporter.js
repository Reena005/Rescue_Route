// ============================================================
// History exporter (Module 5)
//
// Copies operational history into the data lake (HDFS or a local
// folder) as Hive-ready, date-partitioned JSON Lines files:
//
//   incidents/dt=YYYY-MM-DD/part-00000.json       (by reported_at)
//   dispatch_facts/dt=YYYY-MM-DD/part-00000.json  (by dispatched_at)
//   truck_gps/dt=YYYY-MM-DD/part-<run>.json       (by recorded_at)
//
// Incident and dispatch partitions are rewritten from PostgreSQL
// on every export, so re-running is safe. GPS points come from
// the Module 4 tracking store, which only keeps the latest 500
// per truck, so each export sends just the points recorded since
// the previous one (tracked in gps_export_cursors).
//
// Environment:
//   ANALYTICS_EXPORT_INTERVAL_MIN  run automatically every N
//                                  minutes (not set = manual only)
// ============================================================

const pool = require("../config/db");

const storage = require("./dataLakeStorage");
const trackingStore = require("./trackingStore");


let running = false;


const pad = (n) => String(n).padStart(2, "0");


// Local "YYYY-MM-DD HH:MM:SS", the format Hive reads as TIMESTAMP
const formatLocal = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;


const toJsonLines = (rows) =>
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n";


const newRunId = () => {
    const now = new Date();

    return (
        "run-" +
        formatLocal(now).replace(/[-: ]/g, "") +
        "-" +
        Math.random().toString(36).slice(2, 6)
    );
};


// Dates that have incidents or dispatches, optionally limited
const findExportDates = async (from, to) => {
    const result = await pool.query(`
        SELECT DISTINCT to_char(day, 'YYYY-MM-DD') AS day
        FROM (
            SELECT reported_at::date AS day FROM incidents
            UNION
            SELECT dispatched_at::date FROM dispatches
        ) days
        WHERE ($1::date IS NULL OR day >= $1::date)
          AND ($2::date IS NULL OR day <= $2::date)
        ORDER BY day;
    `, [from || null, to || null]);

    return result.rows.map((row) => row.day);
};


const loadIncidents = async (day) => {
    const result = await pool.query(`
        SELECT
            incident_id,
            source_dataset,
            incident_type,
            severity,
            description,
            latitude,
            longitude,
            to_char(reported_at, 'YYYY-MM-DD HH24:MI:SS') AS reported_at,
            status
        FROM incidents
        WHERE reported_at >= $1::date
          AND reported_at < $1::date + 1
        ORDER BY reported_at, incident_id;
    `, [day]);

    return result.rows;
};


const loadDispatchFacts = async (day) => {
    const ts = (column) =>
        `to_char(${column}, 'YYYY-MM-DD HH24:MI:SS') AS ${column}`;

    const result = await pool.query(`
        SELECT
            dispatch_id,
            incident_id,
            incident_type,
            severity,
            source_dataset,
            ${ts("reported_at")},
            truck_id,
            truck_type,
            station_id,
            fire_station_name,
            division_name,
            status,
            ${ts("dispatched_at")},
            ${ts("en_route_at")},
            ${ts("arrived_at")},
            ${ts("completed_at")},
            straight_distance_km::float8 AS straight_distance_km,
            road_distance_km::float8 AS road_distance_km,
            eta_minutes::float8 AS eta_minutes,
            route_source,
            dispatch_delay_min::float8 AS dispatch_delay_min,
            travel_min::float8 AS travel_min,
            response_min::float8 AS response_min,
            eta_error_min::float8 AS eta_error_min,
            on_scene_min::float8 AS on_scene_min,
            busy_min::float8 AS busy_min
        FROM v_dispatch_facts
        WHERE dispatched_at >= $1::date
          AND dispatched_at < $1::date + 1
        ORDER BY dispatched_at, dispatch_id;
    `, [day]);

    return result.rows;
};


const recordFile = async (runId, dataset, day, filePath, rowCount) => {
    await pool.query(`
        INSERT INTO analytics_exports (
            run_id, dataset, partition_date, storage, path, row_count
        )
        VALUES ($1, $2, $3, $4, $5, $6);
    `, [runId, dataset, day, storage.getStorage(), filePath, rowCount]);
};


// New GPS points for every truck, grouped by local date
const collectNewGpsPoints = async () => {
    const trucks = await pool.query(`
        SELECT ft.truck_id, c.last_entry_id
        FROM fire_trucks ft
        LEFT JOIN gps_export_cursors c ON c.truck_id = ft.truck_id
        ORDER BY ft.truck_id;
    `);

    const byDay = new Map();
    const cursors = [];

    for (const truck of trucks.rows) {
        const { points, cursor } = await trackingStore.getHistorySince(
            truck.truck_id,
            truck.last_entry_id
        );

        if (points.length === 0) {
            continue;
        }

        for (const point of points) {
            const recordedAt = formatLocal(new Date(point.recorded_at));
            const day = recordedAt.slice(0, 10);

            if (!byDay.has(day)) {
                byDay.set(day, []);
            }

            byDay.get(day).push({
                truck_id: truck.truck_id,
                latitude: point.latitude,
                longitude: point.longitude,
                speed_kmh: point.speed_kmh,
                status: point.status,
                dispatch_id: point.dispatch_id,
                recorded_at: recordedAt
            });
        }

        cursors.push({ truck_id: truck.truck_id, cursor });
    }

    return { byDay, cursors };
};


// Run one export. `from` / `to` (YYYY-MM-DD, inclusive) limit the
// incident and dispatch partitions; GPS always sends new points.
const exportHistory = async ({ from = null, to = null } = {}) => {
    if (running) {
        const error = new Error("An export is already running");
        error.statusCode = 409;
        throw error;
    }

    running = true;

    const runId = newRunId();
    const files = [];

    try {
        const days = await findExportDates(from, to);

        for (const day of days) {
            const datasets = [
                ["incidents", await loadIncidents(day)],
                ["dispatch_facts", await loadDispatchFacts(day)]
            ];

            for (const [dataset, rows] of datasets) {
                if (rows.length === 0) {
                    continue;
                }

                const filePath = await storage.writeFile(
                    `${dataset}/dt=${day}/part-00000.json`,
                    toJsonLines(rows)
                );

                await recordFile(runId, dataset, day, filePath, rows.length);

                files.push({ dataset, partition_date: day, rows: rows.length, path: filePath });
            }
        }


        const { byDay, cursors } = await collectNewGpsPoints();

        for (const [day, rows] of [...byDay.entries()].sort()) {
            const filePath = await storage.writeFile(
                `truck_gps/dt=${day}/part-${runId}.json`,
                toJsonLines(rows)
            );

            await recordFile(runId, "truck_gps", day, filePath, rows.length);

            files.push({ dataset: "truck_gps", partition_date: day, rows: rows.length, path: filePath });
        }

        // Advance GPS cursors only after every file was written
        for (const { truck_id, cursor } of cursors) {
            await pool.query(`
                INSERT INTO gps_export_cursors (truck_id, last_entry_id, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (truck_id) DO UPDATE SET
                    last_entry_id = EXCLUDED.last_entry_id,
                    updated_at = EXCLUDED.updated_at;
            `, [truck_id, cursor]);
        }


        const totals = {};

        for (const file of files) {
            totals[file.dataset] = (totals[file.dataset] || 0) + file.rows;
        }

        return {
            run_id: runId,
            storage: storage.getStorage(),
            location: storage.getLocation(),
            file_count: files.length,
            totals,
            files
        };

    } finally {
        running = false;
    }
};


// Optional automatic exports of yesterday and today
const startScheduledExports = () => {
    const minutes = Number(process.env.ANALYTICS_EXPORT_INTERVAL_MIN);

    if (!(minutes > 0)) {
        return false;
    }

    const run = async () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        try {
            const result = await exportHistory({
                from: formatLocal(yesterday).slice(0, 10)
            });

            console.log(
                `Analytics export ${result.run_id}: ${result.file_count} files to ${result.storage}`
            );

        } catch (error) {
            console.error("Scheduled analytics export failed:", error.message);
        }
    };

    setInterval(run, minutes * 60 * 1000);

    console.log(`Analytics export scheduled every ${minutes} minutes`);

    return true;
};


module.exports = {
    exportHistory,
    startScheduledExports
};
