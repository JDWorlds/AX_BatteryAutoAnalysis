// src/schemaAdapter.ts
import { DiagramEngine, DiagramModel, DefaultLinkModel } from "@projectstorm/react-diagrams";
import { NodeModel } from "./NodeModel";

type StepType =
  | "charge" | "discharge" | "rest" | "HPPC" | "RPT"
  | "loop" | "if" | "function" | "end";

export interface RecipeSchema {
  summary: string;
  recipe: {
    experiment_id: string;
    description: string;
    cell_info: {
      cell_id: string;
      chemistry: "NCM" | "LFP" | "LCO";
      capacity_mAh: number;
      manufacturer: string;
      form_factor: "pouch" | "cylindrical" | "prismatic";
    };
    global_conditions: {
      temperature: { initial: number; control: boolean };
      safety_limits: {
        voltage_min: number; voltage_max: number;
        current_max: number; temperature_max: number;
      };
    };
    flow: Array<{
      step_id: string;
      type: StepType;
      parameters: any;
      next_step?: string;
    }>;
  };
}

// 포트 표준 정의
const NODE_PORTS: Record<StepType, { inputs: string[]; outputs: string[] }> = {
  charge:    { inputs: ["In"], outputs: ["Out"] },
  discharge: { inputs: ["In"], outputs: ["Out"] },
  rest:      { inputs: ["In"], outputs: ["Out"] },
  HPPC:      { inputs: ["In"], outputs: ["Out"] },
  RPT:       { inputs: ["In"], outputs: ["Out"] },
  function:  { inputs: ["In"], outputs: ["Out", "internal_resistance?"] },
  if:        { inputs: ["In"], outputs: ["True", "False"] },
  loop:      { inputs: ["In"], outputs: ["LoopStart", "AfterLoop"] },
  end:       { inputs: ["In"], outputs: [] }
};

const NODE_STYLE: Record<StepType, { color: string; title: string }> = {
  charge:    { color: "#E3F2FD", title: "CHARGE" },
  discharge: { color: "#FFEBEE", title: "DISCHARGE" },
  rest:      { color: "#F1F8E9", title: "REST" },
  HPPC:      { color: "#FFF8E1", title: "HPPC" },
  RPT:       { color: "#FFF3E0", title: "RPT" },
  function:  { color: "#EDE7F6", title: "FUNCTION" },
  if:        { color: "#E8F5E9", title: "IF" },
  loop:      { color: "#ECEFF1", title: "LOOP" },
  end:       { color: "#F5F5F5", title: "END" }
};

function prettifyContent(step: RecipeSchema["recipe"]["flow"][number]) {
  const t = step.type;
  const p = step.parameters || {};
  if (t === "charge") return `CC-CV\nI=${p.current ?? "?"}, Vmax=${p.voltage_limit ?? "?"}`;
  if (t === "discharge") return `CC\nI=${p.current ?? "?"}, Vmin=${p.voltage_limit ?? "?"}`;
  if (t === "rest") return `duration=${p.duration ?? "?"}s`;
  if (t === "function") return `${p.function_name ?? "func"}(…)`;
  if (t === "if") return `${p.condition ?? "cond"}`;
  if (t === "loop") return `repeat=${p.repeat ?? "?"}\nstart=${p.loop_start ?? "?"}\nend=${p.loop_end ?? "?"}`;
  return "";
}

function createNode(step: RecipeSchema["recipe"]["flow"][number], x = 100, y = 100) {
  const base = NODE_STYLE[step.type];
  const ports = NODE_PORTS[step.type];

  const extras: any = { parameters: step.parameters || {} };
  if (step.type === "function") extras.functionCode = step.parameters?.code ?? "";

  // 🔧 setID() 대신 생성자 옵션으로 id 지정
  const node = new NodeModel({
    id: step.step_id,
    title: `${base.title} • ${step.step_id}`,
    content: prettifyContent(step),
    color: base.color,
    inputs: ports.inputs,
    outputs: ports.outputs,
    extras
  });

  const safeX = Number.isFinite(x) ? x : 100;
  const safeY = Number.isFinite(y) ? y : 100;
  node.setPosition(safeX, safeY);
  return node;
}

