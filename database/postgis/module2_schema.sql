-- ============================================================
-- RescueRoute - Dispatch Database Schema
-- Module 2: Fire Truck & Dispatch Management
--
-- Run AFTER schema.sql and the Module 1 seed files, because
-- these tables reference fire_stations and incidents.
-- ============================================================


-- ============================================================
-- 1. FIRE TRUCKS
-- ============================================================

DROP TABLE IF EXISTS dispatches CASCADE;
DROP TABLE IF EXISTS fire_trucks CASCADE;

CREATE TABLE fire_trucks (
    truck_id VARCHAR(20) PRIMARY KEY,

    station_id VARCHAR(20) NOT NULL
        REFERENCES fire_stations(station_id)
        ON DELETE CASCADE,

    registration_number VARCHAR(30) UNIQUE NOT NULL,

    truck_type VARCHAR(50) NOT NULL,

    water_capacity_liters INTEGER,
    crew_capacity INTEGER,

    -- AVAILABLE    : at station, ready to dispatch
    -- DISPATCHED   : assigned to an incident, not yet moving
    -- EN_ROUTE     : travelling to the incident
    -- ON_SCENE     : working at the incident
    -- MAINTENANCE  : out of service
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN (
            'AVAILABLE',
            'DISPATCHED',
            'EN_ROUTE',
            'ON_SCENE',
            'MAINTENANCE'
        )),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Station-to-truck lookups
CREATE INDEX idx_fire_trucks_station
ON fire_trucks(station_id);


-- Availability filtering
CREATE INDEX idx_fire_trucks_status
ON fire_trucks(status);


-- ============================================================
-- 2. DISPATCHES
-- ============================================================

CREATE TABLE dispatches (
    dispatch_id SERIAL PRIMARY KEY,

    incident_id VARCHAR(20) NOT NULL
        REFERENCES incidents(incident_id)
        ON DELETE CASCADE,

    truck_id VARCHAR(20) NOT NULL
        REFERENCES fire_trucks(truck_id),

    station_id VARCHAR(20) NOT NULL
        REFERENCES fire_stations(station_id),

    -- Straight-line distance from station to incident at
    -- dispatch time (Module 3 will add road distance / ETA)
    distance_km NUMERIC(8, 2),

    status VARCHAR(20) NOT NULL DEFAULT 'DISPATCHED'
        CHECK (status IN (
            'DISPATCHED',
            'EN_ROUTE',
            'ON_SCENE',
            'COMPLETED',
            'CANCELLED'
        )),

    dispatched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    en_route_at TIMESTAMP,
    arrived_at TIMESTAMP,
    completed_at TIMESTAMP,

    notes TEXT
);


CREATE INDEX idx_dispatches_incident
ON dispatches(incident_id);


CREATE INDEX idx_dispatches_status
ON dispatches(status);


-- A truck can only be on one open dispatch at a time
CREATE UNIQUE INDEX idx_dispatches_one_open_per_truck
ON dispatches(truck_id)
WHERE status IN ('DISPATCHED', 'EN_ROUTE', 'ON_SCENE');


-- ============================================================
-- 3. EXAMPLE: NEAREST AVAILABLE TRUCKS FOR AN INCIDENT
-- ============================================================

-- SELECT
--     ft.truck_id,
--     ft.truck_type,
--     fs.fire_station_name,
--     ROUND((ST_Distance(i.location, fs.location) / 1000)::numeric, 2)
--         AS distance_km
-- FROM incidents i
-- JOIN fire_stations fs ON fs.location IS NOT NULL
-- JOIN fire_trucks ft ON ft.station_id = fs.station_id
-- WHERE i.incident_id = 'INC1001'
--   AND ft.status = 'AVAILABLE'
-- ORDER BY fs.location <-> i.location
-- LIMIT 5;


-- ============================================================
-- END OF MODULE 2 SCHEMA
-- ============================================================
