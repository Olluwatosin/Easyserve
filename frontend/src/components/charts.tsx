"use client";

/**
 * Charts for the owner's analytics.
 *
 * Every chart here plots one series, which settles most of the design: no
 * legend (the heading names it), one colour for every mark, and no second axis.
 *
 * The fill is #00A88F — the app's teal-dim token, not the brighter #00D4B4.
 * Validated against the dark card surface: the brand teal sits at L 0.778, well
 * outside the dark-mode band, and glares as a large fill even though it is fine
 * as an accent on text and buttons.
 *
 * Deliberately NOT doing: shading bars darker-where-bigger. Menu items and staff
 * have no natural order, so a value ramp would spend the only free channel
 * re-encoding the bar length the reader can already see.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Validated single-series fill for the dark chart surface. */
export const SERIES = "#00A88F";
const GRID = "#1E2D42";
const AXIS_INK = "#6B7A99";
const SURFACE = "#0F1923";

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS_INK, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
} as const;

function TipShell({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: SURFACE,
        border: `1px solid ${GRID}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>
        {title}
      </p>
      {rows.map((r) => (
        <p key={r.label} style={{ color: "var(--text-soft)" }}>
          {r.label}{" "}
          <span className="font-semibold tabular-nums" style={{ color: SERIES }}>
            {r.value}
          </span>
        </p>
      ))}
    </div>
  );
}

/** 24-hour clock, so "quiet at 9pm" is visible rather than merely absent. */
export function PeakHoursChart({
  data,
}: {
  data: { hour: number; order_count: number }[];
}) {
  const byHour = new Map(data.map((d) => [d.hour, d.order_count]));
  const full = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    orders: byHour.get(h) ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={full} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="peakFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.45} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        {/* Horizontal only: vertical rules on a 24-hour axis are visual noise. */}
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          {...axisProps}
          dataKey="hour"
          interval={2}
          tickFormatter={(h: number) =>
            h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`
          }
        />
        <YAxis {...axisProps} allowDecimals={false} width={34} />
        <Tooltip
          cursor={{ stroke: SERIES, strokeOpacity: 0.35 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipShell
                title={`${Number(label) % 12 || 12}${Number(label) < 12 ? "am" : "pm"}`}
                rows={[{ label: "Orders", value: String(payload[0].value) }]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="orders"
          stroke={SERIES}
          strokeWidth={2}
          fill="url(#peakFill)"
          activeDot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal, because item names are long and would otherwise be rotated. */
export function TopItemsChart({
  data,
  valueKey = "revenue",
  formatValue,
}: {
  data: { name: string; revenue?: number; order_count?: number }[];
  valueKey?: "revenue" | "order_count";
  formatValue: (v: number) => string;
}) {
  const rows = data.slice(0, 8).map((d) => ({
    name: d.name.length > 22 ? `${d.name.slice(0, 21)}…` : d.name,
    fullName: d.name,
    value: Number(d[valueKey] ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        barCategoryGap={6}
      >
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis {...axisProps} type="number" tickFormatter={formatValue} />
        <YAxis {...axisProps} type="category" dataKey="name" width={130} />
        <Tooltip
          cursor={{ fill: SERIES, fillOpacity: 0.07 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipShell
                title={payload[0].payload.fullName}
                rows={[
                  {
                    label: valueKey === "revenue" ? "Revenue" : "Sold",
                    value: formatValue(Number(payload[0].value)),
                  },
                ]}
              />
            ) : null
          }
        />
        {/* radius on the value end only, so bars stay anchored to the baseline */}
        <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={18}>
          {rows.map((r) => (
            // One series, one colour. Cells exist only to give each bar a 2px
            // surface ring so adjacent fills do not merge.
            <Cell key={r.fullName} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
