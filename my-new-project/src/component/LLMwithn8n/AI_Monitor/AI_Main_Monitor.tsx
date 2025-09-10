import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Bot,
  Send,
  User,
  Loader2,
  Moon,
  Sun,
  Link as LinkIcon,
  Database,
  LineChart,
  Brain,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  RefreshCw,
  FileDown, // ← 추가: PDF 아이콘
  SquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import ExcalidrawCanvas, { ExcalidrawCanvasHandle } from "./ExcalidrawCanvas";
import HistoryDashboard from "@/component/HIstoryMon/HistoryDashboard";

// --- Session ---
// 페이지 새로고침(리로드)마다 새로운 세션 ID를 발급
function newSessionId() {
  try {
    const base = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uuidv4();
    return `${base}-${Date.now().toString(36)}`;
  } catch {
    return `${uuidv4()}-${Date.now().toString(36)}`;
  }
}
const SESSION_ID = newSessionId(); // ← 리로드 시마다 변경

// --- Types ---
type ChatMsg = { role: "user" | "assistant"; content: string; isMarkdown?: boolean };

type StepKey = "router" | "db" | "chart" | "trend" | "compose";

type Step = {
  key: StepKey;
  label: string;
  desc: string;
  icon: React.ReactNode;
};

const STEPS: Step[] = [
  { key: "router", label: "Routing", desc: "의도 분류/패턴 결정", icon: <Settings2 className="h-4 w-4" /> },
  { key: "db", label: "DB Query", desc: "다운샘플 SQL 실행", icon: <Database className="h-4 w-4" /> },
  { key: "chart", label: "Chart", desc: "JSON → 이미지", icon: <LineChart className="h-4 w-4" /> },
  { key: "trend", label: "Trend", desc: "슬로프/R²/변곡점", icon: <Brain className="h-4 w-4" /> },
  { key: "compose", label: "Compose", desc: "리포트 생성", icon: <Sparkles className="h-4 w-4" /> },
];
// 대화창 이미지 최대 높이(글자 크기와 비례하도록 em 사용)
const CHAT_IMG_MAX_EM = 18;

// --- Utils ---
function sanitizeUrl(url: string) {
  return url.replace(/\u2026/g, "").replace(/[)\].,;]+$/g, "").trim();
}

function extractLinksFromMarkdown(md: string): { title?: string; url: string }[] {
  const results: { title?: string; url: string }[] = [];
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRe.exec(md)) !== null) {
    results.push({ title: m[1], url: sanitizeUrl(m[2]) });
  }
  const urlRe = /(https?:\/\/[^\s)]+)(?![^[]*\))/g;
  let u: RegExpExecArray | null;
  while ((u = urlRe.exec(md)) !== null) {
    const url = sanitizeUrl(u[1]);
    if (!results.some((r) => r.url === url)) results.push({ url });
  }
  return results;
}

