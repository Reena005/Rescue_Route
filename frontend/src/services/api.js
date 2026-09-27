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


