import { useEffect, useRef, useState } from "react";


// ============================================================
// Small SVG charts for the Module 5 analytics page.
//
// Specs: bars <= 24px thick with a 4px rounded data-end and a
// square baseline, 2px surface gap between touching bars, 1px
// recessive gridlines, hover tooltip per bar, and a visually
// hidden table so every value is available without the chart.
// ============================================================

const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;


// Draw at the container's real pixel width so text stays
// readable on small screens instead of being scaled down
function useWidth(fallback = 640) {
    const ref = useRef(null);
    const [width, setWidth] = useState(fallback);

    useEffect(() => {
        const element = ref.current;

        if (!element) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            setWidth(Math.max(Math.round(entry.contentRect.width), 240));
        });

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return [ref, width];
}


// Clean axis maximum and 4 tick steps (0, 5, 10, 15, 20 ...)
function niceScale(max) {
    if (!(max > 0)) {
        return { top: 1, ticks: [0, 1] };
    }

    const rough = max / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10]
        .map((m) => m * magnitude)
        .find((s) => s >= rough);

    const top = Math.ceil(max / step) * step;

    const ticks = [];

    for (let t = 0; t <= top + step / 2; t += step) {
        ticks.push(Math.round(t * 100) / 100);
    }

    return { top, ticks };
}


// Vertical bar with rounded top, square at the baseline
function columnPath(x, y, width, height) {
    const r = Math.min(RADIUS, width / 2, height);

    return (
        `M${x},${y + height}` +
        `V${y + r}` +
        `Q${x},${y} ${x + r},${y}` +
        `H${x + width - r}` +
        `Q${x + width},${y} ${x + width},${y + r}` +
        `V${y + height}Z`
    );
}


// Horizontal bar with rounded right end, square at the baseline
function barPath(x, y, width, height) {
    const r = Math.min(RADIUS, height / 2, width);

    return (
        `M${x},${y}` +
        `H${x + width - r}` +
        `Q${x + width},${y} ${x + width},${y + r}` +
        `V${y + height - r}` +
        `Q${x + width},${y + height} ${x + width - r},${y + height}` +
        `H${x}Z`
    );
}


function Tooltip({ tip }) {
    if (!tip) {
        return null;
    }

    return (
        <div
            className="chart-tooltip"
            style={{ left: tip.x, top: tip.y }}
            role="status"
        >
            <strong>{tip.title}</strong>

            {tip.lines.map((line) => (
                <span key={line}>{line}</span>
            ))}
        </div>
    );
}


