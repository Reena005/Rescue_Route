const API_BASE_URL = "http://localhost:4000/api";

export const getIncidents = async () => {
    const response = await fetch(`${API_BASE_URL}/incidents`);

    if (!response.ok) {
        throw new Error("Failed to fetch incidents");
    }

    return response.json();
};


export const getStations = async () => {
    const response = await fetch(`${API_BASE_URL}/stations`);

    if (!response.ok) {
        throw new Error("Failed to fetch fire stations");
    }

    return response.json();
};


export const getNearbyStations = async (incidentId) => {
    const response = await fetch(
        `${API_BASE_URL}/stations/nearby/${incidentId}`
    );

    if (!response.ok) {
        throw new Error("Failed to fetch nearby stations");
    }

    return response.json();
};


export const createIncident = async (incidentData) => {
    const response = await fetch(`${API_BASE_URL}/incidents`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(incidentData)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Failed to create incident");
    }

    return data;
};



// ============================================================
// Module 2 — Fire Truck & Dispatch Management
// ============================================================

const sendJson = async (url, method, body, fallbackMessage) => {
    const response = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || fallbackMessage);
    }

    return data;
};


export const getTrucks = async () => {
    const response = await fetch(`${API_BASE_URL}/trucks`);

    if (!response.ok) {
        throw new Error("Failed to fetch fire trucks");
    }

    return response.json();
};


export const getIncidentDispatches = async (incidentId) => {
    const response = await fetch(
        `${API_BASE_URL}/incidents/${incidentId}/dispatches`
    );

    if (!response.ok) {
        throw new Error("Failed to fetch dispatches");
    }

    return response.json();
};


export const getDispatchRecommendations = async (incidentId) => {
    const response = await fetch(
        `${API_BASE_URL}/dispatches/recommend/${incidentId}`
    );

    if (!response.ok) {
        throw new Error("Failed to fetch truck recommendations");
    }

    return response.json();
};


// truckIds omitted -> backend auto-selects nearest trucks by severity
export const dispatchTrucks = (incidentId, truckIds) =>
    sendJson(
        `${API_BASE_URL}/dispatches`,
        "POST",
        {
            incident_id: incidentId,
            ...(truckIds ? { truck_ids: truckIds } : {})
        },
        "Failed to dispatch trucks"
    );


export const updateDispatchStatus = (dispatchId, status) =>
    sendJson(
        `${API_BASE_URL}/dispatches/${dispatchId}/status`,
        "PATCH",
        { status },
        "Failed to update dispatch"
    );
