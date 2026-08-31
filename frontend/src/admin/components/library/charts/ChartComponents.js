import React, { useEffect, useRef, useState } from "react";

import InlineError from "../feedback/InlineError";
import RetryBlock from "../feedback/RetryBlock";
import { ChartSkeleton } from "../feedback/skeletons";
import { exportSvgAsPng } from "../utils/exportUtils";

export default function ChartShell({
  title,
  subtitle,
  loading,
  error,
  empty,
  emptyLabel = "No chart data",
  onRefresh,
  onExportImage,
  children,
  className = "",
  chartRef,
}) {
  const localRef = useRef(null);
  const ref = chartRef || localRef;

  if (loading) {
    return (
      <section className={`admin-chart-shell ${className}`.trim()} aria-busy="true">
        {title ? <h3 className="admin-chart-shell__title">{title}</h3> : null}
        <ChartSkeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section className={`admin-chart-shell admin-chart-shell--error ${className}`.trim()}>
        {title ? <h3 className="admin-chart-shell__title">{title}</h3> : null}
        <InlineError message={error} />
        {onRefresh ? <RetryBlock onRetry={onRefresh} /> : null}
      </section>
    );
  }

  if (empty) {
    return (
      <section className={`admin-chart-shell admin-chart-shell--empty ${className}`.trim()}>
        {title ? <h3 className="admin-chart-shell__title">{title}</h3> : null}
        <p className="admin-chart-shell__empty">{emptyLabel}</p>
      </section>
    );
  }

  const handleExport = () => {
    if (onExportImage) {
      onExportImage();
      return;
    }
    const svg = ref.current?.querySelector("svg");
    if (svg) exportSvgAsPng(svg, `${title || "chart"}.png`);
  };

  return (
    <section className={`admin-chart-shell ${className}`.trim()}>
      <div className="admin-chart-shell__head">
        <div>
          {title ? <h3 className="admin-chart-shell__title">{title}</h3> : null}
          {subtitle ? <p className="admin-chart-shell__subtitle">{subtitle}</p> : null}
        </div>
        <div className="admin-chart-shell__actions">
          {onRefresh ? (
            <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onRefresh} aria-label="Refresh chart">
              ↻
            </button>
          ) : null}
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={handleExport} aria-label="Export chart image">
            ⬇
          </button>
        </div>
      </div>
      <div className="admin-chart-shell__body" ref={ref}>
        {children}
      </div>
    </section>
  );
}

export function useResponsiveChartWidth(defaultWidth = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    if (!ref.current || !window.ResizeObserver) return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width;
      if (next) setWidth(Math.max(280, Math.floor(next)));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function buildSeriesGeometry(data, width, height, padding = 24) {
  const values = data.map((d) => Number(d.value) || 0);
  const max = Math.max(...values, 1);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const step = innerW / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => {
    const x = padding + i * step;
    const y = padding + innerH - (Number(d.value) / max) * innerH;
    return { x, y, raw: d };
  });
  return { points, max };
}

export function LineChartBody({ data = [], width = 640, height = 280, color = "var(--admin-accent)" }) {
  const { points } = buildSeriesGeometry(data, width, height);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart">
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  );
}

export function AreaChartBody({ data = [], width = 640, height = 280, color = "var(--admin-accent)" }) {
  const { points } = buildSeriesGeometry(data, width, height);
  const baseline = height - 24;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1]?.x || 0},${baseline} L${points[0]?.x || 0},${baseline} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Area chart">
      <path d={area} fill={color} opacity="0.25" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

export function BarChartBody({ data = [], width = 640, height = 280, colors }) {
  const values = data.map((d) => Number(d.value) || 0);
  const max = Math.max(...values, 1);
  const padding = 24;
  const barGap = 8;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const barW = innerW / Math.max(data.length, 1) - barGap;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const h = (Number(d.value) / max) * innerH;
        const x = padding + i * (barW + barGap);
        const y = padding + innerH - h;
        const fill = colors?.[i] || "var(--admin-accent)";
        return <rect key={d.label || i} x={x} y={y} width={barW} height={h} rx="4" fill={fill} />;
      })}
    </svg>
  );
}

export function PieChartBody({ data = [], width = 280, height = 280, innerRadius = 0, colors }) {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0) || 1;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 8;
  let cursor = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = ((Number(d.value) || 0) / total) * Math.PI * 2;
    const x1 = cx + radius * Math.cos(cursor);
    const y1 = cy + radius * Math.sin(cursor);
    cursor += angle;
    const x2 = cx + radius * Math.cos(cursor);
    const y2 = cy + radius * Math.sin(cursor);
    const large = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
    return { path, fill: colors?.[i] || "var(--admin-accent)", label: d.label };
  });

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={innerRadius ? "Donut chart" : "Pie chart"}>
      {slices.map((slice, i) => (
        <path key={slice.label || i} d={slice.path} fill={slice.fill} opacity="0.9" />
      ))}
      {innerRadius ? <circle cx={cx} cy={cy} r={innerRadius} fill="var(--admin-panel)" /> : null}
    </svg>
  );
}

export function HeatmapChartBody({ matrix = [], width = 640, height = 280 }) {
  const rows = matrix.length || 1;
  const cols = matrix[0]?.length || 1;
  const cellW = (width - 32) / cols;
  const cellH = (height - 32) / rows;
  const flat = matrix.flat().map(Number);
  const max = Math.max(...flat, 1);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Heatmap">
      {matrix.map((row, r) =>
        row.map((value, c) => {
          const intensity = Number(value) / max;
          return (
            <rect
              key={`${r}-${c}`}
              x={16 + c * cellW}
              y={16 + r * cellH}
              width={cellW - 2}
              height={cellH - 2}
              rx="3"
              fill={`rgba(0, 166, 81, ${0.15 + intensity * 0.85})`}
            />
          );
        })
      )}
    </svg>
  );
}

export function LineChart(props) {
  const { ref, width } = useResponsiveChartWidth();
  const height = Math.round(width / 2.2);
  return (
    <ChartShell {...props} chartRef={ref}>
      <LineChartBody data={props.data} width={width} height={height} color={props.color} />
    </ChartShell>
  );
}

export function BarChart(props) {
  const { ref, width } = useResponsiveChartWidth();
  const height = Math.round(width / 2.2);
  return (
    <ChartShell {...props} chartRef={ref}>
      <BarChartBody data={props.data} width={width} height={height} colors={props.colors} />
    </ChartShell>
  );
}

export function AreaChart(props) {
  const { ref, width } = useResponsiveChartWidth();
  const height = Math.round(width / 2.2);
  return (
    <ChartShell {...props} chartRef={ref}>
      <AreaChartBody data={props.data} width={width} height={height} color={props.color} />
    </ChartShell>
  );
}

export function PieChart(props) {
  return (
    <ChartShell {...props}>
      <PieChartBody data={props.data} colors={props.colors} />
    </ChartShell>
  );
}

export function DonutChart(props) {
  return (
    <ChartShell {...props}>
      <PieChartBody data={props.data} colors={props.colors} innerRadius={52} />
    </ChartShell>
  );
}

export function HeatmapChart(props) {
  const { ref, width } = useResponsiveChartWidth();
  const height = Math.round(width / 2.2);
  return (
    <ChartShell {...props} chartRef={ref}>
      <HeatmapChartBody matrix={props.matrix} width={width} height={height} />
    </ChartShell>
  );
}

export function TimeSeriesChart(props) {
  return <LineChart {...props} subtitle={props.subtitle || "Time series"} />;
}
