// ui/runtime.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
export const { useState, useEffect, useMemo, useRef } = React;

export const _RC = window.Recharts || window.recharts || {};

export const { BarChart, ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip: RTooltip } = _RC;

export const RBar = _RC.Bar;

