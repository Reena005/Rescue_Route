// ============================================================
// Live tracking store (Module 4)
//
// Holds each truck's latest position, a short GPS history per
// truck, and broadcasts live updates.
//
// Uses Redis when REDIS_URL is set and reachable:
//   rr:truck:locations        HASH    truckId -> latest location JSON
//   rr:truck:geo              GEO     live positions for radius search
//   rr:truck:history:<id>     STREAM  recent GPS points (capped)
//   rr:tracking               PUB/SUB live update channel
//
// Otherwise falls back to an in-memory store with the same
// behaviour, so the app still runs without Redis (positions are
// then lost on restart and not shared between server instances).
// ============================================================

const { EventEmitter } = require("events");
const { createClient } = require("redis");

const LOCATIONS_KEY = "rr:truck:locations";
const GEO_KEY = "rr:truck:geo";
const HISTORY_PREFIX = "rr:truck:history:";
const CHANNEL = "rr:tracking";

const HISTORY_MAX_POINTS = 500;
const REDIS_CONNECT_TIMEOUT_MS = 3000;


// Local fan-out to Server-Sent Event clients on this instance
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let redis = null;
let backend = "memory";


// In-memory fallback state
const memoryLocations = new Map();
const memoryHistory = new Map();

// In-memory history entries get "mem:<boot>:<seq>" ids so export
// cursors from an earlier run are recognised as stale
const memoryBootId = Date.now().toString(36);
let memorySeq = 0;


const haversineKm = (lat1, lng1, lat2, lng2) => {
    const toRad = (deg) => (Number(deg) * Math.PI) / 180;

    const dLat = toRad(lat2) - toRad(lat1);
    const dLng = toRad(lng2) - toRad(lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;

    return 6371 * 2 * Math.asin(Math.sqrt(a));
};


// Connect to Redis if configured; otherwise stay in memory mode
const init = async () => {
    const url = process.env.REDIS_URL;

    if (!url) {
        console.log("Tracking store: in-memory (REDIS_URL not set)");
        return backend;
    }

    const client = createClient({
        url,
        socket: {
            connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
            reconnectStrategy: (retries) => Math.min(retries * 200, 3000)
        }
    });

    client.on("error", (error) => {
        console.error("Redis error:", error.message);
    });

    try {
        await Promise.race([
            client.connect(),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error("connection timed out")),
                    REDIS_CONNECT_TIMEOUT_MS
                )
            )
        ]);

        const subscriber = client.duplicate();

        subscriber.on("error", (error) => {
            console.error("Redis subscriber error:", error.message);
        });

        await subscriber.connect();

        await subscriber.subscribe(CHANNEL, (message) => {
            try {
                emitter.emit("event", JSON.parse(message));
            } catch (error) {
                console.error("Bad tracking message:", error.message);
            }
        });

        redis = client;
        backend = "redis";

        console.log("Tracking store: Redis");

    } catch (error) {
        console.warn(
            `Tracking store: Redis unavailable (${error.message}), using in-memory store`
        );

        client.destroy();
    }

    return backend;
};


const getBackend = () => backend;


const setLocation = async (location) => {
    const record = {
        ...location,
        updated_at: location.updated_at || new Date().toISOString()
    };

    if (redis) {
        await redis
            .multi()
            .hSet(LOCATIONS_KEY, record.truck_id, JSON.stringify(record))
            .sendCommand([
                "GEOADD",
                GEO_KEY,
                String(record.longitude),
                String(record.latitude),
                record.truck_id
            ])
            .exec();
    } else {
        memoryLocations.set(record.truck_id, record);
    }

    return record;
};


// Seed a location only if the truck has none yet
const setLocationIfMissing = async (location) => {
    if (redis) {
        const exists = await redis.hExists(LOCATIONS_KEY, location.truck_id);

        if (exists) {
            return false;
        }
    } else if (memoryLocations.has(location.truck_id)) {
        return false;
    }

    await setLocation(location);

    return true;
};


const getLocation = async (truckId) => {
    if (redis) {
        const value = await redis.hGet(LOCATIONS_KEY, truckId);

        return value ? JSON.parse(value) : null;
    }

    return memoryLocations.get(truckId) || null;
};


const getAllLocations = async () => {
    if (redis) {
        const values = await redis.hGetAll(LOCATIONS_KEY);

        return Object.values(values).map((value) => JSON.parse(value));
    }

    return [...memoryLocations.values()];
};


