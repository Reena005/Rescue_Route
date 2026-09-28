-- ============================================================
-- RescueRoute - Module 5 Seed Data: Synthetic Dispatch History
--
-- SYNTHETIC DATA for developing and demonstrating Historical
-- Analytics. These are NOT real emergency records.
--
-- Generates about 360 resolved incidents between 2026-07-01 and
-- 2026-08-31 (IDs HIS00001...), each with completed dispatches
-- from the nearest stations, plus a stored route and ETA per
-- dispatch. Patterns built in:
--   * more incidents between 10:00 and 20:00
--   * two hotspots: Ambattur Industrial Estate (industrial fires)
--     and T. Nagar (commercial fires)
--   * 1 / 1 / 2 / 3 trucks for LOW / MEDIUM / HIGH / CRITICAL
--   * slower travel in rush hours (08-10, 17-20)
--   * some extra trucks recalled (CANCELLED) before arrival
--
-- The output is deterministic (fixed random seed) and the file
-- can be re-run: it first removes earlier HIS* records.
--
-- Requires schema.sql, fire_stations.sql, module2_schema.sql,
-- fire_trucks.sql and module3_schema.sql.
-- ============================================================

SELECT setseed(0.2026);


-- Dispatches and their routes are removed by ON DELETE CASCADE
DELETE FROM incidents
WHERE incident_id LIKE 'HIS%';


-- ============================================================
-- 1. HISTORICAL INCIDENTS
-- ============================================================

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
WITH stations AS (
    SELECT
        array_agg(latitude ORDER BY station_id) AS lats,
        array_agg(longitude ORDER BY station_id) AS lngs,
        COUNT(*) AS n
    FROM fire_stations
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
),

draws AS (
    SELECT
        g,
        random() AS r_area,
        random() AS r_station,
        random() AS r_lat,
        random() AS r_lng,
        random() AS r_severity,
        random() AS r_hotspot_type,
        random() AS r_type,
        random() AS r_day,
        random() AS r_hour_mode,
        random() AS r_hour,
        random() AS r_minute
    FROM generate_series(1, 360) AS g
),

placed AS (
    SELECT
        d.*,

        -- 15% Ambattur Industrial Estate, 12% T. Nagar,
        -- the rest spread around the fire stations
        CASE
            WHEN d.r_area < 0.15 THEN 'AMBATTUR'
            WHEN d.r_area < 0.27 THEN 'TNAGAR'
            ELSE 'CITY'
        END AS area,

        CASE
            WHEN d.r_area < 0.15 THEN 13.0986
            WHEN d.r_area < 0.27 THEN 13.0418
            ELSE s.lats[1 + floor(d.r_station * s.n)::int]
        END AS base_lat,

        CASE
            WHEN d.r_area < 0.15 THEN 80.1620
            WHEN d.r_area < 0.27 THEN 80.2341
            ELSE s.lngs[1 + floor(d.r_station * s.n)::int]
        END AS base_lng,

        CASE
            WHEN d.r_area < 0.27 THEN 0.014
            ELSE 0.04
        END AS spread

    FROM draws d
    CROSS JOIN stations s
),

typed AS (
    SELECT
        p.*,

        CASE
            WHEN p.area = 'AMBATTUR' AND p.r_hotspot_type < 0.6
                THEN 'Industrial Fire'
            WHEN p.area = 'TNAGAR' AND p.r_hotspot_type < 0.5
                THEN 'Commercial Fire'
            ELSE (ARRAY[
                'Building Fire',
                'Residential Fire',
                'Commercial Fire',
                'Industrial Fire',
                'Vehicle Fire',
                'Electrical Fire'
            ])[1 + floor(p.r_type * 6)::int]
        END AS incident_type,

        ROUND((p.base_lat + (p.r_lat - 0.5) * p.spread)::numeric, 6)::float8
            AS lat,

        ROUND((p.base_lng + (p.r_lng - 0.5) * p.spread)::numeric, 6)::float8
            AS lng,

        -- 60% between 10:00 and 20:59, the rest at any hour
        CASE
            WHEN p.r_hour_mode < 0.6 THEN 10 + floor(p.r_hour * 11)
            ELSE floor(p.r_hour * 24)
        END AS hour

    FROM placed p
)

SELECT
    'HIS' || LPAD(g::text, 5, '0'),

    'RescueRoute Synthetic History',

    incident_type,

    CASE
        WHEN r_severity < 0.08 THEN 'CRITICAL'
        WHEN r_severity < 0.40 THEN 'HIGH'
        WHEN r_severity < 0.85 THEN 'MEDIUM'
        ELSE 'LOW'
    END,

    incident_type || ' (synthetic historical record)',

    lat,
    lng,

    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,

    TIMESTAMP '2026-07-01 00:00:00'
        + floor(r_day * 62) * INTERVAL '1 day'
        + hour * INTERVAL '1 hour'
        + floor(r_minute * 60) * INTERVAL '1 minute',

    'RESOLVED'

