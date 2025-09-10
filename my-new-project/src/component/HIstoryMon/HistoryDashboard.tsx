import React, { useEffect, useMemo, useRef, useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toggle } from "@/components/ui/toggle";
import { Line } from "react-chartjs-2";
import { SquarePlus } from "lucide-react";
import { Chart as ChartJS, Filler, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip } from "chart.js";
import { v4 as uuidv4 } from "uuid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

ChartJS.register(Filler, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip);

// ----------------------
// color helpers
// ----------------------
const PALETTE = [
  "rgb(99,102,241)", // indigo
  "rgb(16,185,129)", // emerald
  "rgb(59,130,246)", // blue
  "rgb(244,114,182)", // pink
  "rgb(234,179,8)", // amber
  "rgb(239,68,68)", // red
  "rgb(168,85,247)", // purple
  "rgb(20,184,166)", // teal
];
const hashStr = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
};
const colorForKey = (key: string) => PALETTE[hashStr(key) % PALETTE.length];
const rgba = (rgb: string, a = 0.18) => rgb.replace("rgb", "rgba").replace(")", `,${a})`);
const alignToLabels = <T extends number | null>(labels: (string | number)[], arr: T[]) => {
  const L = labels.length;
  const out = arr.slice(0, L);
  while (out.length < L) out.push(null as T);
  return out;
};

// ----------------------
// types
// ----------------------
interface CellRow {
  cell_id: string;
  charge_policy: string;
  cycle_life?: number | null;
}
interface SummaryRow {
  cycle_index: number;
  ir?: number | null;
  q_charge?: number | null;
  q_discharge?: number | null;
  tavg?: number | null;
  tmin?: number | null;
  tmax?: number | null;
  chargetime?: number | null;
  [k: string]: number | string | null | undefined;
}

type Density = "comfortable" | "cozy" | "compact";