function HiddenTable({ caption, columns, rows }) {
    return (
        <table className="sr-only">
            <caption>{caption}</caption>

            <thead>
                <tr>
                    {columns.map((c) => <th key={c}>{c}</th>)}
                </tr>
            </thead>

            <tbody>
                {rows.map((row, i) => (
                    <tr key={i}>
                        {row.map((cell, j) => <td key={j}>{cell}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}


// Vertical column chart for one series.
// data: [{ label, value, tooltip: [lines] }]
export function ColumnChart({
    title,
    data,
    valueLabel,
    height = 200,
    labelEvery = 1
}) {
    const [tip, setTip] = useState(null);
    const [ref, width] = useWidth();

    const margin = { top: 12, right: 8, bottom: 26, left: 36 };

    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const { top, ticks } = niceScale(
        Math.max(...data.map((d) => d.value), 0)
    );

    const band = plotW / Math.max(data.length, 1);
    const barW = Math.max(Math.min(BAR_MAX, band - GAP), 1);

    // Thin out axis labels when columns get narrow
    const every = Math.max(labelEvery, Math.ceil(30 / band));

    const y = (v) => margin.top + plotH - (v / top) * plotH;


    return (
        <div
            className="chart"
            ref={ref}
            onMouseLeave={() => setTip(null)}
        >

            <svg
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={title}
            >
                {ticks.map((t) => (
                    <g key={t}>
                        <line
                            className="chart-grid"
                            x1={margin.left}
                            x2={width - margin.right}
                            y1={y(t)}
                            y2={y(t)}
                        />

                        <text
                            className="chart-axis"
                            x={margin.left - 6}
                            y={y(t)}
                            textAnchor="end"
                            dominantBaseline="middle"
                        >
                            {t.toLocaleString()}
                        </text>
                    </g>
                ))}


                {data.map((d, i) => {
                    const x = margin.left + i * band + (band - barW) / 2;
                    const h = (d.value / top) * plotH;

                    return (
                        <g key={d.label}>
                            {h > 0 && (
                                <path
                                    className="chart-bar"
                                    d={columnPath(x, y(d.value), barW, h)}
                                />
                            )}

                            {i % every === 0 && (
                                <text
                                    className="chart-axis"
                                    x={x + barW / 2}
                                    y={height - 8}
                                    textAnchor="middle"
                                >
                                    {d.label}
                                </text>
                            )}

                            {/* Hit target: the whole band, taller than the bar */}
                            <rect
                                className="chart-hit"
                                x={margin.left + i * band}
                                y={margin.top}
                                width={band}
                                height={plotH}
                                onMouseEnter={() =>
                                    setTip({
                                        x: `${((x + barW / 2) / width) * 100}%`,
                                        y: `${(y(d.value) / height) * 100}%`,
                                        title: d.title || d.label,
                                        lines: [
                                            `${valueLabel}: ${d.value.toLocaleString()}`,
                                            ...(d.tooltip || [])
                                        ]
                                    })
                                }
                            />
                        </g>
                    );
                })}
            </svg>

            <Tooltip tip={tip} />

            <HiddenTable
                caption={title}
                columns={["", valueLabel]}
                rows={data.map((d) => [d.title || d.label, d.value])}
            />

        </div>
    );
}


// Horizontal bar chart for one series, value at the bar tip.
// data: [{ label, value, display, tooltip: [lines] }]
export function BarChart({ title, data, valueLabel, labelWidth: preferredLabelWidth = 150 }) {
    const [tip, setTip] = useState(null);
    const [ref, width] = useWidth();

    // Labels never take more than 40% of the chart
    const labelWidth = Math.min(preferredLabelWidth, Math.round(width * 0.4));
    const rowH = 30;
    const barH = 16;
    const valueRoom = 64;

    const height = data.length * rowH + 4;
    const plotW = width - labelWidth - valueRoom;

    const max = Math.max(...data.map((d) => d.value), 0) || 1;


    return (
        <div
            className="chart"
            ref={ref}
            onMouseLeave={() => setTip(null)}
        >

            <svg
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={title}
            >
                <line
                    className="chart-grid"
                    x1={labelWidth}
                    x2={labelWidth}
                    y1={0}
                    y2={height}
                />

                {data.map((d, i) => {
                    const rowY = i * rowH;
                    const barY = rowY + (rowH - barH) / 2;
                    const w = (d.value / max) * plotW;

                    return (
                        <g key={d.label}>
                            <text
                                className="chart-label"
                                x={labelWidth - 8}
                                y={rowY + rowH / 2}
                                textAnchor="end"
                                dominantBaseline="middle"
                            >
                                {d.label}
                            </text>

                            {w > 0 && (
                                <path
                                    className="chart-bar"
                                    d={barPath(labelWidth, barY, w, barH)}
                                />
                            )}

                            <text
                                className="chart-value"
                                x={labelWidth + w + 6}
                                y={rowY + rowH / 2}
                                dominantBaseline="middle"
                            >
                                {d.display ?? d.value.toLocaleString()}
                            </text>

                            <rect
                                className="chart-hit"
                                x={0}
                                y={rowY}
                                width={width}
                                height={rowH}
                                onMouseEnter={() =>
                                    setTip({
                                        x: `${((labelWidth + w / 2) / width) * 100}%`,
                                        y: `${(barY / height) * 100}%`,
                                        title: d.title || d.label,
                                        lines: [
                                            `${valueLabel}: ${d.display ?? d.value}`,
                                            ...(d.tooltip || [])
                                        ]
                                    })
                                }
                            />
                        </g>
                    );
                })}
            </svg>

            <Tooltip tip={tip} />

            <HiddenTable
                caption={title}
                columns={["", valueLabel]}
                rows={data.map((d) => [d.title || d.label, d.display ?? d.value])}
            />

        </div>
    );
}