// Trucks within radiusKm of a point, nearest first
const findNearby = async (latitude, longitude, radiusKm) => {
    if (redis) {
        const reply = await redis.sendCommand([
            "GEOSEARCH",
            GEO_KEY,
            "FROMLONLAT",
            String(longitude),
            String(latitude),
            "BYRADIUS",
            String(radiusKm),
            "km",
            "ASC",
            "WITHDIST"
        ]);

        return reply.map(([truckId, distance]) => ({
            truck_id: String(truckId),
            distance_km: Math.round(Number(distance) * 100) / 100
        }));
    }

    return [...memoryLocations.values()]
        .map((loc) => ({
            truck_id: loc.truck_id,
            distance_km:
                Math.round(
                    haversineKm(latitude, longitude, loc.latitude, loc.longitude) * 100
                ) / 100
        }))
        .filter((item) => item.distance_km <= radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km);
};


const appendHistory = async (location) => {
    const point = {
        latitude: location.latitude,
        longitude: location.longitude,
        speed_kmh: location.speed_kmh ?? null,
        status: location.status,
        dispatch_id: location.dispatch_id ?? null,
        recorded_at: location.updated_at || new Date().toISOString()
    };

    if (redis) {
        await redis.sendCommand([
            "XADD",
            HISTORY_PREFIX + location.truck_id,
            "MAXLEN",
            "~",
            String(HISTORY_MAX_POINTS),
            "*",
            "data",
            JSON.stringify(point)
        ]);

        return;
    }

    const history = memoryHistory.get(location.truck_id) || [];

    history.push({
        ...point,
        entry_id: `mem:${memoryBootId}:${++memorySeq}`
    });

    if (history.length > HISTORY_MAX_POINTS) {
        history.splice(0, history.length - HISTORY_MAX_POINTS);
    }

    memoryHistory.set(location.truck_id, history);
};


// Most recent GPS points, oldest first
const getHistory = async (truckId, limit) => {
    if (redis) {
        const reply = await redis.sendCommand([
            "XREVRANGE",
            HISTORY_PREFIX + truckId,
            "+",
            "-",
            "COUNT",
            String(limit)
        ]);

        // reply: [[id, ["data", json]], ...]
        return reply
            .map(([, fields]) => JSON.parse(fields[1]))
            .reverse();
    }

    return (memoryHistory.get(truckId) || [])
        .slice(-limit)
        .map(({ entry_id, ...point }) => point);
};


// GPS points recorded after `cursor` (an entry id returned by an
// earlier call), oldest first. Used by the Module 5 exporter.
// Returns { points, cursor } where each point has an entry_id.
const getHistorySince = async (truckId, cursor = null) => {
    if (redis) {
        // An in-memory cursor from before Redis was enabled means
        // start over
        if (cursor?.startsWith("mem:")) {
            cursor = null;
        }

        const reply = await redis.sendCommand([
            "XRANGE",
            HISTORY_PREFIX + truckId,
            cursor ? `(${cursor}` : "-",
            "+"
        ]);

        const points = reply.map(([id, fields]) => ({
            ...JSON.parse(fields[1]),
            entry_id: String(id)
        }));

        return {
            points,
            cursor: points.length > 0
                ? points[points.length - 1].entry_id
                : cursor
        };
    }

    const history = memoryHistory.get(truckId) || [];

    // A cursor from another run (or from Redis) means start over
    const [, boot, seq] = (cursor || "").split(":");
    const after = boot === memoryBootId ? Number(seq) : 0;

    const points = history.filter(
        (point) => Number(point.entry_id.split(":")[2]) > after
    );

    return {
        points,
        cursor: points.length > 0
            ? points[points.length - 1].entry_id
            : cursor
    };
};


// Broadcast to every connected client (across instances with Redis)
const publish = async (event) => {
    if (redis) {
        await redis.publish(CHANNEL, JSON.stringify(event));
    } else {
        emitter.emit("event", event);
    }
};


const subscribe = (handler) => {
    emitter.on("event", handler);

    return () => emitter.off("event", handler);
};


module.exports = {
    init,
    getBackend,
    setLocation,
    setLocationIfMissing,
    getLocation,
    getAllLocations,
    findNearby,
    appendHistory,
    getHistory,
    getHistorySince,
    publish,
    subscribe,
    haversineKm
};
