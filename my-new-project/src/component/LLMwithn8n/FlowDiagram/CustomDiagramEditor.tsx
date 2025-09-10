// src/CustomDiagramEditor.tsx
import React, { useRef, useEffect, useState } from "react";
import createEngine, { DiagramModel } from "@projectstorm/react-diagrams";
import { CanvasWidget } from "@projectstorm/react-canvas-core";
import { NodeModel } from "./NodeModel";
import { NodeFactory } from "./NodeFactory";
import { importSchemaJson, exportSchemaJson, RecipeSchema } from "./schemaAdapter";
import { Button, Card, Divider, Input, Space, Tooltip, Typography, theme, Modal, Segmented, Tag } from "antd";
import {
  CompassOutlined,
  CompressOutlined,
  ExpandOutlined,
  InboxOutlined,
  ExportOutlined,
  AimOutlined,
  ThunderboltOutlined,
  ArrowDownOutlined,
  CoffeeOutlined,
  ExperimentOutlined,
  DashboardOutlined,
  BranchesOutlined,
  ReloadOutlined,
  CodeOutlined,
  StopOutlined,
  FunctionOutlined,
} from "@ant-design/icons";
import { onNodeDoubleClick } from "./NodeEditBus";

const engine = createEngine();
engine.getNodeFactories().registerFactory(new NodeFactory());
const model = new DiagramModel();
engine.setModel(model);

// 외부에서 스키마를 다이어그램으로 주입하기 위한 유틸
export function applyRecipeSchema(schema: RecipeSchema) {
  try {
    importSchemaJson(engine, schema);
    // 캔버스가 아직 마운트되지 않았어도, 이후 마운트 시 모델이 반영됩니다.
    engine.repaintCanvas();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("applyRecipeSchema 실패", e);
  }
}

// 외부에서 특정 step_id 노드를 선택
export function selectNodeById(stepId: string): boolean {
  try {
    const m = engine.getModel();
    const nodes = Object.values(m.getNodes() as any) as any[];
    let found = false;
    // 기존 선택 해제
    nodes.forEach((n) => n.setSelected(false));
    for (const n of nodes) {
      const id = n?.serialize?.().id;
      if (id === stepId) {
        n.setSelected(true);
        found = true;
        break;
      }
    }
    engine.repaintCanvas();
    return found;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("selectNodeById 실패", e);
    return false;
  }
}

type StepType = "charge" | "discharge" | "rest" | "HPPC" | "RPT" | "loop" | "if" | "function" | "end";

type PaletteItem = {
  type: StepType;
  category: "Core" | "Logic" | "Measure" | "Function";
  config: { color: string; title: string; inputs: string[]; outputs: string[] };
};

const nodeTypes: PaletteItem[] = [
  { type: "charge",    category: "Core",    config: { color: "#E3F2FD", title: "CHARGE",    inputs: ["In"], outputs: ["Out"] } },
  { type: "discharge", category: "Core",    config: { color: "#FFEBEE", title: "DISCHARGE", inputs: ["In"], outputs: ["Out"] } },
  { type: "rest",      category: "Core",    config: { color: "#F1F8E9", title: "REST",      inputs: ["In"], outputs: ["Out"] } },
  { type: "end",       category: "Core",    config: { color: "#F5F5F5", title: "END",       inputs: ["In"], outputs: [] } },
  { type: "HPPC",      category: "Measure", config: { color: "#FFF8E1", title: "HPPC",      inputs: ["In"], outputs: ["Out"] } },
  { type: "RPT",       category: "Measure", config: { color: "#FFF3E0", title: "RPT",       inputs: ["In"], outputs: ["Out"] } },
  { type: "if",        category: "Logic",   config: { color: "#E8F5E9", title: "IF",        inputs: ["In"], outputs: ["True","False"] } },
  { type: "loop",      category: "Logic",   config: { color: "#ECEFF1", title: "LOOP",      inputs: ["In"], outputs: ["LoopStart","AfterLoop"] } },
  { type: "function",  category: "Function",config: { color: "#EDE7F6", title: "FUNCTION",  inputs: ["In"], outputs: ["Out","internal_resistance?"] } },
];