function isChartLikeUrl(url: string) {
  const u = sanitizeUrl(url);
  const isImg = /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(u);
  if (isImg) return true;
  if (/quickchart\.io\/chart/i.test(u)) return true;
  if (/\/static\/graphs\/|\/chart\/|\/plot\//i.test(u)) return true;
  return false;
}

function pickChartUrls(links: { title?: string; url: string }[], limit = 8): string[] {
  const out: string[] = [];
  const pushUnique = (u?: string) => {
    if (!u) return;
    const url = sanitizeUrl(u);
    if (!out.includes(url)) out.push(url);
  };
  links.filter((l) => /quickchart\.io\/chart/i.test(l.url)).forEach((l) => pushUnique(l.url));
  links.filter((l) => /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(l.url)).forEach((l) => pushUnique(l.url));
  links.filter((l) => /\/static\/graphs\/|\/chart\/|\/plot\//i.test(l.url)).forEach((l) => pushUnique(l.url));
  return out.slice(0, limit);
}

// Extract lightweight signals from assistant text to reflect pipeline progress
function inferProgressFromText(t: string): Partial<Record<StepKey, boolean>> {
  const s = t.toLowerCase();
  return {
    router: /(router|intent|pattern|패턴)/i.test(s) || /routing/i.test(s),
    db: /(sql|query|쿼리|db|cycle|timeseries)/i.test(s),
    chart: /(chart|quickchart|시각|그래프)/i.test(s),
    trend: /(trend|slope|r²|changepoint|변곡|모노토닉)/i.test(s),
    compose: /(summary|report|요약|분석)/i.test(s),
  };
}

// 말풍선 DOM을 PDF로 저장
async function exportElementToPDF(el: HTMLElement, filename: string) {
  const mod = await import("html2pdf.js");
  const html2pdf = (mod as any).default || (mod as any);
  const opt = {
    margin: [10, 10, 10, 10],
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 6, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"] },
  };
  await html2pdf().set(opt).from(el).save();
}

// --- Components ---
const StepBadge: React.FC<{ active?: boolean; done?: boolean; label: string; desc?: string; icon: React.ReactNode }>
  = ({ active, done, label, desc, icon }) => (
  <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${active ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-slate-200 dark:border-slate-700"}`}>
    <div
      className={[
        "h-7 w-7 grid place-items-center rounded-full",
        done
          ? "bg-green-600 text-white"
          : active
          ? "bg-white text-blue-600 border border-blue-500 dark:bg-slate-900/60"
          : "bg-slate-400 text-white",
      ].join(" ")}
    >
      {active ? (
        <RefreshCw
          className="h-4 w-4 animate-spin"
          style={{ animationDuration: "1.1s" }} // 아이콘 크기에 맞춘 부드러운 회전
        />
      ) : (
        // 아이콘은 색상을 상속받음(done/idle에서 자동으로 대비 적용)
        icon
      )}
    </div>
    <div className="flex flex-col -space-y-0.5">
      <span className={`text-xs font-semibold ${active ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"}`}>{label}</span>
      {desc && <span className="text-[11px] text-slate-500 dark:text-slate-400">{desc}</span>}
    </div>
  </div>
);

const Bubble: React.FC<{
  role: "user" | "assistant";
  children: React.ReactNode;
  onExport?: () => void;
  onToCanvas?: () => void;
  innerRef?: React.Ref<HTMLDivElement>;
}> = ({ role, children, onExport, onToCanvas, innerRef }) => (
  <div className={`flex ${role === "assistant" ? "justify-end" : "justify-start"}`}>
    <div
      ref={innerRef}
      className={`relative max-w-[78%] rounded-2xl px-4 py-3 ${
        (onExport || onToCanvas) ? "pr-9" : ""
      } text-sm leading-relaxed break-words shadow-sm border ${
        role === "user"
          ? "bg-blue-600 text-white border-blue-500"
          : "bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {role === "user" ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-slate-700 dark:text-slate-200" />
        )}
        <span className="text-xs opacity-80">{role}</span>
      </div>

      {/* 우상단 액션 영역: 캔버스 붙여넣기 + (assistant만) PDF */}
      {(onToCanvas || onExport) && (
        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1" data-html2canvas-ignore="true">
          {onToCanvas && (
            <button
              onClick={onToCanvas}
              className="p-1 rounded bg-white/85 dark:bg-slate-800/85 ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-white dark:hover:bg-slate-800"
              title="캔버스에 붙여넣기"
            >
              <SquarePlus className="h-3.5 w-3.5 text-slate-700 dark:text-slate-100" />
            </button>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="p-1 rounded bg-white/85 dark:bg-slate-800/85 ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-white dark:hover:bg-slate-800"
              title="PDF로 내보내기"
            >
              <FileDown className="h-3.5 w-3.5 text-slate-700 dark:text-slate-100" />
            </button>
          )}
        </div>
      )}

      {children}
    </div>
  </div>
);

const LinkOrChart: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => {
  const [failed, setFailed] = useState(false);
  const url = sanitizeUrl(String(href || ""));
  const chartLike = isChartLikeUrl(url);
  if (!chartLike || failed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
        <LinkIcon className="h-3.5 w-3.5" /> {children || url}
      </a>
    );
  }
  return (
    <img
      src={url}
      alt={typeof children === "string" ? String(children) : "그래프"}
      className="mt-2 rounded-md border w-auto max-w-full object-contain bg-white block ml-0"
      style={{ maxHeight: `${CHAT_IMG_MAX_EM}em` }}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
};

// --- Main ---
export default function AI_Main_Monitor() {
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "canvas">("chat");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Right rail state
  const [links, setLinks] = useState<{ title?: string; url: string }[]>([]);
  const [chartUrls, setChartUrls] = useState<string[]>([]);

  // Live step progress
  const [stepState, setStepState] = useState<Record<StepKey, "idle" | "active" | "done">>({
    router: "idle",
    db: "idle",
    chart: "idle",
    trend: "idle",
    compose: "idle",
  });

  // SSE connection state
  const [sseConnected, setSseConnected] = useState(false);

  // ← 추가: 진행상황 요약(context)
  const [progressContext, setProgressContext] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Theme toggle: apply dark class at root container level
  const containerClass = isDark ? "dark" : "";

  const startPipeline = () => {
    setStepState({ router: "active", db: "idle", chart: "idle", trend: "idle", compose: "idle" });
  };
  const advance = (k: StepKey) => setStepState((s) => ({ ...s, [k]: "done", ...(k === "router" ? { db: "active" } : {}), ...(k === "db" ? { chart: "active" } : {}), ...(k === "chart" ? { trend: "active" } : {}), ...(k === "trend" ? { compose: "active" } : {}), }));
  const finishCompose = () => setStepState((s) => ({ ...s, compose: "done" }));

  // Optional SSE progress (if you wire a /events endpoint)
  useEffect(() => {
    const url = `http://localhost:5679/events?session=${SESSION_ID}&t=${Date.now()}`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
      es.onopen = () => { setSseConnected(true); console.log("[SSE] open", SESSION_ID); };
      es.onerror = (e) => { setSseConnected(false); console.warn("[SSE] error", e); };

      // 기본 이벤트(서버가 event: 지정 안 했을 때 대비)
      es.onmessage = (e) => { console.log("[SSE:message]", e.data); };

      es.addEventListener("hello", (e: MessageEvent) => {
        try { console.log("[SSE:hello]", JSON.parse(e.data || "{}")); } catch { console.log("[SSE:hello]", e.data); }
        setSseConnected(true);
      });
      es.addEventListener("progress", (e: MessageEvent) => {
        try {
          const ev = JSON.parse(e.data || "{}");
          console.log("[SSE:progress]", ev);
          if (ev.stage === "router") setStepState((s) => ({ ...s, router: ev.status }));
          if (ev.stage === "db")     setStepState((s) => ({ ...s, db: ev.status }));
          if (ev.stage === "chart")  setStepState((s) => ({ ...s, chart: ev.status }));
          if (ev.stage === "trend")  setStepState((s) => ({ ...s, trend: ev.status }));
          if (ev.stage === "compose")setStepState((s) => ({ ...s, compose: ev.status }));

          // ← 추가: context(1줄 요약) 갱신
          if (typeof ev.context !== "undefined") {
            const normalized = String(ev.context ?? "")
              .replace(/\s+/g, " ")
              .trim();
            if (normalized) setProgressContext(normalized);
          }
        } catch {}
      });
    } catch {}
    return () => { try { es?.close(); setSseConnected(false); } catch {} };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    // UI progress start
    startPipeline();
    // ← 추가: 이전 진행 요약 초기화
    setProgressContext(null);

    const userMsg: ChatMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    
    //"http://localhost:5678/webhook/test-analysis"
    //http://localhost:5678/webhook-test/sse_test

    try {
      const res = await fetch("http://localhost:5678/webhook-test/test-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          "Session-ID": SESSION_ID,
        },
        body: JSON.stringify({ query: userMsg.content }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`);
      }

      const raw = (await res.text())?.trim().replace(/^\uFEFF/, "") || "";

      let md = "응답이 비어 있습니다.";
      try {
        const parsed: any = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          md = String(parsed[0]?.output ?? parsed[0]?.markdown ?? parsed[0]?.text ?? raw);
        } else {
          md = String(parsed?.output ?? parsed?.markdown ?? parsed?.text ?? raw);
        }
      } catch {
        md = raw;
      }

      // Extract signals → update progress heuristically
      const sig = inferProgressFromText(md);
      if (sig.router) advance("router");
      if (sig.db) advance("db");
      if (sig.chart) advance("chart");
      if (sig.trend) advance("trend");
      if (sig.compose) finishCompose();

  // Links/Charts
  const lk = extractLinksFromMarkdown(md);
  const cu = pickChartUrls(lk);
  setLinks(lk);
  setChartUrls(cu);

      // Show assistant
      setMessages((prev) => [...prev, { role: "assistant", content: md, isMarkdown: true }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `서버 통신 실패: ${e?.message || "네트워크 오류"}` },
      ]);
    } finally {
      setLoading(false);
      finishCompose();
      // ← 추가: 완료 시 진행 요약 제거
      setProgressContext(null);
    }
  };

  const examplePrompts = [
    "b1c12 100~400 사이클 IR/Qd 트렌드와 변곡점",
    "b1c8 사이클 200, 10.0~40.0초 파형 자세히",
    "[b1c10,b1c11] 50~350 비교 (IR/용량)",
    "b1c12 dQ/dV 피크·폭 100~600"
  ];

  // (추가) assistant 말풍선별 DOM 참조를 저장
  const bubbleRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRef = useRef<ExcalidrawCanvasHandle | null>(null);

  // Receive messages from popup to add content to canvas (main window only)
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      try {
        if (!ev || !ev.data || typeof ev.data !== 'object') return;
        // Same-origin check if available
        if (typeof ev.origin === 'string' && typeof window !== 'undefined' && window.location && ev.origin && window.location.origin && ev.origin !== window.location.origin) return;
        const { type, kind, url, dataURL, text, role } = ev.data as any;
        if (type === 'add-to-canvas') {
          // Ensure editor tab visible
          setActiveTab('canvas');
          if (kind === 'image' && typeof url === 'string') {
            setTimeout(() => canvasRef.current?.addImageFromUrl(url), 20);
          } else if (kind === 'image-data' && typeof dataURL === 'string') {
            setTimeout(() => canvasRef.current?.addImageFromUrl(dataURL), 20);
          } else if (kind === 'bubble' && typeof text === 'string') {
            setTimeout(() => canvasRef.current?.addSpeechBubble(text, role === 'user' ? 'user' : 'assistant'), 20);
          }
        }
      } catch {}
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Open HistoryDashboard in a popup
  const openHistoryDashboardPopup = async () => {
    const w = window.open('', 'AI_Deep_Analysis', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
    if (!w) return;
    // Basic document skeleton
    w.document.title = 'History Dashboard';
    w.document.body.innerHTML = '';
    const mount = w.document.createElement('div');
    mount.id = 'root';
    w.document.body.appendChild(mount);
    // Clone styles from parent
    try {
      const head = w.document.head || w.document.getElementsByTagName('head')[0];
      const parentHead = document.head;
      // clone link and style tags
      Array.from(parentHead.querySelectorAll('link[rel="stylesheet"], style')).forEach((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        head.appendChild(clone);
      });
    } catch {}
  // Render React tree with HistoryDashboard
    const mod = await import('react-dom/client');
    const { createRoot } = mod as any;
    const root = createRoot(mount);
  root.render(React.createElement(HistoryDashboard, {}));
    // Cleanup on close
    const timer = w.setInterval(() => {
      if (w.closed) {
        try { root.unmount(); } catch {}
        w.clearInterval(timer);
      }
    }, 1000);
  };

  // (추가) 내보내기 핸들러
  const handleExportBubble = async (idx: number) => {
    const el = bubbleRefs.current[idx];
    if (!el) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
    const filename = `assistant-${idx}-${ts}.pdf`;
    try {
      await exportElementToPDF(el, filename);
    } catch (e) {
      console.error("PDF export failed:", e);
    }
  };

  // (추가) 말풍선 → 캔버스 붙여넣기
  const markdownToPlain = (md: string) =>
    md
      .replace(/```[\s\S]*?```/g, " ") // 코드 블록 제거
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2")
      .replace(/^>\s?/gm, "")
      .replace(/#+\s?/g, "")
      .replace(/\s+$/g, "")
      .trim();

  const handleBubbleToCanvas = (content: string, role: "user" | "assistant", isMarkdown?: boolean) => {
    const text = isMarkdown ? markdownToPlain(content) : content;
    setActiveTab("canvas");
    // 약간의 지연 후 추가(캔버스 마운트 보장)
    setTimeout(() => {
      canvasRef.current?.addSpeechBubble(text, role);
    }, 30);
  };

  // Header height measure for full-bleed editor
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState<number>(90);
  useEffect(() => {
    const measure = () => {
      const h = headerRef.current?.getBoundingClientRect().height || 90;
      setHeaderH(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      try { if (headerRef.current) ro.unobserve(headerRef.current); } catch {}
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className={containerClass}>
      <div className="w-full min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur dark:bg-slate-900/70" ref={headerRef}>
              <div className="w-full px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
              <div className="h-8 w-8 grid place-items-center rounded-lg bg-blue-600 text-white shadow-sm"><Bot className="h-4 w-4"/></div>
              <div>
                <div className="text-left text-sm font-semibold">AI Battery Analysis Console</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">세그먼트 라우팅 → SQL → 차트 → 트렌드 KPI → 리포트</div>
              </div>
            </div>
                <div className="flex items-center gap-3">
                  {/* 우측 정렬 탭 */}
                  <div className="mr-3 inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      className={`px-3 py-1.5 text-xs ${activeTab === "chat" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"}`}
                      onClick={() => setActiveTab("chat")}
                    >
                      Chat
                    </button>
                    <button
                      className={`px-3 py-1.5 text-xs border-l border-slate-200 dark:border-slate-700 ${activeTab === "canvas" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"}`}
                      onClick={() => setActiveTab("canvas")}
                    >
                      Editor
                    </button>
                  </div>
                  {null}
              <div className="flex items-center gap-2">
                <Label htmlFor="theme" className="text-xs">Dark</Label>
                <Switch id="theme" checked={isDark} onCheckedChange={setIsDark} />
                {isDark ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}
              </div>
             <div className="ml-3 flex items-center gap-2 text-xs">
               <span className={`inline-block h-2.5 w-2.5 rounded-full ${sseConnected ? "bg-emerald-500" : "bg-slate-300 animate-pulse"}`} />
               <span className={`select-none ${sseConnected ? "text-emerald-600" : "text-slate-500"}`}>
                 {sseConnected ? "SSE 연결됨" : "SSE 연결 중..."}
               </span>
             </div>
            </div>
          </div>
        </div>

        {/* Body */}
        {activeTab === "chat" ? (
          <div
            className="w-full px-6 py-5 grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px]"
          >
          {/* Left: Chat/Canvas + Steps */}
          <div className="flex flex-col gap-5 min-w-0">
            {/* Live Steps (chat 전용) */}
            {activeTab === "chat" && (
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                    {STEPS.map((s) => {
                      const state = stepState[s.key];
                      const active = state === "active";
                      const done = state === "done";
                      return (
                        <StepBadge
                          key={s.key}
                          active={active}
                          done={done}
                          label={s.label}
                          desc={s.desc}
                          icon={s.icon}
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "chat" && (
            <Card className="border-slate-200 dark:border-slate-800 h-[80vh] flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">대화</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
                <div className="mb-3 flex flex-wrap gap-2">
                  {examplePrompts.map((p, idx) => (
                    <Badge key={idx} variant="secondary" className="cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => setInput(p)}>
                      {p}
                    </Badge>
                  ))}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
                  {messages.length === 0 ? (
                    <div className="h-full grid place-items-center opacity-70">
                      <div className="text-center">
                        <div className="text-sm font-medium">메시지를 입력하고 Enter를 눌러 시작하세요.</div>
                        <div className="text-xs text-slate-500 mt-1">Ctrl/Cmd+Enter 전송 · 세션 {SESSION_ID.slice(0,8)}</div>
                      </div>
                    </div>
                  ) : (
          messages.map((m, i) => (
                      <Bubble
                        key={i}
                        role={m.role}
            onExport={m.role === "assistant" ? () => handleExportBubble(i) : undefined}
            onToCanvas={() => handleBubbleToCanvas(m.content, m.role, m.isMarkdown)}
                        innerRef={(node) => {
                          if (m.role === "assistant") bubbleRefs.current[i] = node as HTMLDivElement;
                        }}
                      >
                        {m.isMarkdown ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkBreaks]}
                            components={{
                              a: ({ href, children, ...props }: any) => <LinkOrChart href={href}>{children}</LinkOrChart>,
                              img: ({ src, alt }: any) => (
                                <img
                                  src={String(src)}
                                  alt={alt || "이미지"}
                                  className="mt-2 rounded-md border w-auto max-w-full object-contain bg-white block ml-0"
                                  style={{ maxHeight: `${CHAT_IMG_MAX_EM}em` }}
                                  referrerPolicy="no-referrer"
                                  crossOrigin="anonymous"
                                  loading="lazy"
                                />
                              ),
                              // ✅ 표: children을 포함해 실제 표 구조를 렌더 + 가독성 스타일
                              table: ({ node, ...props }: any) => (
                                <div className="my-2 overflow-x-auto">
                                  <table
                                    {...props}
                                    className="w-full text-left text-[13px] border-collapse"
                                  >
                                    {props.children}
                                  </table>
                                </div>
                              ),
                              thead: ({ node, ...props }: any) => (
                                <thead {...props} className="[&_th]:bg-slate-50 dark:[&_th]:bg-slate-800/60" />
                              ),
                              tr: ({ node, ...props }: any) => (
                                <tr {...props} className="border-b border-slate-200 dark:border-slate-700" />
                              ),
                              th: ({ node, ...props }: any) => (
                                <th
                                  {...props}
                                  className="px-2 py-1 font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-600"
                                />
                              ),
                              td: ({ node, ...props }: any) => (
                                <td
                                  {...props}
                                  className="px-2 py-1 align-top text-slate-800 dark:text-slate-100"
                                />
                              ),
                              code: ({ inline, className, children, ...props }: any) => (
                                <code {...props} className={`rounded bg-black/10 px-1.5 py-0.5 ${className || ""}`}>{children}</code>
                              ),
                              // 섹션 구분 강화
                              p: ({ node, ...props }: any) => <p {...props} className="text-left my-0" />,
                              ul: ({ node, ...props }: any) => <ul {...props} className="text-left my-1 list-disc pl-5" />,
                              ol: ({ node, ...props }: any) => <ol {...props} className="text-left my-1 list-decimal pl-5" />,
                              li: ({ node, ...props }: any) => <li {...props} className="text-left my-0" />,
                              h1: ({ node, ...props }: any) => <h1 {...props} className="text-left text-lg font-semibold mt-2 mb-1" />,
                              h2: ({ node, ...props }: any) => (
                                <h2
                                  {...props}
                                  className="text-left text-base font-semibold mt-3 pt-2 mb-1 border-t border-slate-200 dark:border-slate-700 first:mt-0 first:pt-0 first:border-0"
                                />
                              ),
                              h3: ({ node, ...props }: any) => (
                                <h3
                                  {...props}
                                  className="text-left font-semibold mt-3 pt-2 mb-1 border-t border-slate-200 dark:border-slate-700 first:mt-0 first:pt-0 first:border-0"
                                />
                              ),
                              br: () => <br />,
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        ) : (
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        )}
                      </Bubble>
                    ))
                  )}
                  {loading && (
                    // ← 변경: 생성중 + 옅은 진행 요약 표시
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 생성 중…
                      </div>
                      {progressContext && (
                        <div className="pl-6 text-slate-400">
                          {progressContext}
                        </div>
                      )}
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                <div className="mt-3 flex items-end gap-2">
                  <Input
                    className="flex-1"
                    placeholder="예) b1c9 700~820 사이클 요약해줘"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleSend();
                      } else if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={loading}
                  />
                  <Button onClick={handleSend} disabled={loading} className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 보내기
                  </Button>
                </div>
              </CardContent>
            </Card>
            )}
          </div>

          {/* Right: Summary + Links + Chart */}
          {activeTab === "chat" && (
            <div className="flex flex-col gap-5 min-w-0">
              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">분석 요약</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {messages.length ? (
                    <div className="space-y-2">
                      {(() => {
                        const last = [...messages].reverse().find((m) => m.role === "assistant");
                        if (!last) return <p className="text-slate-500">아직 요약할 내용이 없습니다.</p>;
                        const text = last.content.replace(/[#>*`\-]/g, "").split(/\n\n|\n/).slice(0, 2).join("\n");
                        return <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{text}</p>;
                      })()}

                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
                          const kp = Array.from(last.matchAll(/(slope\s*=\s*[-+eE0-9.]+|R²\s*=\s*[0-9.]+|mono\s*=\s*[0-9.]+%)/g)).map((m) => m[0]);
                          return kp.slice(0, 6).map((t, i) => (
                            <Badge key={i} variant="outline" className="bg-slate-100 dark:bg-slate-800">
                              {t}
                            </Badge>
                          ));
                        })()}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500">대화 후 요약이 여기에 표시됩니다.</p>
                  )}

                  {links && links.length > 0 && (
                    <div>
                      <div className="mb-1 font-medium">관련 링크</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {links.map((l, i) => (
                          <li key={i} className="truncate">
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                            >
                              <LinkIcon className="h-3.5 w-3.5" /> {l.title || l.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">시각화</CardTitle>
                    <Button size="sm" variant="secondary" className="h-7 px-2 text-xs dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500" onClick={openHistoryDashboardPopup}>
                      실험심층조회
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {chartUrls.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {chartUrls.map((u) => (
                        <div key={u} className="aspect-[16/9] w-full rounded-lg border bg-white dark:bg-slate-900 overflow-hidden grid place-items-center">
                          <img
                            src={u}
                            alt="분석 그래프"
                            className="w-full h-full object-contain select-none cursor-grab active:cursor-grabbing"
                            referrerPolicy="no-referrer"
                            crossOrigin="anonymous"
                            draggable
                            onDragStart={(e) => {
                              const payload = JSON.stringify({ url: u });
                              e.dataTransfer.setData("application/x-image", payload);
                              e.dataTransfer.setData("text/plain", u);
                            }}
                            onError={() => setChartUrls((prev) => prev.filter((x) => x !== u))}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">
                      그래프가 여기에 표시됩니다.<br /> QuickChart 전체 URL을 반환하도록 서버를 확인하세요.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          </div>
        ) : (
          // Editor: same 2-col grid as Chat. Left: canvas with top draggable bubble strip. Right: reuse summary/chart cards.
          <div
            className="w-full px-6 py-5 grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]"
            style={{ height: `calc(100vh - ${headerH}px)` }}
          >
            {/* Left: bubble strip + canvas */}
            <div className="min-w-0 h-full flex flex-col gap-3">
              {/* Compact bubble strip (latest few) */}
              <div className="shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex gap-2 items-stretch pr-1">
                  {messages.slice(-6).map((m, i) => {
                    const text = m.isMarkdown
                      ? markdownToPlain(m.content).slice(0, 120)
                      : m.content.slice(0, 120);
                    return (
                      <div
                        key={`strip-${i}`}
                        className={`px-2 py-1 rounded-lg text-xs border select-none cursor-grab active:cursor-grabbing ${
                          m.role === "user"
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                        }`}
                        draggable
                        onDragStart={(e) => {
                          const payload = JSON.stringify({ text: text, role: m.role });
                          e.dataTransfer.setData("application/x-bubble", payload);
                          e.dataTransfer.setData("text/plain", text);
                        }}
                        title={text}
                      >
                        {text || "(빈 메시지)"}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Canvas */}
              <div className="grow h-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 excalidraw-host">
                <ExcalidrawCanvas ref={canvasRef} theme={isDark ? "dark" : "light"} />
              </div>
            </div>

            {/* Right: chat history (narrower) + visualization image (draggable) */}
            <div className="hidden xl:flex flex-col gap-5 min-w-0">
              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">대화 기록</CardTitle>
                </CardHeader>
                <CardContent className="max-h-[48vh] overflow-y-auto pr-1">
                  <div className="flex flex-col gap-2">
                    {messages.length === 0 && (
                      <p className="text-slate-500 text-sm">아직 대화가 없습니다.</p>
                    )}
                    {messages.map((m, i) => {
                      const full = m.isMarkdown ? markdownToPlain(m.content) : m.content;
                      const preview = full.slice(0, 280);
                      return (
                        <div
                          key={`hist-${i}`}
                          className={`max-w-full px-2.5 py-1.5 rounded-xl text-xs border select-none cursor-grab active:cursor-grabbing ${
                            m.role === "user"
                              ? "bg-blue-600 text-white border-blue-500"
                              : "bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                          }`}
                          draggable
                          onDragStart={(e) => {
                            const payload = JSON.stringify({ text: full, role: m.role });
                            e.dataTransfer.setData("application/x-bubble", payload);
                            e.dataTransfer.setData("text/plain", full);
                          }}
                          title={full}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5 opacity-75">
                            {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                            <span className="text-[10px]">{m.role}</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words leading-snug">{preview}</div>
                          {full.length > preview.length && (
                            <div className="mt-0.5 text-[10px] opacity-60">… 더 끌어다 캔버스에 놓으면 전체가 들어갑니다</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">시각화</CardTitle>
                    <Button size="sm" variant="secondary" className="h-7 px-2 text-xs dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500" onClick={openHistoryDashboardPopup}>
                      실험심층조회
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {chartUrls.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {chartUrls.map((u) => (
                        <div key={u} className="aspect-[16/9] w-full rounded-lg border bg-white dark:bg-slate-900 overflow-hidden grid place-items-center">
                          <img
                            src={u}
                            alt="분석 그래프"
                            className="w-full h-full object-contain select-none cursor-grab active:cursor-grabbing"
                            referrerPolicy="no-referrer"
                            crossOrigin="anonymous"
                            draggable
                            onDragStart={(e) => {
                              const payload = JSON.stringify({ url: u });
                              e.dataTransfer.setData("application/x-image", payload);
                              e.dataTransfer.setData("text/plain", u);
                            }}
                            onError={() => setChartUrls((prev) => prev.filter((x) => x !== u))}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm text-center p-3">
                      드래그 가능한 그래프가 여기에 표시됩니다.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
