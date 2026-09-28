// ============================================================
// Routing service (Module 3)
//
// Road routes and travel times come from an OSRM server.
// By default this is the public OSRM demo server, which is
// fine for development but rate-limited; set OSRM_URL to a
// self-hosted OSRM for production use.
//
// If OSRM cannot be reached, a rough estimate is returned
// instead (straight-line distance x detour factor at an
// average urban speed) so dispatching never blocks on routing.
// ============================================================

const OSRM_URL =
    process.env.OSRM_URL || "https://router.project-osrm.org";

const REQUEST_TIMEOUT_MS = 6000;

// The public OSRM demo server allows about 1 request per second;
// faster requests get throttled. Self-hosted servers need no gap.
const MIN_REQUEST_INTERVAL_MS = Number(
    process.env.OSRM_MIN_INTERVAL_MS ??
    (OSRM_URL.includes("router.project-osrm.org") ? 1000 : 0)
);

// Identical routes (e.g. several trucks from one station to the
// same incident) are reused for a while instead of re-requested
const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const ROUTE_CACHE_MAX_ENTRIES = 500;

// Fallback estimate assumptions
const DETOUR_FACTOR = 1.4;
const FALLBACK_SPEED_KMH = 25;


const round = (value, places) =>
    Math.round(value * 10 ** places) / 10 ** places;


// "lng,lat" as OSRM expects
const toOsrmCoordinate = (point) =>
    `${Number(point.longitude)},${Number(point.latitude)}`;


const haversineKm = (from, to) => {
    const toRad = (deg) => (Number(deg) * Math.PI) / 180;

    const dLat = toRad(to.latitude) - toRad(from.latitude);
    const dLng = toRad(to.longitude) - toRad(from.longitude);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(from.latitude)) *
            Math.cos(toRad(to.latitude)) *
            Math.sin(dLng / 2) ** 2;

    return 6371 * 2 * Math.asin(Math.sqrt(a));
};


const estimateTravel = (from, to) => {
    const distanceKm = haversineKm(from, to) * DETOUR_FACTOR;

    return {
        distance_km: round(distanceKm, 2),
        duration_min: round((distanceKm / FALLBACK_SPEED_KMH) * 60, 1),
        source: "ESTIMATE"
    };
};


const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));


// Requests run one at a time, spaced by MIN_REQUEST_INTERVAL_MS
let requestQueue = Promise.resolve();
let lastRequestAt = 0;

const throttled = (task) => {
    const run = requestQueue.then(async () => {
        const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();

        if (wait > 0) {
            await sleep(wait);
        }

        lastRequestAt = Date.now();

        return task();
    });

    requestQueue = run.catch(() => {});

    return run;
};


const requestOsrm = async (path) => {
    let response;

    try {
        response = await fetch(`${OSRM_URL}${path}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch (error) {
        // Network failure or timeout
        error.retryable = true;
        throw error;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.code !== "Ok") {
        const error = new Error(data.message || `OSRM error ${response.status}`);

        error.retryable =
            response.status === 429 || response.status >= 500;

        throw error;
    }

    return data;
};


// One retry for network errors, timeouts and rate limiting
const fetchOsrm = async (path) => {
    try {
        return await throttled(() => requestOsrm(path));

    } catch (error) {
        if (!error.retryable) {
            throw error;
        }

        return throttled(() => requestOsrm(path));
    }
};


const routeCache = new Map();

const routeCacheKey = (from, to) =>
    [from.latitude, from.longitude, to.latitude, to.longitude]
        .map((value) => Number(value).toFixed(5))
        .join(",");


// Road route between two points.
// Returns { distance_km, duration_min, source, coordinates }
// where coordinates are GeoJSON-style [lng, lat] pairs.
const getRoute = async (from, to) => {
    const key = routeCacheKey(from, to);
    const cached = routeCache.get(key);

    if (cached && cached.expires > Date.now()) {
        return cached.route;
    }

    try {
        const data = await fetchOsrm(
            `/route/v1/driving/${toOsrmCoordinate(from)};${toOsrmCoordinate(to)}` +
            "?overview=full&geometries=geojson"
        );

        const route = data.routes[0];

        const result = {
            distance_km: round(route.distance / 1000, 2),
            duration_min: round(route.duration / 60, 1),
            source: "OSRM",
            coordinates: route.geometry.coordinates
        };

        // Only real road routes are cached; estimates are retried
        if (routeCache.size >= ROUTE_CACHE_MAX_ENTRIES) {
            routeCache.delete(routeCache.keys().next().value);
        }

        routeCache.set(key, {
            route: result,
            expires: Date.now() + ROUTE_CACHE_TTL_MS
        });

        return result;

    } catch (error) {
        console.warn("OSRM route failed, using estimate:", error.message);

        return {
            ...estimateTravel(from, to),
            coordinates: [
                [Number(from.longitude), Number(from.latitude)],
                [Number(to.longitude), Number(to.latitude)]
            ]
        };
    }
};


// Travel time from many origins to one destination in a single
// OSRM request. Returns one { distance_km, duration_min, source }
// per origin, in the same order.
const getTravelTimes = async (origins, destination) => {
    if (origins.length === 0) {
        return [];
    }

    try {
        const coordinates = [...origins, destination]
            .map(toOsrmCoordinate)
            .join(";");

        const sources = origins.map((_, index) => index).join(";");

        const data = await fetchOsrm(
            `/table/v1/driving/${coordinates}` +
            `?sources=${sources}&destinations=${origins.length}` +
            "&annotations=duration,distance"
        );

        return origins.map((origin, index) => {
            const duration = data.durations[index][0];
            const distance = data.distances[index][0];

            // OSRM returns null when no road route exists
            if (duration === null || distance === null) {
                return estimateTravel(origin, destination);
            }

            return {
                distance_km: round(distance / 1000, 2),
                duration_min: round(duration / 60, 1),
                source: "OSRM"
            };
        });

    } catch (error) {
        console.warn("OSRM table failed, using estimates:", error.message);

        return origins.map((origin) =>
            estimateTravel(origin, destination)
        );
    }
};


module.exports = {
    getRoute,
    getTravelTimes
};