const CustomDiagramEditor = () => {
  const [jsonText, setJsonText] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState({});
  const [canvasPxHeight, setCanvasPxHeight] = useState<number | null>(null);
  const { token } = theme.useToken();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [editParams, setEditParams] = useState<Record<string, any>>({});
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [paletteFilter, setPaletteFilter] = useState<string | number>("All");

  // 팔레트 아이콘 매핑
  const renderTypeIcon = (t: StepType) => {
    const style = { fontSize: 18 } as React.CSSProperties;
    switch (t) {
      case "charge":
        return <ThunderboltOutlined style={{ ...style, color: "#f59e0b" }} />; // amber
      case "discharge":
        return <ArrowDownOutlined style={{ ...style, color: "#ef4444" }} />; // red
      case "rest":
        return <CoffeeOutlined style={{ ...style, color: "#10b981" }} />; // emerald
      case "HPPC":
        return <ExperimentOutlined style={{ ...style, color: "#fb923c" }} />; // orange
      case "RPT":
        return <DashboardOutlined style={{ ...style, color: "#f97316" }} />; // orange-dark
      case "if":
        return <BranchesOutlined style={{ ...style, color: "#22c55e" }} />; // green
      case "loop":
        return <ReloadOutlined style={{ ...style, color: "#64748b" }} />; // slate
      case "function":
        return (FunctionOutlined ? <FunctionOutlined style={{ ...style, color: "#8b5cf6" }} /> : <CodeOutlined style={{ ...style, color: "#8b5cf6" }} />);
      case "end":
        return <StopOutlined style={{ ...style, color: "#6b7280" }} />; // gray
      default:
        return <CodeOutlined style={style} />;
    }
  };

  const handleImportSchema = () => {
    try {
      const obj = JSON.parse(jsonText); // RecipeSchema
      importSchemaJson(engine, obj);
      // 캔버스 리렌더
      forceUpdate({});
      // eslint-disable-next-line no-alert
      alert("✅ 스키마 JSON import 완료");
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert("Import 실패: " + e.message);
    }
  };

  const handleExportSchema = () => {
    const BASE = {
      summary: "다이어그램 기반 내보내기",
      recipe: {
        experiment_id: "EXP_FROM_UI",
        description: "Exported from Diagram",
        cell_info: {
          cell_id: "Cell_X",
          chemistry: "NCM" as const,
          capacity_mAh: 5000,
          manufacturer: "LGES",
          form_factor: "pouch" as const
        },
        global_conditions: {
          temperature: { initial: 25, control: true },
          safety_limits: { voltage_min: 2.5, voltage_max: 4.25, current_max: 50, temperature_max: 45 }
        }
      }
    };
    const out = exportSchemaJson(engine, BASE);
    const text = JSON.stringify(out, null, 2);
    setJsonText(text);
    // eslint-disable-next-line no-alert
    alert("✅ 스키마 JSON export 완료");
  };

  // 뷰 컨트롤
  const handleZoomIn = () => {
    const m: any = engine.getModel();
    const z = (m.getZoomLevel?.() ?? 100) + 10;
    m.setZoomLevel?.(Math.min(300, z));
    engine.repaintCanvas();
  };
  const handleZoomOut = () => {
    const m: any = engine.getModel();
    const z = (m.getZoomLevel?.() ?? 100) - 10;
    m.setZoomLevel?.(Math.max(20, z));
    engine.repaintCanvas();
  };
  const handleResetView = () => {
    const m: any = engine.getModel();
    m.setZoomLevel?.(100);
    m.setOffset?.(0, 0);
    engine.repaintCanvas();
  };
  const handleFitToContent = () => {
    const container = canvasRef.current;
    if (!container) return;
    const m: any = engine.getModel();
    const nodes: any[] = Object.values(m.getNodes?.() || {});
    if (nodes.length === 0) return handleResetView();
    const bounds = nodes.reduce(
      (acc, n) => {
        const s = n.serialize?.() || {};
        const x = s.position?.x ?? 0;
        const y = s.position?.y ?? 0;
        const w = 220; // 추정 너비
        const h = 120; // 추정 높이
        acc.minX = Math.min(acc.minX, x);
        acc.minY = Math.min(acc.minY, y);
        acc.maxX = Math.max(acc.maxX, x + w);
        acc.maxY = Math.max(acc.maxY, y + h);
        return acc;
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    const pad = 60;
    const contentW = bounds.maxX - bounds.minX + pad * 2;
    const contentH = bounds.maxY - bounds.minY + pad * 2;
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    if (vw <= 0 || vh <= 0) return;
    const scaleX = (vw / contentW) * 100;
    const scaleY = (vh / contentH) * 100;
    const zoom = Math.max(20, Math.min(180, Math.min(scaleX, scaleY)));
    m.setZoomLevel?.(zoom);
    const offsetX = -bounds.minX + (vw / (zoom / 100) - (bounds.maxX - bounds.minX)) / 2;
    const offsetY = -bounds.minY + (vh / (zoom / 100) - (bounds.maxY - bounds.minY)) / 2;
    m.setOffset?.(offsetX, offsetY);
    engine.repaintCanvas();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer?.getData("node/type");
      const nodeDef = nodeTypes.find((n) => n.type === nodeType);
      if (!nodeDef) return;

      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      // 표준 스키마에 맞춘 step_id 입력 후, 타입별 포트/타이틀로 생성
      const stepId = prompt("step_id를 입력하세요", "S" + Math.floor(Math.random() * 1000))?.trim();
      if (!stepId) return;

      const node = new NodeModel({
        id: stepId,
        title: `${nodeDef.config.title} • ${stepId}`,
        content: "",
        color: nodeDef.config.color,
        inputs: nodeDef.config.inputs,
        outputs: nodeDef.config.outputs,
        extras: { parameters: {}, ...(nodeDef.type === "function" ? { functionCode: "" } : {}) }
      });

      node.setPosition(x, y);
      model.addNode(node);
      forceUpdate({});
    };

    canvas.addEventListener("dragover", (e) => e.preventDefault());
    canvas.addEventListener("drop", handleDrop);
    return () => {
      canvas.removeEventListener("drop", handleDrop);
    };
  }, []);

  // 캔버스 높이만 화면 크기에 맞추어 동적 계산
  useEffect(() => {
    const updateHeight = () => {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const pad = 16; // 하단 여유
      const h = Math.max(200, Math.floor(vh - rect.top - pad));
      setCanvasPxHeight(h);
      try { engine.repaintCanvas(); } catch {}
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.addEventListener("scroll", updateHeight, { passive: true } as any);
    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("scroll", updateHeight as any);
    };
  }, []);

  // 노드 더블클릭 → 파라미터 편집 모달
  useEffect(() => {
    onNodeDoubleClick((node) => {
      try {
        setSelectedNode(node);
        setSelectedId(node?.serialize?.().id || null);
        setEditParams(node?.serialize?.().extras?.parameters || {});
        setEditorOpen(true);
      } catch {}
    });
  }, []);

  // 선택 변화 감지 (간단 폴링)
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const m: any = engine.getModel();
        const nodes: any[] = Array.isArray(m.getNodes?.()) ? m.getNodes?.() : Object.values(m.getNodes?.() || {});
        const selected = nodes.find((n: any) => n.isSelected?.());
        const sid = selected ? (selected.serialize?.().id ?? selected.getID?.()) : null;
        if (sid !== selectedId) {
          setSelectedId(sid);
          setSelectedNode(selected || null);
          const params = selected?.serialize?.().extras?.parameters || {};
          setEditParams({ ...params });
        }
      } catch {}
    }, 250);
    return () => clearInterval(timer);
  }, [selectedId]);

  const stepTypeOf = (node: any): string => {
    if (!node) return "";
    const s = node.serialize?.() || {};
    const title: string = s.title || "";
    const outs: string[] = s.outputs || [];
    return title.startsWith("CHARGE")    ? "charge" :
           title.startsWith("DISCHARGE") ? "discharge" :
           title.startsWith("REST")      ? "rest" :
           title.startsWith("HPPC")      ? "HPPC" :
           title.startsWith("RPT")       ? "RPT" :
           title.startsWith("FUNCTION")  ? "function" :
           title.startsWith("IF")        ? "if" :
           title.startsWith("LOOP")      ? "loop" :
           title.startsWith("END")       ? "end" :
           (outs?.includes?.("True") && outs?.includes?.("False")) ? "if" :
           (outs?.includes?.("LoopStart") && outs?.includes?.("AfterLoop")) ? "loop" :
           outs?.length === 0 ? "end" : "rest";
  };

  const setParam = (k: string, v: any) => setEditParams((p) => ({ ...p, [k]: v }));
  const applyParams = () => {
    if (!selectedNode) return;
    try {
      const ser = selectedNode.serialize?.() || {};
      const extras = ser.extras || {};
      selectedNode.extras = { ...extras, parameters: { ...editParams } };
      // 타입별 요약 콘텐츠 갱신
      const t = stepTypeOf(selectedNode);
      const p = editParams || {};
      if (t === "charge") {
        (selectedNode as any).content = `CC-CV\nI=${p.current ?? "?"}, Vmax=${p.voltage_limit ?? "?"}`;
      } else if (t === "discharge") {
        (selectedNode as any).content = `CC\nI=${p.current ?? "?"}, Vmin=${p.voltage_limit ?? "?"}`;
      } else if (t === "rest") {
        (selectedNode as any).content = `duration=${p.duration ?? "?"}s`;
      } else if (t === "function") {
        (selectedNode as any).content = `${p.function_name ?? "func"}(…)`;
      } else if (t === "if") {
        (selectedNode as any).content = `${p.condition ?? "cond"}`;
      } else if (t === "loop") {
        (selectedNode as any).content = `repeat=${p.repeat ?? "?"}\nstart=${p.loop_start ?? "?"}\nend=${p.loop_end ?? "?"}`;
      }
      engine.repaintCanvas();
    } catch {}
  };

  return (
    <div style={{ display: "flex", height: "100%", gap: 12, padding: 12 }}>
      {/* 왼쪽 사이드바 - 트랜디 카드 스타일 */}
      <div style={{ width: 320, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card size="small" styles={{ body: { padding: 14 } }}>
          <Typography.Title level={5} style={{ margin: 0 }}>노드 팔레트</Typography.Title>
          <Divider style={{ margin: "10px 0" }} />
          <Segmented
            value={paletteFilter}
            onChange={setPaletteFilter}
            options={["All", "Core", "Logic", "Measure", "Function"]}
            style={{ marginBottom: 10 }}
          />
          <Space direction="vertical" style={{ width: "100%" }}>
            {nodeTypes
              .filter((n) => {
                if (paletteFilter === "All") return true;
                return n.category === paletteFilter;
              })
              .map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("node/type", item.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 12px",
                  border: `1px solid ${token.colorBorder}`,
                  borderRadius: 10,
                  background: token.colorBgElevated,
                  boxShadow: "0 1px 3px rgba(0,0,0,.06)",
                  cursor: "grab"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {renderTypeIcon(item.type)}
                  <div style={{ fontWeight: 600 }}>{item.config.title}</div>
                </div>
                <Tag color="blue">Drag</Tag>
              </div>
            ))}
          </Space>
        </Card>

        <Card size="small" styles={{ body: { padding: 14 } }}>
          <Typography.Title level={5} style={{ margin: 0 }}>스키마 I/O</Typography.Title>
          <Divider style={{ margin: "10px 0" }} />
          <Input.TextArea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            autoSize={{ minRows: 6, maxRows: 12 }}
            placeholder='여기에 "응답 JSON 스키마" 붙여넣고 Import'
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}
          />
          <Space style={{ marginTop: 10 }}>
            <Tooltip title="Import Schema">
              <Button icon={<InboxOutlined />} onClick={handleImportSchema}>Import</Button>
            </Tooltip>
            <Tooltip title="Export Schema">
              <Button icon={<ExportOutlined />} onClick={handleExportSchema}>Export</Button>
            </Tooltip>
          </Space>
        </Card>
      </div>

  {/* 가운데: 툴바 + 캔버스 */}
  <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card size="small" styles={{ body: { padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between" } }}>
          <Space>
            <Typography.Text strong>Diagram</Typography.Text>
          </Space>
          <Space>
            <Tooltip title="Zoom Out">
              <Button size="small" icon={<CompressOutlined />} onClick={handleZoomOut} />
            </Tooltip>
            <Tooltip title="Zoom In">
              <Button size="small" icon={<ExpandOutlined />} onClick={handleZoomIn} />
            </Tooltip>
            <Tooltip title="Fit to Content">
              <Button size="small" icon={<CompassOutlined />} onClick={handleFitToContent} />
            </Tooltip>
            <Tooltip title="Reset View">
              <Button size="small" icon={<AimOutlined />} onClick={handleResetView} />
            </Tooltip>
          </Space>
        </Card>

        <div
          ref={canvasRef}
          style={{
            flex: 1,
            width: "100%",
            height: canvasPxHeight ? `${canvasPxHeight}px` : "100%",
            // 화면 배경과 구분감을 주기 위해 베이스 배경 + 그리드 점 오버레이
            backgroundColor: token.colorBgContainer,
            backgroundImage: `radial-gradient(circle at 25px 25px, ${token.colorBorderSecondary} 2px, transparent 2px)`,
            backgroundSize: "40px 40px",
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ width: "100%", height: "100%", backdropFilter: "saturate(105%)" }}>
            <CanvasWidget engine={engine} className="diagram-container" />
          </div>
        </div>
      </div>

      {/* 오른쪽 인스펙터를 없애고, 더블클릭 모달 사용 */}

      {/* 파라미터 편집 모달 */}
      <Modal
        title={selectedNode ? `Edit Params • ${selectedNode.serialize?.().id || ""}` : "Edit Params"}
        open={editorOpen}
        onOk={() => { applyParams(); setEditorOpen(false); }}
        onCancel={() => setEditorOpen(false)}
        okText="Apply"
        cancelText="Cancel"
        width={720}
      >
        {!selectedNode ? (
          <Typography.Text type="secondary">노드를 선택하세요.</Typography.Text>
        ) : (
          <>
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Typography.Text type="secondary">Type</Typography.Text>
                <Input value={stepTypeOf(selectedNode)} disabled />
              </div>
            </Space>
            <Divider style={{ margin: "12px 0" }} />
            {(() => {
              const t = stepTypeOf(selectedNode);
              if (t === "charge" || t === "discharge") {
                return (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <div>
                      <Typography.Text type="secondary">method (예: {t === "charge" ? "CC-CV" : "CC"})</Typography.Text>
                      <Input placeholder={t === "charge" ? "CC-CV" : "CC"} value={editParams.method ?? ""} onChange={(e) => setParam("method", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">current (예: 1.5 A)</Typography.Text>
                      <Input placeholder="1.5" addonAfter="A" value={editParams.current ?? ""} onChange={(e) => setParam("current", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">voltage_limit (예: {t === "charge" ? "4.20 V" : "2.80 V"})</Typography.Text>
                      <Input placeholder={t === "charge" ? "4.20" : "2.80"} addonAfter="V" value={editParams.voltage_limit ?? ""} onChange={(e) => setParam("voltage_limit", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">duration (예: 600 s)</Typography.Text>
                      <Input placeholder="600" addonAfter="s" value={editParams.duration ?? ""} onChange={(e) => setParam("duration", e.target.value)} />
                    </div>
                  </Space>
                );
              }
              if (t === "rest") {
                return (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <div>
                      <Typography.Text type="secondary">duration (예: 300 s)</Typography.Text>
                      <Input placeholder="300" addonAfter="s" value={editParams.duration ?? ""} onChange={(e) => setParam("duration", e.target.value)} />
                    </div>
                  </Space>
                );
              }
              if (t === "function") {
                return (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <div>
                      <Typography.Text type="secondary">function_name (예: calculate_IR)</Typography.Text>
                      <Input placeholder="calculate_IR" value={editParams.function_name ?? ""} onChange={(e) => setParam("function_name", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">code (예: 파이썬/수식 코드)</Typography.Text>
                      <Input.TextArea placeholder={`# e.g.\n# def calculate_IR(data):\n#     return ...`} value={editParams.code ?? ""} onChange={(e) => setParam("code", e.target.value)} autoSize={{ minRows: 6, maxRows: 12 }} />
                    </div>
                  </Space>
                );
              }
              if (t === "if") {
                return (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <div>
                      <Typography.Text type="secondary">condition (예: voltage ≤ 3.0)</Typography.Text>
                      <Input placeholder="voltage <= 3.0" value={editParams.condition ?? ""} onChange={(e) => setParam("condition", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">true_next (예: S10)</Typography.Text>
                      <Input placeholder="S10" value={editParams.true_next ?? ""} onChange={(e) => setParam("true_next", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">false_next (예: S11)</Typography.Text>
                      <Input placeholder="S11" value={editParams.false_next ?? ""} onChange={(e) => setParam("false_next", e.target.value)} />
                    </div>
                  </Space>
                );
              }
              if (t === "loop") {
                return (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <div>
                      <Typography.Text type="secondary">repeat (예: 5)</Typography.Text>
                      <Input placeholder="5" value={editParams.repeat ?? ""} onChange={(e) => setParam("repeat", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">loop_start (예: S2)</Typography.Text>
                      <Input placeholder="S2" value={editParams.loop_start ?? ""} onChange={(e) => setParam("loop_start", e.target.value)} />
                    </div>
                    <div>
                      <Typography.Text type="secondary">loop_end (예: S7)</Typography.Text>
                      <Input placeholder="S7" value={editParams.loop_end ?? ""} onChange={(e) => setParam("loop_end", e.target.value)} />
                    </div>
                  </Space>
                );
              }
              return (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Typography.Text type="secondary">parameters (JSON)</Typography.Text>
                  <Input.TextArea
                    value={JSON.stringify(editParams, null, 2)}
                    onChange={(e) => {
                      try {
                        const v = JSON.parse(e.target.value);
                        setEditParams(v);
                      } catch {}
                    }}
                    autoSize={{ minRows: 8, maxRows: 16 }}
                  />
                </Space>
              );
            })()}
          </>
        )}
      </Modal>
    </div>
  );
};

export default CustomDiagramEditor;
