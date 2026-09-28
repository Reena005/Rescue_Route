-- ============================================================
-- RescueRoute - Module 2 Seed Data: Fire Trucks
--
-- Demo/synthetic fleet: every fire station gets a Water Tender
-- and a Foam Tender. Every third station also gets an Aerial
-- Ladder Platform, and every fifth station a Rescue Tender.
--
-- Requires fire_stations to be loaded first.
-- ============================================================

DELETE FROM dispatches;
DELETE FROM fire_trucks;


-- Water Tender (every station)
INSERT INTO fire_trucks (
    truck_id, station_id, registration_number, truck_type,
    water_capacity_liters, crew_capacity, status
)
SELECT
    'TRK-' || station_id || '-WT',
    station_id,
    'TN-FR-' || SUBSTRING(station_id FROM 4) || '-01',
    'Water Tender',
    4500,
    6,
    'AVAILABLE'
FROM fire_stations;


-- Foam Tender (every station)
INSERT INTO fire_trucks (
    truck_id, station_id, registration_number, truck_type,
    water_capacity_liters, crew_capacity, status
)
SELECT
    'TRK-' || station_id || '-FT',
    station_id,
    'TN-FR-' || SUBSTRING(station_id FROM 4) || '-02',
    'Foam Tender',
    3000,
    5,
    'AVAILABLE'
FROM fire_stations;


-- Aerial Ladder Platform (every third station)
INSERT INTO fire_trucks (
    truck_id, station_id, registration_number, truck_type,
    water_capacity_liters, crew_capacity, status
)
SELECT
    'TRK-' || station_id || '-AL',
    station_id,
    'TN-FR-' || SUBSTRING(station_id FROM 4) || '-03',
    'Aerial Ladder Platform',
    NULL,
    4,
    'AVAILABLE'
FROM fire_stations
WHERE station_id ~ '^CHN[0-9]+$'
  AND SUBSTRING(station_id FROM 4)::int % 3 = 0;


-- Rescue Tender (every fifth station)
INSERT INTO fire_trucks (
    truck_id, station_id, registration_number, truck_type,
    water_capacity_liters, crew_capacity, status
)
SELECT
    'TRK-' || station_id || '-RT',
    station_id,
    'TN-FR-' || SUBSTRING(station_id FROM 4) || '-04',
    'Rescue Tender',
    NULL,
    6,
    'AVAILABLE'
FROM fire_stations
WHERE station_id ~ '^CHN[0-9]+$'
  AND SUBSTRING(station_id FROM 4)::int % 5 = 0;


-- A few trucks out of service for realism
UPDATE fire_trucks
SET status = 'MAINTENANCE'
WHERE truck_id IN (
    'TRK-CHN004-FT',
    'TRK-CHN011-WT',
    'TRK-CHN027-FT'
);
