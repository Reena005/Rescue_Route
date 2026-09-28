-- ============================================================
-- RescueRoute - Hive Analytics Queries
-- Module 5: Historical Analytics
--
-- Batch versions of the analytics shown in the app, run over the
-- full history in HDFS. Create the tables first with
-- create_tables.hql.
--
--   beeline -u jdbc:hive2://localhost:10000 -f database/hive/analytics_queries.hql
--
-- Add a filter such as  WHERE dt BETWEEN '2026-07-01' AND '2026-07-31'
-- to any query to limit it to a period (partition pruning).
-- ============================================================

USE rescueroute;


-- ============================================================
-- 1. RESPONSE TIME BY SEVERITY
-- ============================================================

-- Response time = first truck on scene after the incident report

WITH first_arrival AS (
    SELECT
        incident_id,
        severity,
        MIN(response_min) AS response_min
    FROM dispatch_facts
    WHERE arrived_at IS NOT NULL
    GROUP BY incident_id, severity
)
SELECT
    severity,
    COUNT(*)                                  AS incidents,
    ROUND(AVG(response_min), 1)               AS avg_response_min,
    ROUND(PERCENTILE_APPROX(response_min, 0.5), 1) AS median_response_min,
    ROUND(PERCENTILE_APPROX(response_min, 0.9), 1) AS p90_response_min
FROM first_arrival
GROUP BY severity
ORDER BY avg_response_min;


-- ============================================================
-- 2. STATION WORKLOAD
-- ============================================================

SELECT
    station_id,
    fire_station_name,
    COUNT(*)                                          AS dispatches,
    COUNT(DISTINCT incident_id)                       AS incidents,
    ROUND(AVG(travel_min), 1)                         AS avg_travel_min,
    ROUND(SUM(busy_min) / 60, 1)                      AS busy_hours
FROM dispatch_facts
GROUP BY station_id, fire_station_name
ORDER BY dispatches DESC;


-- ============================================================
-- 3. TRUCK UTILIZATION
-- ============================================================

-- Share of the whole period each truck spent on dispatches

WITH period AS (
    SELECT
        (UNIX_TIMESTAMP(MAX(COALESCE(completed_at, dispatched_at)))
            - UNIX_TIMESTAMP(MIN(dispatched_at))) / 60 AS minutes
    FROM dispatch_facts
)
SELECT
    f.truck_id,
    f.truck_type,
    f.station_id,
    COUNT(*)                                          AS dispatches,
    ROUND(SUM(f.busy_min) / 60, 1)                    AS busy_hours,
    ROUND(100 * SUM(f.busy_min) / MAX(p.minutes), 2)  AS utilization_pct
FROM dispatch_facts f
CROSS JOIN period p
GROUP BY f.truck_id, f.truck_type, f.station_id
ORDER BY busy_hours DESC;


-- ============================================================
-- 4. ETA ACCURACY (MODULE 3 ESTIMATES vs ACTUAL)
-- ============================================================

SELECT
    route_source,
    COUNT(*)                                          AS arrivals,
    ROUND(AVG(eta_error_min), 1)                      AS avg_error_min,
    ROUND(AVG(ABS(eta_error_min)), 1)                 AS mean_abs_error_min,
    ROUND(100 * SUM(IF(ABS(eta_error_min) <= 2, 1, 0)) / COUNT(*), 1)
                                                      AS within_2_min_pct
FROM dispatch_facts
WHERE arrived_at IS NOT NULL
  AND eta_minutes IS NOT NULL
GROUP BY route_source;


-- ============================================================
-- 5. INCIDENTS BY HOUR OF DAY
-- ============================================================

SELECT
    HOUR(reported_at)  AS hour_of_day,
    COUNT(*)           AS incidents
FROM incidents
GROUP BY HOUR(reported_at)
ORDER BY hour_of_day;


-- ============================================================
-- 6. DAILY INCIDENT TREND BY SEVERITY
-- ============================================================

SELECT
    dt,
    COUNT(*)                                  AS incidents,
    SUM(IF(severity = 'CRITICAL', 1, 0))      AS critical,
    SUM(IF(severity = 'HIGH', 1, 0))          AS high,
    SUM(IF(severity = 'MEDIUM', 1, 0))        AS medium,
    SUM(IF(severity = 'LOW', 1, 0))           AS low
FROM incidents
GROUP BY dt
ORDER BY dt;


-- ============================================================
-- 7. INCIDENT HOTSPOTS (~1 km GRID)
-- ============================================================

SELECT
    ROUND(latitude, 2)                        AS grid_lat,
    ROUND(longitude, 2)                       AS grid_lng,
    COUNT(*)                                  AS incidents,
    SUM(IF(severity IN ('HIGH', 'CRITICAL'), 1, 0)) AS serious
FROM incidents
GROUP BY ROUND(latitude, 2), ROUND(longitude, 2)
ORDER BY incidents DESC
LIMIT 20;


-- ============================================================
-- 8. GPS ACTIVITY PER TRUCK PER DAY
-- ============================================================

SELECT
    dt,
    truck_id,
    COUNT(*)                                  AS gps_points,
    ROUND(AVG(IF(speed_kmh > 0, speed_kmh, NULL)), 1) AS avg_moving_speed_kmh,
    MAX(speed_kmh)                            AS max_speed_kmh,
    COUNT(DISTINCT dispatch_id)               AS trips
FROM truck_gps
GROUP BY dt, truck_id
ORDER BY dt, gps_points DESC;