// 세로(Top→Bottom) 트리형 오토 레이아웃: 서브트리 너비 기반으로 가로 공간을 분배
function autoLayout(flow: RecipeSchema["recipe"]["flow"]) {
  const byId = Object.fromEntries(flow.map((s) => [s.step_id, s]));

  // children 관계 정의 (분기/루프 고려)
  const getChildren = (s: RecipeSchema["recipe"]["flow"][number]) => {
    const out: string[] = [];
    if (!s) return out;
    if (s.type === "if") {
      if (s.parameters?.true_next) out.push(String(s.parameters.true_next));
      if (s.parameters?.false_next) out.push(String(s.parameters.false_next));
      if (s.next_step) out.push(String(s.next_step)); // 합류가 명시된 경우
    } else if (s.type === "loop") {
      if (s.parameters?.loop_start) out.push(String(s.parameters.loop_start));
      if (s.parameters?.loop_end) out.push(String(s.parameters.loop_end));
      if (s.next_step) out.push(String(s.next_step));
    } else if (s.next_step) {
      out.push(String(s.next_step));
    }
    // 중복 제거
    return Array.from(new Set(out.filter(Boolean)));
  };

  // entry(시작점) 찾기: 참조되지 않은 step
  const referenced = new Set<string>();
  flow.forEach((s) => {
    const ch = getChildren(s);
    ch.forEach((id) => referenced.add(id));
  });
  const entries = flow.filter((s) => !referenced.has(s.step_id));

  // 서브트리 너비 계산 (사이클 방지)
  const widthCache = new Map<string, number>();
  function subtreeWidth(id: string, seen = new Set<string>()): number {
    if (!id || seen.has(id)) return 1; // 사이클 또는 없음 → 최소 폭
    if (widthCache.has(id)) return widthCache.get(id)!;
    seen.add(id);
    const s = byId[id];
    if (!s) { widthCache.set(id, 1); return 1; }
    const ch = getChildren(s).filter((c) => c !== id); // 자기 자신 참조 방지
    if (ch.length === 0) { widthCache.set(id, 1); return 1; }
    const sum = ch.map((c) => subtreeWidth(c, new Set(seen))).reduce((a, b) => a + b, 0);
    const w = Math.max(1, sum);
    widthCache.set(id, w);
    return w;
  }

  // 좌표 배치
  const STEP_X = 340;
  const STEP_Y = 220;
  const X0 = 120;
  const Y0 = 60;
  const positions: Record<string, { x: number; y: number }> = {};

  function layout(id: string, depth: number, left: number, stack: Set<string> = new Set()) {
    if (!id) return;
    if (positions[id]) return; // 이미 배치됨
    if (stack.has(id)) return; // 사이클 방지: 현재 경로에 이미 존재
    stack.add(id);

    const s = byId[id];
    const w = subtreeWidth(id);
    const ch = s ? getChildren(s) : [];
    const y = Y0 + depth * STEP_Y;

    if (!s || ch.length === 0) {
      // 리프: 중앙 점에 배치
      const center = left + (w - 1) / 2;
      positions[id] = { x: X0 + center * STEP_X, y };
      stack.delete(id);
      return;
    }

    // 자식들을 좌→우로 폭에 맞게 먼저 배치
    let cursor = left;
    const childCenters: number[] = [];
    for (const c of ch) {
      const cw = Math.max(1, subtreeWidth(c));
      // 하위로 진행, 사이클 방지용 스택 전달 (복사본)
      layout(c, depth + 1, cursor, new Set(stack));
      const cCenter = cursor + (cw - 1) / 2;
      childCenters.push(cCenter);
      cursor += cw; // 옆으로 이동
    }

    // 부모는 자식들의 중앙값에 위치
    const avgCenter = childCenters.reduce((a, b) => a + b, 0) / childCenters.length;
    positions[id] = { x: X0 + avgCenter * STEP_X, y };
    stack.delete(id);
  }

  const roots = (entries.length ? entries : flow);
  // 각 루트를 좌→우로 배치 (여러 entry가 있을 때 병렬 배치)
  let left = 0;
  for (const r of roots) {
    const w = Math.max(1, subtreeWidth(r.step_id));
    layout(r.step_id, 0, left, new Set());
    left += w + 1; // 루트 간 여백 1 유닛
  }

  // 안전망: 놓이지 않은 노드 보정
  flow.forEach((s, i) => {
    if (!positions[s.step_id]) {
      positions[s.step_id] = { x: X0 + (left + i) * STEP_X, y: Y0 + STEP_Y * 2 };
    }
  });

  return positions;
}

