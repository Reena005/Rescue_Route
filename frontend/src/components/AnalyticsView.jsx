import { useCallback, useEffect, useState } from "react";

import {
    MapContainer,
    TileLayer,
    CircleMarker,
    Tooltip as MapTooltip
} from "react-leaflet";

import { ColumnChart, BarChart } from "./analytics/charts";

import {
    getAnalytics,
    exportHistory
} from "../services/api";


// ============================================================
// Module 5 — Historical Analytics dashboard
// ============================================================

const CHENNAI_CENTER = [13.0827, 80.2207];

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];


const isoDate = (date) => date.toISOString().slice(0, 10);

const daysAgo = (days) =>
    isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

const PRESETS = [
    { id: "all", label: "All time", range: () => ({ from: "", to: "" }) },
    { id: "90", label: "Last 90 days", range: () => ({ from: daysAgo(90), to: "" }) },
    { id: "30", label: "Last 30 days", range: () => ({ from: daysAgo(30), to: "" }) }
];


const fmtMin = (value) =>
    value === null || value === undefined ? "–" : `${value} min`;

const fmtTime = (value) =>
    value ? new Date(value).toLocaleString() : "";


function StatTile({ label, value, note }) {
    return (
        <div className="kpi-tile">
            <span>{label}</span>
            <strong>{value}</strong>
            {note && <small>{note}</small>}
        </div>
    );
}


function Panel({ title, subtitle, children, wide = false }) {
    return (
        <section className={`analytics-panel ${wide ? "wide" : ""}`}>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
            {children}
        </section>
    );
}


