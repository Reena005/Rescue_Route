import { useCallback, useEffect, useState } from "react";

import {
    getIncidentDispatches,
    getDispatchRecommendations,
    dispatchTrucks,
    updateDispatchStatus
} from "../services/api";


// Buttons shown for each dispatch status
const DISPATCH_ACTIONS = {
    DISPATCHED: [
        { status: "EN_ROUTE", label: "En Route" },
        { status: "ON_SCENE", label: "On Scene" },
        { status: "CANCELLED", label: "Cancel" }
    ],
    EN_ROUTE: [
        { status: "ON_SCENE", label: "On Scene" },
        { status: "CANCELLED", label: "Cancel" }
    ],
    ON_SCENE: [
        { status: "COMPLETED", label: "Complete" }
    ]
};


function formatTime(value) {
    if (!value) {
        return "";
    }

    return new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}


// Module 3: "9.2 min" or "~15.3 min" for fallback estimates
function formatEta(minutes, source) {
    if (minutes === null || minutes === undefined) {
        return "ETA pending";
    }

    return `${source === "ESTIMATE" ? "~" : ""}${minutes} min`;
}


export default function DispatchPanel({
    incident,
    onDispatchChanged,
    routePreview,
    onPreviewRoute
}) {

    const [dispatches, setDispatches] =
        useState([]);

    const [recommendation, setRecommendation] =
        useState(null);

    const [loading, setLoading] =
        useState(false);

    const [working, setWorking] =
        useState(false);

    const [error, setError] =
        useState("");


    const loadDispatchData = useCallback(
        async (incidentId) => {

            const [
                dispatchData,
                recommendationData
            ] = await Promise.all([
                getIncidentDispatches(incidentId),
                getDispatchRecommendations(incidentId)
            ]);

            return {
                dispatches: dispatchData.dispatches,
                recommendation: recommendationData
            };
        },
        []
    );


    const incidentId = incident?.incident_id;


    useEffect(() => {

        if (!incidentId) {
            return;
        }

        let ignore = false;

        setLoading(true);
        setError("");
        setDispatches([]);
        setRecommendation(null);

        loadDispatchData(incidentId)
            .then((data) => {
                if (!ignore) {
                    setDispatches(data.dispatches);
                    setRecommendation(data.recommendation);
                }
            })
            .catch((err) => {
                if (!ignore) {
                    setError(err.message);
                }
            })
            .finally(() => {
                if (!ignore) {
                    setLoading(false);
                }
            });

        return () => {
            ignore = true;
        };

    }, [incidentId, loadDispatchData]);


    // Run a dispatch action, then refresh this panel and the dashboard
    const runAction = async (action) => {

        setWorking(true);
        setError("");

        try {

            const result = await action();

            const data =
                await loadDispatchData(incident.incident_id);

            setDispatches(data.dispatches);
            setRecommendation(data.recommendation);

            if (result?.message?.startsWith("Only")) {
                setError(result.message);
            }

            onDispatchChanged();

        } catch (err) {

            setError(err.message);

        } finally {

            setWorking(false);
        }
    };


    if (!incident) {
        return (
            <div className="nearby-panel empty-panel">

                <div className="section-title">
                    TRUCK DISPATCH
                </div>

                <p>
                    Select an incident to dispatch
                    fire trucks.
                </p>

            </div>
        );
    }


    const openDispatches = dispatches.filter(
        (d) => DISPATCH_ACTIONS[d.status]
    );

    const closedDispatches = dispatches.filter(
        (d) => !DISPATCH_ACTIONS[d.status]
    );

    const isResolved = incident.status === "RESOLVED";

    const availableTrucks =
        recommendation?.availableTrucks || [];


    return (
        <div className="nearby-panel dispatch-panel">

            <div className="dispatch-header">

                <div className="section-title">
                    TRUCK DISPATCH
                </div>

                <span className={`status-pill ${incident.status.toLowerCase()}`}>
                    {incident.status}
                </span>

            </div>


            {error && (
                <div className="form-error">
                    {error}
                </div>
            )}


            {loading ? (

                <div className="loading">
                    Loading dispatch data...
                </div>

            ) : (

                <div className="dispatch-columns">

                    {/* Assigned trucks */}

                    <div>

                        <div className="dispatch-subtitle">
                            ASSIGNED TRUCKS ({openDispatches.length})
                        </div>


                        {openDispatches.length === 0 ? (

                            <div className="empty-message">
                                No trucks currently assigned.
                            </div>

                        ) : (

                            openDispatches.map((d) => (

                                <div
                                    className="dispatch-item"
                                    key={d.dispatch_id}
                                >

                                    <div className="dispatch-item-main">

                                        <strong>
                                            {d.truck_id}
                                        </strong>

                                        <span>
                                            {d.truck_type} ·{" "}
                                            {d.fire_station_name}
                                        </span>

                                        <span>
                                            {d.road_distance_km ?? d.distance_km} km
                                            {" "}· sent{" "}
                                            {formatTime(d.dispatched_at)}
                                        </span>

                                        <span className="eta-line">
                                            {d.status === "ON_SCENE"
                                                ? `Arrived ${formatTime(d.arrived_at)}` +
                                                  (d.actual_travel_minutes !== null
                                                      ? ` · took ${d.actual_travel_minutes} min`
                                                      : "")
                                                : `ETA ${formatEta(d.eta_minutes, d.route_source)}` +
                                                  (d.expected_arrival_at
                                                      ? ` · arrives ${formatTime(d.expected_arrival_at)}`
                                                      : "")}
                                        </span>

                                    </div>


                                    <div className="dispatch-item-side">

                                        <span className={`status-pill ${d.status.toLowerCase()}`}>
                                            {d.status.replace("_", " ")}
                                        </span>

                                        <div className="dispatch-actions">

                                            {DISPATCH_ACTIONS[d.status].map(
                                                (action) => (

                                                    <button
                                                        key={action.status}
                                                        type="button"
                                                        className={
                                                            action.status === "CANCELLED"
                                                                ? "action-button secondary"
                                                                : "action-button"
                                                        }
                                                        disabled={working}
                                                        onClick={() =>
                                                            runAction(() =>
                                                                updateDispatchStatus(
                                                                    d.dispatch_id,
                                                                    action.status
                                                                )
                                                            )
                                                        }
                                                    >
                                                        {action.label}
                                                    </button>
                                                )
                                            )}

                                        </div>

                                    </div>

                                </div>
                            ))
                        )}


                        {closedDispatches.length > 0 && (

                            <div className="dispatch-history">

                                {closedDispatches.map((d) => (

                                    <div key={d.dispatch_id}>
                                        {d.truck_id} — {d.status}{" "}
                                        {formatTime(d.completed_at)}
                                    </div>
                                ))}

                            </div>
                        )}

                    </div>


                    {/* Nearest available trucks */}

                    <div>

                        <div className="dispatch-subtitle">

                            FASTEST AVAILABLE TRUCKS (BY ROAD)

                        </div>


                        {!isResolved && (

                            <button
                                type="button"
                                className="report-button auto-dispatch"
                                disabled={
                                    working ||
                                    availableTrucks.length === 0
                                }
                                onClick={() =>
                                    runAction(() =>
                                        dispatchTrucks(
                                            incident.incident_id
                                        )
                                    )
                                }
                            >
                                {working
                                    ? "DISPATCHING..."
                                    : `AUTO DISPATCH ${
                                        recommendation?.recommended_count || 1
                                    } FASTEST (${incident.severity})`}
                            </button>
                        )}


                        {isResolved ? (

                            <div className="empty-message">
                                Incident resolved.
                            </div>

                        ) : availableTrucks.length === 0 ? (

                            <div className="empty-message">
                                No trucks available.
                            </div>

                        ) : (

                            availableTrucks.slice(0, 5).map((truck) => (

                                <div
                                    className="truck-option"
                                    key={truck.truck_id}
                                >

                                    <div className="dispatch-item-main">

                                        <strong>
                                            {truck.truck_type}
                                        </strong>

                                        <span>
                                            {truck.fire_station_name} ·{" "}
                                            {truck.road_distance_km} km by road
                                        </span>

                                        <span className="eta-line">
                                            ETA{" "}
                                            {formatEta(
                                                truck.eta_minutes,
                                                truck.route_source
                                            )}
                                        </span>

                                    </div>


                                    <div className="dispatch-actions">

                                        <button
                                            type="button"
                                            className={
                                                routePreview?.truck_id ===
                                                truck.truck_id
                                                    ? "action-button secondary active"
                                                    : "action-button secondary"
                                            }
                                            onClick={() =>
                                                onPreviewRoute(truck)
                                            }
                                        >
                                            {routePreview?.truck_id ===
                                            truck.truck_id
                                                ? "Hide"
                                                : "Route"}
                                        </button>
    
                                        <button
                                            type="button"
                                            className="action-button"
                                            disabled={working}
                                            onClick={() =>
                                                runAction(() =>
                                                    dispatchTrucks(
                                                        incident.incident_id,
                                                        [truck.truck_id]
                                                    )
                                                )
                                            }
                                        >
                                            Dispatch
                                        </button>

                                    </div>

                                </div>
                            ))
                        )}

                    </div>

                </div>
            )}

        </div>
    );
}