/** 스키마 → 다이어그램 */
export function importSchemaJson(engine: DiagramEngine, schema: RecipeSchema) {
  if (!schema || !schema.recipe || !Array.isArray(schema.recipe.flow) || schema.recipe.flow.length === 0) {
    throw new Error("flow가 비었습니다.");
  }

  const model = new DiagramModel();
  const flow = schema.recipe.flow;
  const coords = autoLayout(flow);

  const nmap: Record<string, NodeModel> = {};
  for (const s of flow) {
    const p = coords[s.step_id] || { x: 100, y: 100 };
    const node = createNode(s, p.x, p.y);
    model.addNode(node);
    nmap[s.step_id] = node;
  }

  const link = (from: string, fromPort: string, to: string, toPort = "In") => {
    const a = nmap[from], b = nmap[to];
    if (!a || !b) return;
    const sp = a.getPort(fromPort);
    const tp = b.getPort(toPort);
    if (!sp || !tp) return;
    try {
      // 링크 스타일: 포트에 따라 색상/커브 다르게
      const fromPos = a.getPosition();
      const toPos = b.getPosition();
      const dx = Math.abs((toPos?.x ?? 0) - (fromPos?.x ?? 0));
      const dy = Math.abs((toPos?.y ?? 0) - (fromPos?.y ?? 0));
      const baseCurve = 80;
      const curve = Math.min(240, baseCurve + Math.floor((dx + dy) / 8));
      const color = fromPort === "True" ? "#2e7d32" : fromPort === "False" ? "#c62828" : fromPort === "AfterLoop" ? "#1565c0" : "#666";
      const l = new DefaultLinkModel({ width: 2, color, curvyness: curve });
      l.setSourcePort(sp);
      l.setTargetPort(tp);
      model.addLink(l);
    } catch {}
  };

  for (const s of flow) {
    const id = s.step_id;
    if (s.type === "if") {
      if (s.parameters?.true_next)  link(id, "True",  s.parameters.true_next);
      if (s.parameters?.false_next) link(id, "False", s.parameters.false_next);
    } else if (s.type === "loop") {
      const start = s.parameters?.loop_start; const end = s.parameters?.loop_end;
      if (start) link(id, "LoopStart", start);
      if (end)   link(end, "Out", start); // 폐루프
      if (s.next_step) link(id, "AfterLoop", s.next_step);
    } else if (s.type !== "end") {
      if (s.next_step) link(id, "Out", s.next_step);
    }
  }

  engine.setModel(model);
  // 뷰포트 초기화 (NaN offset/zoom 방지)
  try {
    (model as any).setZoomLevel?.(100);
    (model as any).setOffset?.(0, 0);
  } catch {}
}

/** 다이어그램 → 스키마 */
export function exportSchemaJson(
  engine: DiagramEngine,
  BASE: Omit<RecipeSchema, "recipe"> & { recipe: Omit<RecipeSchema["recipe"], "flow"> }
): RecipeSchema {
  const model = engine.getModel();
  const rawNodes: any = model.getNodes();
  const rawLinks: any = model.getLinks();
  const nodes: NodeModel[] = Array.isArray(rawNodes) ? (rawNodes as NodeModel[]) : Object.values(rawNodes as Record<string, NodeModel>);
  const links: DefaultLinkModel[] = Array.isArray(rawLinks) ? (rawLinks as DefaultLinkModel[]) : Object.values(rawLinks as Record<string, DefaultLinkModel>);

  // id는 serialize().id 사용
  type OutEdge = { fromId: string; fromPort: string; toId: string; toPort: string };
  const edges: OutEdge[] = [];
  for (const l of links) {
    const s = l.getSourcePort(); const t = l.getTargetPort(); if (!s || !t) continue;
    const sn = s.getNode() as any; const tn = t.getNode() as any;
    const sid = sn.serialize().id; const tid = tn.serialize().id;
    edges.push({ fromId: sid, fromPort: s.getName(), toId: tid, toPort: t.getName() });
  }

  const outgoing: Record<string, OutEdge[]> = {};
  edges.forEach(e => { (outgoing[e.fromId] ||= []).push(e); });

  const flow = nodes.map((n) => {
    const s = (n.serialize ? n.serialize() : {}) as any;
    const id: string = s.id;
    const outs: string[] = s.outputs || [];
    const title: string = s.title || "";

    let type: StepType =
      title.startsWith("CHARGE")    ? "charge" :
      title.startsWith("DISCHARGE") ? "discharge" :
      title.startsWith("REST")      ? "rest" :
      title.startsWith("HPPC")      ? "HPPC" :
      title.startsWith("RPT")       ? "RPT" :
      title.startsWith("FUNCTION")  ? "function" :
      title.startsWith("IF")        ? "if" :
      title.startsWith("LOOP")      ? "loop" :
      title.startsWith("END")       ? "end" :
      (outs.includes("True") && outs.includes("False")) ? "if" :
      (outs.includes("LoopStart") && outs.includes("AfterLoop")) ? "loop" :
      outs.length === 0 ? "end" : "rest";

    const params = s.extras?.parameters ? { ...s.extras.parameters } : {};
    if (type === "function" && s.extras?.functionCode && !params.code) {
      params.code = s.extras.functionCode;
    }

    const o = outgoing[id] || [];
    const step: any = { step_id: id, type, parameters: params };

    if (type === "if") {
      const t = o.find(x => x.fromPort === "True");  if (t) step.parameters.true_next = t.toId;
      const f = o.find(x => x.fromPort === "False"); if (f) step.parameters.false_next = f.toId;
    } else if (type === "loop") {
      const start = o.find(x => x.fromPort === "LoopStart");
      const after = o.find(x => x.fromPort === "AfterLoop");
      if (start && !step.parameters.loop_start) step.parameters.loop_start = start.toId;
      if (after) step.next_step = after.toId;
      // loop_end는 (end→start) 폐루프를 추가 규칙으로 추정할 수 있음. 필요 시 구현.
    } else if (type !== "end") {
      const nx = o.find(x => x.fromPort === "Out");
      if (nx) step.next_step = nx.toId;
    }

    return step;
  });

  return {
    summary: BASE.summary,
    recipe: { ...BASE.recipe, flow }
  };
}