export default function AnalyticsView() {

    const [preset, setPreset] =
        useState("all");

    const [range, setRange] =
        useState({ from: "", to: "" });

    const [data, setData] =
        useState(null);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState("");

    const [exportState, setExportState] =
        useState({ running: false, message: "", error: "" });


    const load = useCallback(async (currentRange) => {

        const [
            summary,
            weekly,
            hourly,
            bySeverity,
            byType,
            stations,
            trucks,
            hotspots,
            exports
        ] = await Promise.all([
            getAnalytics("summary", currentRange),
            getAnalytics("trends", { ...currentRange, interval: "week" }),
            getAnalytics("hourly", currentRange),
            getAnalytics("response-times", { ...currentRange, group_by: "severity" }),
            getAnalytics("response-times", { ...currentRange, group_by: "incident_type" }),
            getAnalytics("stations", currentRange),
            getAnalytics("trucks", currentRange),
            getAnalytics("hotspots", { ...currentRange, cell_km: 1 }),
            getAnalytics("exports")
        ]);

        return {
            summary,
            weekly,
            hourly,
            bySeverity,
            byType,
            stations,
            trucks,
            hotspots,
            exports
        };
    }, []);


    useEffect(() => {

        let ignore = false;

        setLoading(true);
        setError("");

        load(range)
            .then((result) => {
                if (!ignore) {
                    setData(result);
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

    }, [range, load]);


    const choosePreset = (item) => {
        setPreset(item.id);
        setRange(item.range());
    };


    const setCustomDate = (field, value) => {
        setPreset("custom");
        setRange((current) => ({ ...current, [field]: value }));
    };


    const runExport = async () => {

        setExportState({ running: true, message: "", error: "" });

        try {

            const result = await exportHistory(range);

            setExportState({
                running: false,
                message: `${result.message}: ${Object.entries(result.totals)
                    .map(([dataset, rows]) => `${rows} ${dataset} rows`)
                    .join(", ") || "nothing new"}`,
                error: ""
            });

            const exports = await getAnalytics("exports");

            setData((current) => ({ ...current, exports }));

        } catch (err) {

            setExportState({ running: false, message: "", error: err.message });
        }
    };


    const filters = (
        <div className="analytics-filters">

            <div className="preset-group" role="group" aria-label="Date range">
                {PRESETS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={preset === item.id ? "active" : ""}
                        onClick={() => choosePreset(item)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <label>
                From
                <input
                    type="date"
                    value={range.from}
                    onChange={(e) => setCustomDate("from", e.target.value)}
                />
            </label>

            <label>
                To
                <input
                    type="date"
                    value={range.to}
                    onChange={(e) => setCustomDate("to", e.target.value)}
                />
            </label>

            {loading && <span className="analytics-loading">Loading…</span>}

        </div>
    );


    if (error) {
        return (
            <div className="analytics">
                {filters}
                <div className="form-error">{error}</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="analytics">
                {filters}
                <div className="loading">Loading analytics…</div>
            </div>
        );
    }


    const { summary } = data;
    const response = summary.response;

    const severityGroups = [...data.bySeverity.groups].sort(
        (a, b) =>
            SEVERITY_ORDER.indexOf(a.group_key) -
            SEVERITY_ORDER.indexOf(b.group_key)
    );

    const maxHotspot = Math.max(
        ...data.hotspots.hotspots.map((h) => h.incidents),
        1
    );

    const topTrucks = data.trucks.trucks
        .filter((t) => t.dispatches > 0)
        .slice(0, 10);

    const maxUtilization = Math.max(
        ...topTrucks.map((t) => t.utilization_pct),
        0.01
    );


    return (
        <div className="analytics">

            {filters}


            <div className="kpi-row">

                <StatTile
                    label="INCIDENTS"
                    value={summary.incidents.total.toLocaleString()}
                    note={`${summary.incidents.by_status.RESOLVED || 0} resolved`}
                />

                <StatTile
                    label="DISPATCHES"
                    value={summary.dispatches.total.toLocaleString()}
                    note={`${summary.dispatches.completed} completed · ${summary.dispatches.cancelled} recalled`}
                />

                <StatTile
                    label="MEDIAN RESPONSE"
                    value={fmtMin(response.median_response_min)}
                    note="report → first truck on scene"
                />

                <StatTile
                    label="90% ARRIVE WITHIN"
                    value={fmtMin(response.p90_response_min)}
                    note={`median dispatch delay ${fmtMin(response.median_dispatch_delay_min)}`}
                />

                <StatTile
                    label="ETA WITHIN ±2 MIN"
                    value={
                        response.eta_within_2_min_pct === null
                            ? "–"
                            : `${response.eta_within_2_min_pct}%`
                    }
                    note={`avg error ${response.avg_eta_error_min > 0 ? "+" : ""}${fmtMin(response.avg_eta_error_min)}`}
                />

            </div>


            <div className="analytics-grid">

                <Panel
                    title="Incidents per week"
                    subtitle="Week starting (Monday)"
                >
                    <ColumnChart
                        title="Incidents per week"
                        valueLabel="Incidents"
                        labelEvery={Math.ceil(data.weekly.trends.length / 8)}
                        data={data.weekly.trends.map((t) => ({
                            label: t.period.slice(5),
                            title: `Week of ${t.period}`,
                            value: t.incidents,
                            tooltip: [
                                `Critical ${t.critical} · High ${t.high}`,
                                `Medium ${t.medium} · Low ${t.low}`
                            ]
                        }))}
                    />
                </Panel>


                <Panel
                    title="Incidents by hour of day"
                    subtitle="When fires are reported"
                >
                    <ColumnChart
                        title="Incidents by hour of day"
                        valueLabel="Incidents"
                        labelEvery={3}
                        data={data.hourly.hours.map((h) => ({
                            label: `${h.hour}`,
                            title: `${String(h.hour).padStart(2, "0")}:00 – ${String(h.hour).padStart(2, "0")}:59`,
                            value: h.incidents,
                            tooltip: [
                                `Avg response: ${fmtMin(h.avg_response_min)}`
                            ]
                        }))}
                    />
                </Panel>


                <Panel
                    title="Median response time by severity"
                    subtitle="Report → first truck on scene"
                >
                    <BarChart
                        title="Median response time by severity"
                        valueLabel="Median response"
                        labelWidth={110}
                        data={severityGroups.map((g) => ({
                            label: g.group_label,
                            value: g.median_response_min,
                            display: fmtMin(g.median_response_min),
                            tooltip: [
                                `90th percentile: ${fmtMin(g.p90_response_min)}`,
                                `Avg travel: ${fmtMin(g.avg_travel_min)}`,
                                `${g.incidents} incidents`
                            ]
                        }))}
                    />
                </Panel>


                <Panel
                    title="Median response time by incident type"
                    subtitle="Report → first truck on scene"
                >
                    <BarChart
                        title="Median response time by incident type"
                        valueLabel="Median response"
                        labelWidth={140}
                        data={data.byType.groups.map((g) => ({
                            label: g.group_label,
                            value: g.median_response_min,
                            display: fmtMin(g.median_response_min),
                            tooltip: [
                                `90th percentile: ${fmtMin(g.p90_response_min)}`,
                                `${g.incidents} incidents`
                            ]
                        }))}
                    />
                </Panel>


                <Panel
                    title="Busiest stations"
                    subtitle="Dispatches sent, top 10"
                >
                    <BarChart
                        title="Busiest stations by dispatches"
                        valueLabel="Dispatches"
                        labelWidth={170}
                        data={data.stations.stations
                            .filter((s) => s.dispatches > 0)
                            .slice(0, 10)
                            .map((s) => ({
                                label: s.fire_station_name,
                                title: `${s.fire_station_name} (${s.station_id})`,
                                value: s.dispatches,
                                display: `${s.dispatches} · ${s.share_pct}%`,
                                tooltip: [
                                    `${s.incidents} incidents`,
                                    `Busy ${s.busy_hours} h`,
                                    `Avg travel ${fmtMin(s.avg_travel_min)}`
                                ]
                            }))}
                    />
                </Panel>


                <Panel
                    title="Most used trucks"
                    subtitle="Share of the period spent on dispatches, top 10"
                >
                    <div className="table-scroll">
                    <table className="analytics-table">
                        <thead>
                            <tr>
                                <th>Truck</th>
                                <th>Station</th>
                                <th className="num">Dispatches</th>
                                <th className="num">Busy</th>
                                <th>Utilization</th>
                            </tr>
                        </thead>

                        <tbody>
                            {topTrucks.map((t) => (
                                <tr key={t.truck_id}>
                                    <td>
                                        <strong>{t.truck_id}</strong>
                                        <small>{t.truck_type}</small>
                                    </td>
                                    <td>{t.fire_station_name}</td>
                                    <td className="num">{t.dispatches}</td>
                                    <td className="num">{t.busy_hours} h</td>
                                    <td>
                                        <div className="inline-bar">
                                            <span
                                                style={{
                                                    width: `${(t.utilization_pct / maxUtilization) * 100}%`
                                                }}
                                            />
                                            <em>{t.utilization_pct}%</em>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </Panel>


                <Panel
                    wide
                    title="Incident hotspots"
                    subtitle="Incidents grouped on a 1 km grid — larger circle, more incidents"
                >
                    <div className="hotspot-map">
                        <MapContainer
                            center={CHENNAI_CENTER}
                            zoom={11}
                            scrollWheelZoom={false}
                            className="main-map"
                        >
                            <TileLayer
                                attribution="&copy; OpenStreetMap contributors"
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            {data.hotspots.hotspots.map((h) => (
                                <CircleMarker
                                    key={`${h.latitude},${h.longitude}`}
                                    center={[h.latitude, h.longitude]}
                                    radius={5 + 17 * Math.sqrt(h.incidents / maxHotspot)}
                                    pathOptions={{
                                        color: "#ffffff",
                                        weight: 2,
                                        fillColor: "#2a78d6",
                                        fillOpacity: 0.55
                                    }}
                                >
                                    <MapTooltip>
                                        <strong>{h.incidents} incidents</strong>
                                        <br />
                                        {h.serious} high / critical
                                        <br />
                                        Most common: {h.top_incident_type}
                                    </MapTooltip>
                                </CircleMarker>
                            ))}
                        </MapContainer>
                    </div>
                </Panel>


                <Panel
                    wide
                    title="Export to data lake (HDFS / Hive)"
                    subtitle={`Storage: ${data.exports.storage} — ${data.exports.location}`}
                >
                    <div className="export-row">

                        <button
                            type="button"
                            className="report-button export-button"
                            disabled={exportState.running}
                            onClick={runExport}
                        >
                            {exportState.running
                                ? "EXPORTING..."
                                : "EXPORT SELECTED PERIOD"}
                        </button>

                        <span>
                            Writes incidents, dispatch facts and new GPS
                            points as Hive-ready partitions (dt=YYYY-MM-DD).
                        </span>

                    </div>

                    {exportState.message && (
                        <div className="export-message">{exportState.message}</div>
                    )}

                    {exportState.error && (
                        <div className="form-error">{exportState.error}</div>
                    )}

                    {data.exports.runs.length > 0 && (
                        <div className="table-scroll">
                        <table className="analytics-table">
                            <thead>
                                <tr>
                                    <th>Export run</th>
                                    <th>Finished</th>
                                    <th>Storage</th>
                                    <th className="num">Files</th>
                                    <th className="num">Incidents</th>
                                    <th className="num">Dispatches</th>
                                    <th className="num">GPS points</th>
                                </tr>
                            </thead>

                            <tbody>
                                {data.exports.runs.map((run) => (
                                    <tr key={run.run_id}>
                                        <td>{run.run_id}</td>
                                        <td>{fmtTime(run.finished_at)}</td>
                                        <td>{run.storage}</td>
                                        <td className="num">{run.files}</td>
                                        <td className="num">{run.incident_rows}</td>
                                        <td className="num">{run.dispatch_rows}</td>
                                        <td className="num">{run.gps_rows}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    )}
                </Panel>

            </div>

        </div>
    );
}