const HistoryDashboard: React.FC = () => {
  // Root ref to detect the actual document/window when rendered in a popup
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Chart refs to call resize() imperatively
  const summaryChartRef = useRef<any>(null);
  const tsChart1Ref = useRef<any>(null);
  const tsChart2Ref = useRef<any>(null);
  // THEME
  const [dark, setDark] = useState<boolean>(() =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // DATA
  const [cellData, setCellData] = useState<CellRow[]>([]);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryRow[]>([]);
  // Level 3: per-cycle timeseries
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [tsData, setTsData] = useState<any[]>([]);
  const [loadingTs, setLoadingTs] = useState(false);
  const [tsMetrics, setTsMetrics] = useState<string[]>([]);
  const [tsSelectedMetrics, setTsSelectedMetrics] = useState<string[]>([]);
  const [tsUnits, setTsUnits] = useState<Record<string, string>>({});
  const [tsXKey, setTsXKey] = useState<string | null>(null);
  const [tsRange, setTsRange] = useState<[number, number] | null>(null); // [startIdx, endIdx]
  // Second chart support
  const [tsChartCount, setTsChartCount] = useState<1 | 2>(1);
  const [tsSelectedMetrics2, setTsSelectedMetrics2] = useState<string[]>([]);
  const [tsRange2, setTsRange2] = useState<[number, number] | null>(null);

  // UI state
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["ir"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"cell_id" | "ai_mode">("cell_id");
  const [aiResults, setAiResults] = useState<{ html?: string } | null>(null);
  const [loadingCells, setLoadingCells] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [multiAxis, setMultiAxis] = useState(false);
  const [normalize, setNormalize] = useState(false);
  const [density, setDensity] = useState<Density>("compact");
  const [stickyFirstCol, setStickyFirstCol] = useState(true);
  const [showColumns, setShowColumns] = useState<Record<string, boolean>>({
    cell_id: true,
    charge_policy: true,
    cycle_life: true,
    actions: true,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  // Cells filter states
  const [filterCellId, setFilterCellId] = useState("");
  const [filterPolicy, setFilterPolicy] = useState("");
  const [filterCycleMin, setFilterCycleMin] = useState<string>("");
  const [filterCycleMax, setFilterCycleMax] = useState<string>("");

  const sessionIDRef = useRef(uuidv4());

  // ----------------------
  // Column resize state & handlers
  // ----------------------
  const RESIZE_MIN = 80;
  const RESIZE_MAX = 720;
  const [colWidths, setColWidths] = useState<{ cell_id: number; charge_policy: number; cycle_life: number; actions: number }>(
    { cell_id: 160, charge_policy: 360, cycle_life: 100, actions: 110 }
  );
  const resizingRef = useRef<{ key: keyof typeof colWidths; startX: number; startWidth: number } | null>(null);
  const onMouseMove = (e: MouseEvent) => {
    const r = resizingRef.current; if (!r) return;
    const dx = e.clientX - r.startX;
    const next = Math.min(RESIZE_MAX, Math.max(RESIZE_MIN, r.startWidth + dx));
    setColWidths((w) => ({ ...w, [r.key]: next }));
  };
  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    resizingRef.current = null;
  };
  const startResize = (key: keyof typeof colWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
  // helpers for size estimate
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const estimateWidth = (text: string, perChar = 7, pad = 28) => Math.ceil((text?.length || 0) * perChar + pad);

  // ----------------------
  // FETCH: cells
  // ----------------------
  useEffect(() => {
    let alive = true;
    setLoadingCells(true);
    fetch("http://127.0.0.1:5000/api/cells")
      .then((r) => r.json())
      .then((d) => alive && setCellData(Array.isArray(d) ? d : []))
      .catch(() => setErrorMsg("셀 목록을 불러오지 못했습니다."))
      .finally(() => {
        setLoadingCells(false);
        alive = false;
      });
    return () => {
      alive = false;
    };
  }, []);

  // ----------------------
  // ACTIONS
  // ----------------------
  const handleSearch = async () => {
    setErrorMsg(null);
    if (searchMode === "cell_id") {
      try {
        setLoadingCells(true);
        const r = await fetch(
          `http://127.0.0.1:5000/api/cells?search=${encodeURIComponent(searchQuery)}`
        );
        const d = await r.json();
        setCellData(Array.isArray(d) ? d : []);
        setPage(1);
      } catch {
        setErrorMsg("셀 검색에 실패했습니다.");
      } finally {
        setLoadingCells(false);
      }
    } else {
      try {
        setLoadingCells(true);
        const r = await fetch(`http://localhost:5678/webhook/start-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Session-ID": sessionIDRef.current },
          body: JSON.stringify({ query: searchQuery }),
        });
        const d = await r.json();
        setAiResults(d);
        const m = d?.html?.match(/<p><strong>Cell ID:<\/strong>\s*([\w-]+)<\/p>/);
        if (m?.[1]) {
          const cellId = m[1];
          await loadSummary(cellId);
          setSelectedCell(cellId);
        }
      } catch {
        setErrorMsg("AI Mode 검색에 실패했습니다.");
      } finally {
        setLoadingCells(false);
      }
    }
  };

  const loadSummary = async (cellId: string) => {
    setErrorMsg(null);
    setLoadingSummary(true);
    try {
      const r = await fetch(
        `http://127.0.0.1:5000/api/cycle_summaries?cell_id=${encodeURIComponent(cellId)}`
      );
      const d = await r.json();
      setSummaryData(Array.isArray(d) ? d : []);
      // reset cycle/ts on new cell selection
      setSelectedCycle(null);
      setTsData([]);
      setTsMetrics([]);
      setTsSelectedMetrics([]);
    } catch {
      setErrorMsg("요약 데이터를 불러오지 못했습니다.");
    } finally {
      setLoadingSummary(false);
    }
  };

  // Load timeseries for a specific cycle
  const loadTimeseries = async (cellId: string, cycleIndex: number) => {
    setErrorMsg(null);
    setLoadingTs(true);
    try {
      // Try primary endpoint first
      let r = await fetch(
        `http://127.0.0.1:5000/api/cycle_timeseries?cell_id=${encodeURIComponent(cellId)}&cycle_index=${encodeURIComponent(
          String(cycleIndex)
        )}`
      );
      if (!r.ok) {
        // Fallback endpoint name
        r = await fetch(
          `http://127.0.0.1:5000/api/timeseries?cell_id=${encodeURIComponent(cellId)}&cycle_index=${encodeURIComponent(
            String(cycleIndex)
          )}`
        );
      }
  const d = await r.json();
  const arr = Array.isArray(d) ? d : Array.isArray(d?.rows) ? d.rows : [];
  setTsData(arr);
  const unitsFromApi: Record<string, string> = (d && !Array.isArray(d) && d.units) ? d.units : {};
  const keys0 = Object.keys(arr?.[0] || {});
  const xFromApi: string | null = (d && !Array.isArray(d) && typeof d.x === "string" && keys0.includes(d.x)) ? d.x : null;
  setTsUnits(unitsFromApi || {});
  setTsXKey(xFromApi);
  // Detect numeric metric keys (exclude x-axis)
  const keys = Object.keys(arr?.[0] || {});
  const xKey = xFromApi || detectXKey(keys);
      const metricKeys = keys.filter(
        (k) => k !== xKey && typeof (arr?.[0] || {})[k] === "number"
      );
      setTsMetrics(metricKeys);
      if (metricKeys.length && tsSelectedMetrics.length === 0) {
        setTsSelectedMetrics(metricKeys.slice(0, Math.min(2, metricKeys.length)));
      }
  // If distinct units >= 2, auto-enable Multi Y for visibility
  const unitOf = (name: string) => (unitsFromApi[name] || inferUnit(name));
  const unitSet = new Set(metricKeys.slice(0, Math.min(3, metricKeys.length)).map(unitOf));
  if (unitSet.size >= 2) setMultiAxis(true);
    } catch (e) {
      setErrorMsg("시계열 데이터를 불러오지 못했습니다.");
  setTsData([]);
  setTsMetrics([]);
  setTsSelectedMetrics([]);
  setTsUnits({});
  setTsXKey(null);
    } finally {
      setLoadingTs(false);
    }
  };

  const detectXKey = (keys: string[]): string => {
    const candidates = ["time", "t", "seconds", "step", "index", "sample", "x"];
    const lower = keys.map((k) => k.toLowerCase());
    for (const c of candidates) {
      const i = lower.indexOf(c);
      if (i >= 0) return keys[i];
    }
    return keys[0] || "index";
  };

  // 단위 추론(타임시리즈 메트릭용)
  const inferUnit = (k: string): string => {
    const key = (k || "").toLowerCase();
    if (/(^|[_\s])voltage|volt|v($|[_\s])/.test(key)) return "V";
    if (/(^|[_\s])current|amp|a($|[_\s])/.test(key)) return "A";
    if (/temperature|temp|°c|degc|celsius/.test(key)) return "°C";
    if (/q[_\s-]*charge|qc/.test(key)) return "Ah";
    if (/q[_\s-]*discharge|qd/.test(key)) return "Ah";
    if (/(^|[_\s])ir($|[_\s])|internal[_\s-]*resistance/.test(key)) return "Ω";
    return "value"; // fallback → 동일 단위 그룹으로 처리
  };

  // x축 라벨 포맷터: 숫자 → 최대 소수 3자리, 날짜문자열 → 짧은 형식
  const formatNum = (n: number) => {
    if (!isFinite(n)) return String(n);
    return Number(n.toFixed(3)).toString();
  };
  const isIsoDateLike = (s: string) => /\d{4}-\d{2}-\d{2}/.test(s);
  const formatXTick = (v: any) => {
    if (typeof v === "number") return formatNum(v);
    if (typeof v === "string") {
      const asNum = Number(v);
      if (!Number.isNaN(asNum) && v.trim() !== "") return formatNum(asNum);
      if (isIsoDateLike(v)) {
        try {
          const d = new Date(v);
          // 날짜/시간을 짧게
          return d.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        } catch {
          return v.length > 16 ? v.slice(0, 16) + "…" : v;
        }
      }
      return v.length > 16 ? v.slice(0, 16) + "…" : v;
    }
    return String(v);
  };
  
  // 전체 라벨 캐시(시계열)
  const tsLabels = useMemo(() => {
    if (!tsData?.length) return [] as any[];
    const keys = Object.keys(tsData[0]);
    const xKey = tsXKey && keys.includes(tsXKey) ? tsXKey : detectXKey(keys);
    return tsData.map((r) => (r?.[xKey] as any) ?? undefined);
  }, [tsData, tsXKey]);
  // 새로운 시계열이 로드되면 범위 선택 초기화
  useEffect(() => {
    setTsRange(null);
  setTsRange2(null);
  }, [tsData, tsXKey]);

  const METRICS = ["ir", "q_charge", "q_discharge", "tavg", "tmin", "tmax", "chargetime"];
  const toggleMetric = (metric: string) =>
    setSelectedMetrics((prev) => (prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]));

  const normalizeSeries = (values: (number | null)[]) => {
    const nums = values.filter((v): v is number => typeof v === "number");
    if (nums.length < 2) return values;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    return values.map((v) => (typeof v === "number" ? (v - min) / span : v));
  };

  // ----------------------
  // CHART data/options
  // ----------------------
  const chartData = useMemo(() => {
    if (!summaryData?.length) return { labels: [], datasets: [] } as any;
    const seen = new Set<number | string>();
    const labels = summaryData
      .map((r) => r.cycle_index)
      .filter((x) => (seen.has(x) ? false : (seen.add(x), true)));

    const datasets = selectedMetrics.map((metric, idx) => {
      const color = colorForKey(metric);
      const series = summaryData.map((r) => (typeof r[metric] === "number" ? (r[metric] as number) : null));
      const aligned = alignToLabels(labels, series);
      const finalData = normalize ? (normalizeSeries(aligned) as (number | null)[]) : aligned;
      return {
        label: metric,
        data: finalData,
        borderColor: color,
        backgroundColor: rgba(color, 0.18),
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        yAxisID: multiAxis ? `y-${idx}` : "y",
        spanGaps: false,
      };
    });

    return { labels, datasets };
  }, [summaryData, selectedMetrics, normalize, multiAxis]);

  const chartOptions = useMemo(() => {
    const text = dark ? "#e5e7eb" : "#1f2937"; // gray-200 / gray-800
    const grid = dark ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.35)"; // slate-400 with alpha

    const yScales = multiAxis
      ? selectedMetrics.reduce((acc, _, i) => {
          (acc as any)[`y-${i}`] = {
            type: "linear" as const,
            position: i % 2 === 0 ? "left" : "right",
            grid: { color: grid, drawOnChartArea: i === 0 },
            ticks: { color: text, callback: (v: any) => (typeof v === "number" ? v.toFixed(2) : v) },
          };
          return acc;
        }, {} as Record<string, any>)
      : {
          y: {
            type: "linear" as const,
            position: "left" as const,
            grid: { color: grid },
            ticks: { color: text, callback: (v: any) => (typeof v === "number" ? v.toFixed(2) : v) },
          },
        };

    return {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 6 / 3,
      plugins: {
        legend: { position: "bottom" as const, labels: { color: text } },
        tooltip: {
          mode: "index" as const,
          intersect: false,
          backgroundColor: dark ? "rgba(17,24,39,0.9)" : "rgba(255,255,255,0.95)",
          titleColor: dark ? "#f9fafb" : "#111827",
          bodyColor: dark ? "#e5e7eb" : "#111827",
          borderColor: dark ? "rgba(75,85,99,0.6)" : "rgba(0,0,0,0.1)",
          borderWidth: 1,
        },
        title: {
          display: true,
          text: selectedCell ? `Cycle Summary • ${selectedCell}` : "Cycle Summary",
          color: text,
        },
      },
      interaction: { mode: "index" as const, intersect: false },
      scales: {
        x: {
          title: { display: true, text: "cycle_index", color: text },
          ticks: { color: text },
          grid: { color: grid },
        },
        ...(yScales as any),
      },
    } as const;
  }, [selectedMetrics, selectedCell, multiAxis, dark]);

  // Timeseries chart builder (reusable for up to two charts)
  const buildTsChart = (selMetrics: string[], range: [number, number] | null) => {
    if (!tsData?.length) return { data: { labels: [], datasets: [] }, options: {} } as any;
    const keys = Object.keys(tsData[0]);
    const xKey = tsXKey && keys.includes(tsXKey) ? tsXKey : detectXKey(keys);
    const labelsAll = tsLabels.length ? tsLabels : tsData.map((r) => (r?.[xKey] as any) ?? undefined);
    const L = labelsAll.length;
    const [s0, e0] = range ? range : [0, L > 0 ? L - 1 : 0];
    const s = Math.max(0, Math.min(s0, L > 0 ? L - 1 : 0));
    const e = Math.max(0, Math.min(e0, L > 0 ? L - 1 : 0));
    const start = Math.min(s, e), end = Math.max(s, e);
    const labels = labelsAll.slice(start, end + 1);
    const units = selMetrics.map((m) => tsUnits[m] || inferUnit(m));
    const uniqueUnits: string[] = [];
    for (const u of units) if (!uniqueUnits.includes(u)) uniqueUnits.push(u);
    const unitToAxis: Record<string, "y-left" | "y-right"> = {};
    if (uniqueUnits[0]) unitToAxis[uniqueUnits[0]] = "y-left";
    if (uniqueUnits[1]) unitToAxis[uniqueUnits[1]] = "y-right";
    for (const extra of uniqueUnits.slice(2)) unitToAxis[extra] = "y-right";

    const datasets = selMetrics.map((k, i) => {
      const color = PALETTE[i % PALETTE.length];
      const u = units[i];
      const yAxisID = multiAxis ? unitToAxis[u] || "y-left" : "y";
      const label = `${k}${u ? ` [${u}]` : ""}`;
      return {
        label,
        data: tsData.slice(start, end + 1).map((r) => (typeof r?.[k] === "number" ? (r[k] as number) : null)),
        borderColor: color,
        backgroundColor: rgba(color, 0.18),
        borderWidth: 1.8,
        pointRadius: 0,
        fill: false,
        spanGaps: true,
        yAxisID,
      };
    });

    const text = dark ? "#e5e7eb" : "#1f2937";
    const grid = dark ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.35)";
    const options = {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 4 / 3,
      plugins: {
        legend: { position: "bottom" as const, labels: { color: text } },
        tooltip: {
          mode: "index" as const,
          intersect: false,
          backgroundColor: dark ? "rgba(17,24,39,0.9)" : "rgba(255,255,255,0.95)",
          titleColor: dark ? "#f9fafb" : "#111827",
          bodyColor: dark ? "#e5e7eb" : "#111827",
          borderColor: dark ? "rgba(75,85,99,0.6)" : "rgba(0,0,0,0.1)",
          borderWidth: 1,
          callbacks: {
            title: (items: any[]) => {
              if (!items?.length) return "";
              const idx = items[0].dataIndex;
              return formatXTick(labels[idx]);
            },
          },
        },
        title: {
          display: true,
          text: selectedCell && selectedCycle != null ? `Timeseries • ${selectedCell} • cycle ${selectedCycle}` : "Timeseries",
          color: text,
        },
      },
      interaction: { mode: "index" as const, intersect: false },
      scales: (() => {
        if (multiAxis) {
          const leftTitle = uniqueUnits[0] || "Value";
          const rightTitle = uniqueUnits[1] || undefined;
          return {
            x: {
              title: { display: true, text: xKey, color: text },
              ticks: { color: text, autoSkip: true, maxTicksLimit: 10, callback: (val: any) => formatXTick(labels[Number(val)] ?? val) },
              grid: { color: grid },
            },
            "y-left": {
              type: "linear" as const,
              position: "left" as const,
              grid: { color: grid },
              ticks: { color: text },
              title: { display: true, text: leftTitle, color: text },
            },
            ...(rightTitle
              ? {
                  "y-right": {
                    type: "linear" as const,
                    position: "right" as const,
                    grid: { color: grid, drawOnChartArea: false },
                    ticks: { color: text },
                    title: { display: true, text: rightTitle, color: text },
                  },
                }
              : {}),
          } as const;
        }
        return {
          x: {
            title: { display: true, text: xKey, color: text },
            ticks: { color: text, autoSkip: true, maxTicksLimit: 10, callback: (val: any) => formatXTick(labels[Number(val)] ?? val) },
            grid: { color: grid },
          },
          y: { ticks: { color: text }, grid: { color: grid } },
        } as const;
      })(),
    } as const;

    return { data: { labels, datasets }, options };
  };

  const tsChart1 = useMemo(() => buildTsChart(tsSelectedMetrics, tsRange), [tsData, tsSelectedMetrics, dark, selectedCell, selectedCycle, multiAxis, tsUnits, tsXKey, tsRange, tsLabels]);
  const tsChart2 = useMemo(() => buildTsChart(tsSelectedMetrics2, tsRange2), [tsData, tsSelectedMetrics2, dark, selectedCell, selectedCycle, multiAxis, tsUnits, tsXKey, tsRange2, tsLabels]);

  // ----------------------
  // TABLE helpers
  // ----------------------
  const densityRow = {
    comfortable: "text-sm [&>td]:py-3 [&>td]:px-4",
    cozy: "text-sm [&>td]:py-2 [&>td]:px-3",
    compact: "text-xs [&>td]:py-1.5 [&>td]:px-2",
  }[density];

  const containerPad = density === "compact" ? "p-3" : density === "cozy" ? "p-4" : "p-5";

  const filteredCells = useMemo(() => {
    const idq = filterCellId.trim().toLowerCase();
    const pq = filterPolicy.trim().toLowerCase();
    const minVal = filterCycleMin.trim() === "" ? null : Number(filterCycleMin);
    const maxVal = filterCycleMax.trim() === "" ? null : Number(filterCycleMax);
    return cellData.filter((row) => {
      if (idq && !row.cell_id.toLowerCase().includes(idq)) return false;
      if (pq && !(row.charge_policy || "").toLowerCase().includes(pq)) return false;
      const life = typeof row.cycle_life === "number" ? row.cycle_life : null;
      if (minVal != null && (life == null || life < minVal)) return false;
      if (maxVal != null && (life == null || life > maxVal)) return false;
      return true;
    });
  }, [cellData, filterCellId, filterPolicy, filterCycleMin, filterCycleMax]);

  const pagedCells = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCells.slice(start, start + pageSize);
  }, [filteredCells, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredCells.length / pageSize));

  // Auto-fit column widths to content lengths (runs after filters change)
  const autoFitColumns = () => {
    const sample = filteredCells.slice(0, 300);
    const headerCellId = "셀 ID";
    const headerPolicy = "충전 정책";
    const headerCycle = "사이클 수명";
    const cellIdLenMax = Math.max(headerCellId.length, ...sample.map((r) => (r.cell_id || "").length));
    const policyLenMax = Math.max(headerPolicy.length, ...sample.map((r) => (r.charge_policy || "").length));
    const cycleStrLenMax = Math.max(headerCycle.length, ...sample.map((r) => String(r.cycle_life ?? "-").length));
    const wCellId = clamp(estimateWidth("0".repeat(cellIdLenMax), 8, 28), 120, 280);
    const wPolicy = clamp(estimateWidth("0".repeat(policyLenMax), 6.5, 36), 220, 560);
    const wCycle = clamp(estimateWidth("0".repeat(cycleStrLenMax), 7, 24), 90, 160);
    const wActions = 110;
    setColWidths({ cell_id: wCellId, charge_policy: wPolicy, cycle_life: wCycle, actions: wActions });
  };
  useEffect(() => {
    autoFitColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCells.length, showColumns.cell_id, showColumns.charge_policy, showColumns.cycle_life, showColumns.actions]);

  // Auto-fit single column (on header resizer double-click)
  const autoFitColumn = (key: keyof typeof colWidths) => {
    const sample = filteredCells.slice(0, 300);
    if (key === 'cell_id') {
      const maxLen = Math.max("셀 ID".length, ...sample.map((r) => (r.cell_id || "").length));
      const w = clamp(estimateWidth("0".repeat(maxLen), 8, 28), 120, 280);
      setColWidths((w0) => ({ ...w0, cell_id: w }));
    } else if (key === 'charge_policy') {
      const maxLen = Math.max("충전 정책".length, ...sample.map((r) => (r.charge_policy || "").length));
      const w = clamp(estimateWidth("0".repeat(maxLen), 6.5, 36), 220, 560);
      setColWidths((w0) => ({ ...w0, charge_policy: w }));
    } else if (key === 'cycle_life') {
      const maxLen = Math.max("사이클 수명".length, ...sample.map((r) => String(r.cycle_life ?? "-").length));
      const w = clamp(estimateWidth("0".repeat(maxLen), 7, 24), 90, 160);
      setColWidths((w0) => ({ ...w0, cycle_life: w }));
    } else if (key === 'actions') {
      setColWidths((w0) => ({ ...w0, actions: 110 }));
    }
  };

  const onDetail = (cellId: string) => {
    setSelectedCell(cellId);
    loadSummary(cellId);
  };

  const onSelectCycle = (cycleIndex: number) => {
    setSelectedCycle(cycleIndex);
    if (selectedCell) loadTimeseries(selectedCell, cycleIndex);
  };

  const handleDownloadPDF = () => {
    const iframeBody = document.querySelector("iframe")?.contentDocument?.body;
    if (!iframeBody) return;
    html2canvas(iframeBody, { scale: 2, useCORS: true })
      .then((c) => {
        const imgData = c.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        const pw = pdf.internal.pageSize.getWidth();
        const ph = (c.height * pw) / c.width;
        pdf.addImage(imgData, "PNG", 0, 0, pw, ph);
        pdf.save("AI_Report.pdf");
      })
      .catch(() => setErrorMsg("PDF 생성 중 오류가 발생했습니다."));
  };

  // Ensure charts resize when the popup window or container changes size
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument || document;
    const win: Window | null = (doc as any).defaultView || (typeof window !== 'undefined' ? window : null);
    if (!win) return;

    let rafId: number | null = null;
    const doResize = () => {
      // throttle with rAF
      if (rafId != null) return;
      rafId = win.requestAnimationFrame(() => {
        rafId = null;
        try { (summaryChartRef.current as any)?.resize?.(); } catch {}
        try { (tsChart1Ref.current as any)?.resize?.(); } catch {}
        try { (tsChart2Ref.current as any)?.resize?.(); } catch {}
      });
    };

    // Listen to popup's own resize event
    const onResize = () => doResize();
    try { win.addEventListener('resize', onResize); } catch {}

    // Also observe container size for layout-driven changes
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => doResize());
      ro.observe(root);
    } catch {}

    // Initial pass
    doResize();

    return () => {
      try { win.removeEventListener('resize', onResize); } catch {}
      try { if (ro && root) ro.unobserve(root); } catch {}
      if (rafId != null) try { win.cancelAnimationFrame(rafId); } catch {}
    };
  }, [rootRef.current]);

  // ----------------------
  // RENDER
  // ----------------------
  return (
  <div ref={rootRef} className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
        {/* HEADER */}
  <header className="flex items-center justify-between px-4 pt-4 md:px-6 xl:px-8 2xl:px-10">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 md:text-2xl">배터리 셀 평가 대시보드</h1>
          <div className="flex items-center gap-2">
            <Toggle
              pressed={normalize}
              onPressedChange={setNormalize}
              aria-label="Normalize series"
              className="data-[state=on]:bg-blue-600 data-[state=on]:text-white"
            >
              Normalize
            </Toggle>
            <Toggle
              pressed={multiAxis}
              onPressedChange={setMultiAxis}
              aria-label="Multi y-axis"
              className="data-[state=on]:bg-blue-600 data-[state=on]:text-white"
            >
              Multi Y
            </Toggle>
            <Button
              onClick={() => setDark((v) => !v)}
              className="bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-white"
              title="Toggle dark mode"
            >
              {dark ? "🌙 Dark" : "☀️ Light"}
            </Button>
          </div>
        </header>

        {/* TOOLBAR */}
  <section className="mx-2 mt-4 rounded-lg bg-white shadow-sm dark:bg-gray-800 md:mx-4 xl:mx-6 2xl:mx-8">
          <div className={`flex flex-wrap items-center gap-3 ${containerPad}`}>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-600 dark:text-gray-400">MODE</Label>
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value as any)}
                className="rounded border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="cell_id">셀 실험모니터</option>
                <option value="ai_mode">AI Mode</option>
              </select>
            </div>

            {searchMode === "ai_mode" && (
              <>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="생성 프롬프트를 입력하세요"
                  className="w-[22rem] flex-1 min-w-[14rem] dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:border-gray-600"
                />
                <Button onClick={handleSearch} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500">생성</Button>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Row height</Label>
              <select
                value={density}
                onChange={(e) => setDensity(e.target.value as Density)}
                className="rounded border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="comfortable">Comfortable</option>
                <option value="cozy">Cozy</option>
                <option value="compact">Compact</option>
              </select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" className="dark:bg-gray-700 dark:text-gray-100">컬럼</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>보이기/숨기기</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[
                    { key: "cell_id", label: "셀 ID" },
                    { key: "charge_policy", label: "충전 정책" },
                    { key: "cycle_life", label: "사이클 수명" },
                    { key: "actions", label: "동작" },
                  ].map(({ key, label }) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={!!showColumns[key]}
                      onCheckedChange={(v) => setShowColumns((s) => ({ ...s, [key]: !!v }))}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="hidden items-center gap-2 md:flex">
                <Label className="text-xs text-gray-600 dark:text-gray-400">Rows</Label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value) || 12)}
                  className="rounded border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {[8, 12, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {errorMsg && (
            <p className="px-4 pb-3 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
          )}
        </section>

        {/* GRID LAYOUT */}
  <main className="mx-2 grid grid-cols-12 gap-4 py-4 md:mx-4 xl:mx-6 2xl:mx-8">
          {/* LEFT: Cells table (Level 1) */}
          <section className={`col-span-12 xl:col-span-4 2xl:col-span-3 rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 md:text-base">셀 목록</h2>
              {loadingCells && <span className="text-xs text-gray-500 dark:text-gray-400">불러오는 중…</span>}
            </div>

            {/* Filters */}
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Input
                value={filterCellId}
                onChange={(e) => { setFilterCellId(e.target.value); setPage(1); }}
                placeholder="셀 ID"
                className="h-8 text-xs dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:border-gray-600"
              />
              <Input
                value={filterPolicy}
                onChange={(e) => { setFilterPolicy(e.target.value); setPage(1); }}
                placeholder="충전 정책"
                className="h-8 text-xs dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:border-gray-600"
              />
              <Input
                type="number"
                value={filterCycleMin}
                onChange={(e) => { setFilterCycleMin(e.target.value); setPage(1); }}
                placeholder="사이클 수명 ≥"
                className="h-8 text-xs dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:border-gray-600"
              />
              <Input
                type="number"
                value={filterCycleMax}
                onChange={(e) => { setFilterCycleMax(e.target.value); setPage(1); }}
                placeholder="사이클 수명 ≤"
                className="h-8 text-xs dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:border-gray-600"
              />
              <div className="col-span-2 md:col-span-4 flex justify-end">
                <Button
                  variant="secondary"
                  className="h-8 px-2 text-xs"
                  onClick={() => { setFilterCellId(""); setFilterPolicy(""); setFilterCycleMin(""); setFilterCycleMax(""); setPage(1); }}
                >
                  초기화
                </Button>
              </div>
            </div>

            <div className="relative overflow-auto rounded border border-gray-200 dark:border-gray-700" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              <Table className="table-fixed">
                {/* Column widths bound to state for resizing */}
                <colgroup>
                  {showColumns.cell_id && <col style={{ width: colWidths.cell_id }} />}
                  {showColumns.charge_policy && <col style={{ width: colWidths.charge_policy }} />}
                  {showColumns.cycle_life && <col style={{ width: colWidths.cycle_life }} />}
                  {showColumns.actions && <col style={{ width: colWidths.actions }} />}
                </colgroup>
                <TableHeader className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur dark:bg-gray-900/60">
                  <TableRow className="[&>*]:py-2 [&>*]:text-xs [&>*]:text-left">
                    {showColumns.cell_id && (
                      <TableHead className={`font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300 ${stickyFirstCol ? "sticky left-0 z-10 bg-gray-50/90 dark:bg-gray-900/60" : ""}`}>
                        <div className="relative pr-3">
                          셀 ID
                          <span
                            onMouseDown={startResize('cell_id')}
                            onDoubleClick={() => autoFitColumn('cell_id')}
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none"
                          />
                        </div>
                      </TableHead>
                    )}
                    {showColumns.charge_policy && (
                      <TableHead className="font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        <div className="relative pr-3">
                          충전 정책
                          <span
                            onMouseDown={startResize('charge_policy')}
                            onDoubleClick={() => autoFitColumn('charge_policy')}
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none"
                          />
                        </div>
                      </TableHead>
                    )}
                    {showColumns.cycle_life && (
                      <TableHead className="font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        <div className="relative pr-3">
                          사이클 수명
                          <span
                            onMouseDown={startResize('cycle_life')}
                            onDoubleClick={() => autoFitColumn('cycle_life')}
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none"
                          />
                        </div>
                      </TableHead>
                    )}
                    {showColumns.actions && (
                      <TableHead className="font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        <div className="relative pr-3">
                          상세
                          <span
                            onMouseDown={startResize('actions')}
                            onDoubleClick={() => autoFitColumn('actions')}
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none"
                          />
                        </div>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCells.map((cell) => (
                    <TableRow key={cell.cell_id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/40 ${densityRow} [&>*]:text-left`}>
                      {showColumns.cell_id && (
                        <TableCell
                          title={cell.cell_id}
                          className={`${stickyFirstCol ? "sticky left-0 z-10 bg-white dark:bg-gray-800" : ""} font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap truncate text-left`}
                        >
                          {cell.cell_id}
                        </TableCell>
                      )}

                      {showColumns.charge_policy && (
                        <TableCell title={cell.charge_policy} className="whitespace-nowrap truncate text-gray-900 dark:text-gray-100 text-left">
                          <span className="inline-block max-w-[28rem] truncate align-middle">
                            {cell.charge_policy || "-"}
                          </span>
                        </TableCell>
                      )}

                      {showColumns.cycle_life && (
                        <TableCell className="text-gray-900 dark:text-gray-100 text-left">{cell.cycle_life ?? "-"}</TableCell>
                      )}

                      {showColumns.actions && (
                        <TableCell className="text-left">
                          <Button variant="secondary" className="h-8 px-2 text-xs dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500" onClick={() => onDetail(cell.cell_id)}>
                            📈 상세
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}

                  {pagedCells.length === 0 && !loadingCells && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-gray-500 dark:text-gray-400">
                        결과가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* pagination */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <div>
                {cellData.length > 0 && (
                  <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredCells.length)} / {filteredCells.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="secondary" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  이전
                </Button>
                <span className="px-2">{page} / {totalPages}</span>
                <Button variant="secondary" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  다음
                </Button>
              </div>
            </div>
          </section>

          {/* MIDDLE: Cycle summary table (Level 2) */}
          <section className={`col-span-12 xl:col-span-4 2xl:col-span-5 grid grid-rows-[auto_auto_1fr] gap-4`}>
            {/* Summary chart remains on top */}
            <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 md:text-base">
                  {selectedCell ? `셀 상세 정보: ${selectedCell}` : "셀을 선택해 그래프를 확인하세요"}
                </h3>
                {loadingSummary && <span className="text-xs text-gray-500 dark:text-gray-400">그래프 로딩 중…</span>}
              </div>
              <div className="relative w-full chart-host">
                <Line ref={summaryChartRef} data={{ labels: (chartData as any).labels, datasets: (chartData as any).datasets }} options={chartOptions as any} />
                {typeof window !== 'undefined' && !!window.opener && (
                  <button
                    title="일기장에 추가"
                    className="absolute top-1.5 right-1.5 p-1 rounded bg-white/85 dark:bg-gray-800/85 ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-white dark:hover:bg-gray-800"
                    onClick={async (e) => {
                      try {
                        const host = (e.currentTarget as HTMLElement).closest('.chart-host') as HTMLElement | null;
                        const canvas = (host ? host.querySelector('canvas') : null) as HTMLCanvasElement | null;
                        const dataURL = canvas?.toDataURL('image/png');
                        if (dataURL) {
                          window.opener?.postMessage({ type: 'add-to-canvas', kind: 'image-data', dataURL }, window.location.origin);
                        }
                      } catch {}
                    }}
                  >
                    <SquarePlus className="h-3.5 w-3.5 text-gray-700 dark:text-gray-100" />
                  </button>
                )}
              </div>
            </div>

            {/* Metric picker for summary chart */}
            <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
              <h4 className="mb-3 text-xs font-semibold text-gray-700 dark:text-gray-300">요약 차트 Y축 데이터</h4>
              <div className="flex flex-wrap gap-2">
                {METRICS.map((m) => {
                  const active = selectedMetrics.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMetric(m)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-700/70"
                      }`}
                      title={m}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                * Normalize는 각 시리즈를 0~1로 스케일링합니다. Multi Y-Axis는 메트릭별로 좌/우 Y축을 분리합니다.
              </p>
            </div>

            {/* Cycle summary table */}
            <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">사이클 요약 테이블</h4>
                {loadingSummary && <span className="text-xs text-gray-500 dark:text-gray-400">로딩…</span>}
              </div>
              <div className="relative overflow-auto rounded border border-gray-200 dark:border-gray-700" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                <Table className="table-fixed">
                  <TableHeader className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur dark:bg-gray-900/60">
                    <TableRow className="[&>*]:py-2 [&>*]:text-xs [&>*]:text-left">
                      <TableHead className="font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">cycle_index</TableHead>
                      {METRICS.map((m) => (
                        <TableHead key={m} className="font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300 truncate">{m}</TableHead>
                      ))}
                      <TableHead className="font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">시계열</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryData.map((r) => (
                      <TableRow key={r.cycle_index} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 text-xs [&>*]:py-1.5">
                        <TableCell className="font-mono text-gray-900 dark:text-gray-100 text-left">{r.cycle_index}</TableCell>
                        {METRICS.map((m) => (
                          <TableCell key={`${r.cycle_index}-${m}`} className="truncate text-gray-900 dark:text-gray-100 text-left">{typeof r[m] === "number" ? (r[m] as number)?.toFixed(4) : r[m] ?? "-"}</TableCell>
                        ))}
                        <TableCell className="text-left">
                          <Button variant="secondary" className="h-7 px-2 text-xs dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500" onClick={() => onSelectCycle(r.cycle_index)}>
                            ➜
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {summaryData.length === 0 && !loadingSummary && (
                      <TableRow>
                        <TableCell colSpan={1 + METRICS.length + 1} className="py-10 text-center text-gray-500 dark:text-gray-400">
                          데이터가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* AI Mode 결과 */}
            {searchMode === "ai_mode" && aiResults?.html && (
              <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 md:text-base">AI 분석 결과</h3>
                  <Button onClick={handleDownloadPDF} className="bg-blue-600 text-white hover:bg-blue-700">
                    PDF 다운로드
                  </Button>
                </div>
                <iframe
                  srcDoc={aiResults.html}
                  className="h-[620px] w-full rounded border border-gray-200 dark:border-gray-700"
                  title="AI Mode 결과"
                />
              </div>
            )}
          </section>

          {/* RIGHT: Timeseries (Level 3) */}
          <section className={`col-span-12 xl:col-span-4 2xl:col-span-4 grid auto-rows-max gap-4`}>
    {/* Chart 1 */}
    <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">시계열</h4>
                <div className="flex items-center gap-2">
                  {loadingTs && <span className="text-xs text-gray-500 dark:text-gray-400">로딩…</span>}
                  {tsChartCount === 1 ? (
                    <Button title="차트 추가" variant="secondary" className="h-7 px-2 text-xs"
                            onClick={() => setTsChartCount(2)} disabled={!tsData.length}>+ 추가</Button>
                  ) : (
                    <Button title="차트 제거" variant="secondary" className="h-7 px-2 text-xs"
                            onClick={() => { setTsChartCount(1); setTsSelectedMetrics2([]); setTsRange2(null); }}>− 제거</Button>
                  )}
                </div>
              </div>
  <div className="relative w-full chart-host">
                {tsData.length ? (
                  <>
        <Line ref={tsChart1Ref} data={tsChart1.data as any} options={tsChart1.options as any} />
                    {typeof window !== 'undefined' && !!window.opener && (
                      <button
                        title="일기장에 추가"
                        className="absolute top-1.5 right-1.5 p-1 rounded bg-white/85 dark:bg-gray-800/85 ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-white dark:hover:bg-gray-800"
            onClick={async (e) => {
                          try {
              const host = (e.currentTarget as HTMLElement).closest('.chart-host') as HTMLElement | null;
              const canvas = (host ? host.querySelector('canvas') : null) as HTMLCanvasElement | null;
              const dataURL = canvas?.toDataURL('image/png');
                            if (dataURL) {
                              window.opener?.postMessage({ type: 'add-to-canvas', kind: 'image-data', dataURL }, window.location.origin);
                            }
                          } catch {}
                        }}
                      >
                        <SquarePlus className="h-3.5 w-3.5 text-gray-700 dark:text-gray-100" />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="grid h-full place-items-center text-xs text-gray-500 dark:text-gray-400">
                    {selectedCell ? (selectedCycle != null ? "시계열 데이터가 없습니다." : "사이클을 선택해 시계열을 확인하세요") : "셀을 먼저 선택하세요"}
                  </div>
                )}
              </div>
            </div>

    {/* Metrics 1 */}
    <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
              <h5 className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">시계열 메트릭</h5>
              <div className="flex flex-wrap gap-2">
                {tsMetrics.map((k) => {
                  const active = tsSelectedMetrics.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => setTsSelectedMetrics((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-200"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-700/70"
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400">* 측정 열을 선택/해제해 시계열에 반영합니다.</p>
            </div>

            {/* Range zoom UI 1 */}
            <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
              <h5 className="mb-3 text-xs font-semibold text-gray-700 dark:text-gray-300">구간 확대</h5>
              {tsLabels.length ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
                    {(() => {
                      const L = tsLabels.length;
                      const s = (tsRange?.[0] ?? 0);
                      const e = (tsRange?.[1] ?? (L - 1));
                      return (
                        <>
                          <span>범위:</span>
                          <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700 dark:text-gray-100">{s}</code>
                          <span>~</span>
                          <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700 dark:text-gray-100">{e}</code>
                          <Button variant="secondary" className="h-7 px-2" onClick={() => setTsRange(null)}>전체</Button>
                        </>
                      );
                    })()}
                  </div>
                  {(() => {
                    const L = tsLabels.length;
                    const s = (tsRange?.[0] ?? 0);
                    const e = (tsRange?.[1] ?? (L - 1));
                    const onStart = (val: number) => {
                      if (val > e) setTsRange([e, e]); else setTsRange([val, e]);
                    };
                    const onEnd = (val: number) => {
                      if (val < s) setTsRange([s, s]); else setTsRange([s, val]);
                    };
                    return (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-right text-[11px] text-gray-500 dark:text-gray-400">시작</span>
                          <input type="range" min={0} max={Math.max(0, L - 1)} value={s}
                                 onChange={(e) => onStart(Number(e.target.value))}
                                 className="flex-1" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-right text-[11px] text-gray-500 dark:text-gray-400">끝</span>
                          <input type="range" min={0} max={Math.max(0, L - 1)} value={e}
                                 onChange={(e) => onEnd(Number(e.target.value))}
                                 className="flex-1" />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">시계열을 불러오면 확대 구간을 설정할 수 있습니다.</p>
              )}
            </div>

            {tsChartCount === 2 && (
              <>
                {/* Chart 2 */}
                <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">시계열 2</h4>
                    <Button title="차트 제거" variant="secondary" className="h-7 px-2 text-xs"
                            onClick={() => { setTsChartCount(1); setTsSelectedMetrics2([]); setTsRange2(null); }}>− 제거</Button>
                  </div>
          <div className="relative w-full chart-host">
                    {tsData.length ? (
                      <>
                        <Line ref={tsChart2Ref} data={tsChart2.data as any} options={tsChart2.options as any} />
                        {typeof window !== 'undefined' && !!window.opener && (
                          <button
                            title="일기장에 추가"
                            className="absolute top-1.5 right-1.5 p-1 rounded bg-white/85 dark:bg-gray-800/85 ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-white dark:hover:bg-gray-800"
              onClick={async (e) => {
                              try {
                const host = (e.currentTarget as HTMLElement).closest('.chart-host') as HTMLElement | null;
                const canvas = (host ? host.querySelector('canvas') : null) as HTMLCanvasElement | null;
                const dataURL = canvas?.toDataURL('image/png');
                                if (dataURL) {
                                  window.opener?.postMessage({ type: 'add-to-canvas', kind: 'image-data', dataURL }, window.location.origin);
                                }
                              } catch {}
                            }}
                          >
                            <SquarePlus className="h-3.5 w-3.5 text-gray-700 dark:text-gray-100" />
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-gray-500 dark:text-gray-400">
                        {selectedCell ? (selectedCycle != null ? "시계열 데이터가 없습니다." : "사이클을 선택해 시계열을 확인하세요") : "셀을 먼저 선택하세요"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Metrics 2 */}
                <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
                  <h5 className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">시계열 메트릭 (차트 2)</h5>
                  <div className="flex flex-wrap gap-2">
                    {tsMetrics.map((k) => {
                      const active = tsSelectedMetrics2.includes(k);
                      return (
                        <button
                          key={k}
                          onClick={() => setTsSelectedMetrics2((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            active
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-200"
                              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-700/70"
                          }`}
                        >
                          {k}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400">* 차트 2에 표시할 열을 선택/해제하세요.</p>
                </div>

                {/* Range zoom UI 2 */}
                <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
                  <h5 className="mb-3 text-xs font-semibold text-gray-700 dark:text-gray-300">구간 확대 (차트 2)</h5>
                  {tsLabels.length ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
                        {(() => {
                          const L = tsLabels.length;
                          const s = (tsRange2?.[0] ?? 0);
                          const e = (tsRange2?.[1] ?? (L - 1));
                          return (
                            <>
                              <span>범위:</span>
                              <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700 dark:text-gray-100">{s}</code>
                              <span>~</span>
                              <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700 dark:text-gray-100">{e}</code>
                              <Button variant="secondary" className="h-7 px-2" onClick={() => setTsRange2(null)}>전체</Button>
                            </>
                          );
                        })()}
                      </div>
                      {(() => {
                        const L = tsLabels.length;
                        const s = (tsRange2?.[0] ?? 0);
                        const e = (tsRange2?.[1] ?? (L - 1));
                        const onStart = (val: number) => {
                          if (val > e) setTsRange2([e, e]); else setTsRange2([val, e]);
                        };
                        const onEnd = (val: number) => {
                          if (val < s) setTsRange2([s, s]); else setTsRange2([s, val]);
                        };
                        return (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-right text-[11px] text-gray-500 dark:text-gray-400">시작</span>
                              <input type="range" min={0} max={Math.max(0, L - 1)} value={s}
                                     onChange={(e) => onStart(Number(e.target.value))}
                                     className="flex-1" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-right text-[11px] text-gray-500 dark:text-gray-400">끝</span>
                              <input type="range" min={0} max={Math.max(0, L - 1)} value={e}
                                     onChange={(e) => onEnd(Number(e.target.value))}
                                     className="flex-1" />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">시계열을 불러오면 확대 구간을 설정할 수 있습니다.</p>
                  )}
                </div>
              </>
            )}

            <div className={`rounded-lg bg-white shadow-sm dark:bg-gray-800 ${containerPad}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  className="h-8 px-2 text-xs"
                  disabled={!selectedCell || selectedCycle == null}
                  onClick={() => {
                    if (selectedCell && selectedCycle != null) loadTimeseries(selectedCell, selectedCycle);
                  }}
                >
                  🔄 새로고침
                </Button>
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={stickyFirstCol} onChange={() => setStickyFirstCol((v) => !v)} />
                  <span>테이블 첫 열 고정</span>
                </label>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default HistoryDashboard;