FROM typed;


-- ============================================================
-- 2. HISTORICAL DISPATCHES
-- ============================================================

INSERT INTO dispatches (
    incident_id,
    truck_id,
    station_id,
    distance_km,
    status,
    dispatched_at,
    en_route_at,
    arrived_at,
    completed_at,
    notes
)
WITH inc AS (
    SELECT
        incident_id,
        location,
        reported_at,
        EXTRACT(HOUR FROM reported_at) AS hour,

        CASE severity
            WHEN 'CRITICAL' THEN 3
            WHEN 'HIGH' THEN 2
            ELSE 1
        END AS truck_count,

        -- Bigger fires keep trucks on scene longer
        CASE severity
            WHEN 'CRITICAL' THEN 2.2
            WHEN 'HIGH' THEN 1.6
            WHEN 'MEDIUM' THEN 1.0
            ELSE 0.6
        END AS scene_factor

    FROM incidents
    WHERE incident_id LIKE 'HIS%'
),

picked AS (
    SELECT
        inc.*,
        t.truck_id,
        t.station_id,
        t.straight_km,

        ROW_NUMBER() OVER (
            PARTITION BY inc.incident_id
            ORDER BY t.straight_km, t.truck_id
        ) AS truck_rank,

        random() AS r_delay,
        random() AS r_speed,
        random() AS r_scene,
        random() AS r_recall

    FROM inc
    CROSS JOIN LATERAL (
        SELECT
            ft.truck_id,
            ft.station_id,
            ST_Distance(fs.location, inc.location) / 1000 AS straight_km
        FROM fire_trucks ft
        JOIN fire_stations fs ON fs.station_id = ft.station_id
        WHERE ft.status <> 'MAINTENANCE'
          AND fs.location IS NOT NULL
        ORDER BY fs.location <-> inc.location, ft.truck_id
        LIMIT inc.truck_count
    ) t
),

timed AS (
    SELECT
        picked.*,

        -- 1-4 minutes to dispatch after the call
        reported_at + (1 + r_delay * 3) * INTERVAL '1 minute'
            AS dispatched_at,

        -- Road distance ~1.35x straight line; planned ETA at
        -- 30 km/h. Actual travel is 0.8x-1.4x the ETA, +25% in
        -- rush hours, plus half a minute to get rolling.
        (straight_km * 1.35) / 30 * 60
            * (0.8 + r_speed * 0.6)
            * CASE
                WHEN hour BETWEEN 8 AND 10
                  OR hour BETWEEN 17 AND 20 THEN 1.25
                ELSE 1
              END
            + 0.5 AS travel_min,

        (15 + r_scene * 45) * scene_factor AS scene_min,

        -- 15% of additional trucks are recalled before arriving
        (truck_rank > 1 AND r_recall < 0.15) AS recalled

    FROM picked
)

SELECT
    incident_id,
    truck_id,
    station_id,
    ROUND(straight_km::numeric, 2),

    CASE WHEN recalled THEN 'CANCELLED' ELSE 'COMPLETED' END,

    dispatched_at,

    dispatched_at + INTERVAL '1 minute',

    CASE
        WHEN recalled THEN NULL
        ELSE dispatched_at + travel_min * INTERVAL '1 minute'
    END,

    CASE
        WHEN recalled THEN dispatched_at + INTERVAL '4 minutes'
        ELSE dispatched_at + (travel_min + scene_min) * INTERVAL '1 minute'
    END,

    'Synthetic historical dispatch'

FROM timed;


-- ============================================================
-- 3. HISTORICAL ROUTES
-- ============================================================

-- Straight-line estimate routes (route_source = 'ESTIMATE')

INSERT INTO dispatch_routes (
    dispatch_id,
    origin_latitude,
    origin_longitude,
    destination_latitude,
    destination_longitude,
    road_distance_km,
    eta_minutes,
    route_source,
    path,
    computed_at
)
SELECT
    d.dispatch_id,
    fs.latitude,
    fs.longitude,
    i.latitude,
    i.longitude,
    ROUND(d.distance_km * 1.35, 2),
    ROUND(d.distance_km * 1.35 / 30 * 60, 1),
    'ESTIMATE',
    ST_MakeLine(
        fs.location::geometry,
        i.location::geometry
    )::geography,
    d.dispatched_at
FROM dispatches d
JOIN incidents i ON i.incident_id = d.incident_id
JOIN fire_stations fs ON fs.station_id = d.station_id
WHERE d.incident_id LIKE 'HIS%';


-- ============================================================
-- 4. SUMMARY
-- ============================================================

SELECT
    (SELECT COUNT(*) FROM incidents WHERE incident_id LIKE 'HIS%')
        AS historical_incidents,
    (SELECT COUNT(*) FROM dispatches WHERE incident_id LIKE 'HIS%')
        AS historical_dispatches;
