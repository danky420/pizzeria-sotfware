import { useId, useState } from "react";

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
  tooltipLabel?: string;
}

/**
 * Positions are percentages of the viewBox, not pixels: the SVG scales with the
 * card, so a pixel offset captured at render time would drift as soon as the
 * window is resized.
 */
interface Hover {
  x: number;
  y: number;
  label: string;
  value: string;
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/** Rounded at the data end, square at the baseline — the bar grows out of the axis. */
function columnPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    "Z"
  ].join(" ");
}

function barPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, height / 2, width));
  return [
    `M ${x} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height - r}`,
    `Q ${x + width} ${y + height} ${x + width - r} ${y + height}`,
    `L ${x} ${y + height}`,
    "Z"
  ].join(" ");
}

function Tooltip({ hover }: { hover: Hover | null }) {
  if (!hover) return null;
  return (
    <div className="viz-tooltip" style={{ left: `${hover.x}%`, top: `${hover.y}%` }} role="status">
      <span className="viz-tooltip-value">{hover.value}</span>
      <span className="viz-tooltip-label">{hover.label}</span>
    </div>
  );
}

export function ColumnChart({
  points,
  format,
  emptyLabel = "Sin datos en el rango"
}: {
  points: ChartPoint[];
  format: (value: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const titleId = useId();

  if (points.length === 0) return <p className="muted">{emptyLabel}</p>;

  const width = 720;
  const height = 240;
  const padding = { top: 16, right: 12, bottom: 28, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = niceCeil(Math.max(...points.map((point) => point.value)));
  const band = plotWidth / points.length;
  // The 2px surface gap is what separates neighbouring columns; 24px is the cap,
  // and the band's leftover stays as air rather than being filled.
  const barWidth = Math.max(2, Math.min(24, band - 2));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => max * ratio);

  const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]!);

  return (
    <div className="viz-frame">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="viz-svg"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>Ingresos por día</title>

        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / max) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="viz-grid"
                vectorEffect="non-scaling-stroke"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="viz-axis-text">
                {format(tick)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const barHeight = max === 0 ? 0 : (point.value / max) * plotHeight;
          const x = padding.left + index * band + (band - barWidth) / 2;
          const y = padding.top + plotHeight - barHeight;
          const show = () =>
            setHover({
              x: ((x + barWidth / 2) / width) * 100,
              y: (y / height) * 100,
              label: point.tooltipLabel ?? point.label,
              value: format(point.value)
            });

          return (
            <g key={point.key}>
              {barHeight > 0 ? (
                <path d={columnPath(x, y, barWidth, barHeight, 4)} className="viz-mark" />
              ) : null}
              <rect
                x={padding.left + index * band}
                y={padding.top}
                width={band}
                height={plotHeight}
                fill="transparent"
                tabIndex={0}
                className="viz-hit"
                onPointerEnter={show}
                onFocus={show}
                onPointerLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
              >
                <title>{`${point.tooltipLabel ?? point.label}: ${format(point.value)}`}</title>
              </rect>
            </g>
          );
        })}

        {points.map((point, index) => {
          // Label the extreme and the two ends only — a number on every column
          // is noise, and the axis already carries the rest.
          const isEdge = index === 0 || index === points.length - 1;
          if (!isEdge && point.key !== peak.key) return null;
          const x = padding.left + index * band + band / 2;
          return (
            <text key={point.key} x={x} y={height - 10} textAnchor="middle" className="viz-axis-text">
              {point.label}
            </text>
          );
        })}
      </svg>
      <Tooltip hover={hover} />
    </div>
  );
}

export function HorizontalBarChart({
  points,
  format,
  emptyLabel = "Sin datos en el rango"
}: {
  points: ChartPoint[];
  format: (value: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const titleId = useId();

  if (points.length === 0) return <p className="muted">{emptyLabel}</p>;

  const rowHeight = 30;
  const width = 720;
  const padding = { top: 8, right: 96, bottom: 8, left: 176 };
  const height = padding.top + padding.bottom + points.length * rowHeight;
  const plotWidth = width - padding.left - padding.right;
  const max = Math.max(...points.map((point) => point.value), 1);
  const barHeight = Math.min(24, rowHeight - 6);

  return (
    <div className="viz-frame">
      <svg viewBox={`0 0 ${width} ${height}`} className="viz-svg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Productos más vendidos</title>

        {points.map((point, index) => {
          const barWidth = (point.value / max) * plotWidth;
          const y = padding.top + index * rowHeight + (rowHeight - barHeight) / 2;
          const show = () =>
            setHover({
              x: ((padding.left + barWidth) / width) * 100,
              y: (y / height) * 100,
              label: point.tooltipLabel ?? point.label,
              value: format(point.value)
            });

          return (
            <g key={point.key}>
              <text x={padding.left - 12} y={y + barHeight / 2 + 4} textAnchor="end" className="viz-row-label">
                {point.label}
              </text>
              {barWidth > 0 ? (
                <path d={barPath(padding.left, y, barWidth, barHeight, 4)} className="viz-mark" />
              ) : null}
              <text
                x={padding.left + barWidth + 8}
                y={y + barHeight / 2 + 4}
                className="viz-value-label"
              >
                {format(point.value)}
              </text>
              <rect
                x={padding.left}
                y={padding.top + index * rowHeight}
                width={plotWidth}
                height={rowHeight}
                fill="transparent"
                tabIndex={0}
                className="viz-hit"
                onPointerEnter={show}
                onFocus={show}
                onPointerLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
              >
                <title>{`${point.tooltipLabel ?? point.label}: ${format(point.value)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <Tooltip hover={hover} />
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  hero
}: {
  label: string;
  value: string;
  hint?: string;
  hero?: boolean;
}) {
  return (
    <div className={hero ? "stat-tile stat-tile-hero" : "stat-tile"}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}
