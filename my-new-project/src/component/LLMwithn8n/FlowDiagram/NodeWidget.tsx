import React, { useMemo, useRef } from "react";
import { PortWidget } from "@projectstorm/react-diagrams";
import { NodeModel } from "./NodeModel";
import { emitNodeDoubleClick } from "./NodeEditBus";
import { Input, Tooltip } from "antd";

type Props = {
  node: NodeModel;
  engine: any;
};

export default function NodeWidget({ node, engine }: Props) {
  // 줌 레벨에 따라 간소 렌더링
  const zoomLevel: number = (engine?.getModel?.().getZoomLevel?.() ?? 100) as number;
  const isCompact = zoomLevel < 80; // 줌이 낮으면 간소화

  // 모든 포트를 가져와서 in/out 분리
  const ports = Object.values((node as any).ports || {});
  const inPorts = ports.filter((p: any) => p?.getOptions?.().in === true);
  const outPorts = ports.filter((p: any) => p?.getOptions?.().in === false);

  // --- 스키마 타입 추론 (schemaAdapter와 동일한 규칙) ---
  type StepType =
    | "charge" | "discharge" | "rest" | "HPPC" | "RPT"
    | "loop" | "if" | "function" | "end";

  const stepType: StepType = useMemo(() => {
    const title = (node as any).title || "";
    const outs: string[] = (node as any).outputs || [];
    return title.startsWith("CHARGE")    ? "charge" :
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
  }, [node]);

  // 타입별 스타일 및 뱃지
  const typeStyle: Record<StepType, { badge: string; border: string }> = {
    charge:    { badge: "#1976d2", border: "#90caf9" },
    discharge: { badge: "#d32f2f", border: "#ef9a9a" },
    rest:      { badge: "#2e7d32", border: "#a5d6a7" },
    HPPC:      { badge: "#f57c00", border: "#ffe0b2" },
    RPT:       { badge: "#ef6c00", border: "#ffcc80" },
    function:  { badge: "#5e35b1", border: "#d1c4e9" },
    if:        { badge: "#388e3c", border: "#c8e6c9" },
    loop:      { badge: "#455a64", border: "#cfd8dc" },
    end:       { badge: "#616161", border: "#e0e0e0" },
  };

  const badgeColor = typeStyle[stepType].badge;
  const borderColor = typeStyle[stepType].border;
  const selected: boolean = (node as any).isSelected?.() || false;

  // 파라미터 가공 표시
  const params: any = (node as any).extras?.parameters || {};
  const functionCode: string | undefined = (node as any).extras?.functionCode;

  const renderBody = () => {
    if (isCompact) {
      // 간소 모드: 상세 내용/코드/파라미터 목록 생략
      return (
        <div style={{ fontSize: 12, color: "#444" }}>
          <div style={{ opacity: 0.7 }}>(compact)</div>
        </div>
      );
    }
    // 우선 content가 있다면 요약으로 표시
    const hasContent = !!(node as any).content;
    const content = (node as any).content as string | undefined;

    // 타입별 주요 필드 강조
    if (stepType === "charge") {
      return (
        <div>
          {hasContent && <div style={contentBoxStyle}>{content}</div>}
          <KV label="Current" value={params.current} />
          <KV label="Voltage Max" value={params.voltage_limit} />
          {params.duration && <KV label="Duration" value={`${params.duration}s`} />}
        </div>
      );
    }
    if (stepType === "discharge") {
      return (
        <div>
          {hasContent && <div style={contentBoxStyle}>{content}</div>}
          <KV label="Current" value={params.current} />
          <KV label="Voltage Min" value={params.voltage_limit} />
          {params.duration && <KV label="Duration" value={`${params.duration}s`} />}
        </div>
      );
    }
    if (stepType === "rest") {
      return (
        <div>
          {hasContent && <div style={contentBoxStyle}>{content}</div>}
          <KV label="Duration" value={params.duration ? `${params.duration}s` : undefined} />
        </div>
      );
    }
    if (stepType === "function") {
      return (
        <div>
          {hasContent && <div style={contentBoxStyle}>{content}</div>}
          <KV label="Function" value={params.function_name} />
          {functionCode && (
            <pre style={codeBoxStyle}>
              {String(functionCode).slice(0, 400)}{String(functionCode).length > 400 ? "\n…" : ""}
            </pre>
          )}
        </div>
      );
    }
    if (stepType === "if") {
      return (
        <div>
          <KV label="Condition" value={params.condition} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <Tag color="#2e7d32">True → {params.true_next || "?"}</Tag>
            <Tag color="#c62828">False → {params.false_next || "?"}</Tag>
          </div>
        </div>
      );
    }
    if (stepType === "loop") {
      return (
        <div>
          <KV label="Repeat" value={params.repeat} />
          <KV label="Start" value={params.loop_start} />
          <KV label="End" value={params.loop_end} />
        </div>
      );
    }
    // HPPC/RPT/End 등은 content와 params를 간단 출력
    return (
      <div>
        {hasContent && <div style={contentBoxStyle}>{content}</div>}
        {params && Object.keys(params).length > 0 && (
          <div style={paramListStyle}>
            {Object.entries(params).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "#555" }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{String(typeof v === "object" ? JSON.stringify(v) : v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const headerTitle = (node as any).title || "Node";
  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
      <div style={{ fontWeight: 700 }}>{headerTitle}</div>
      <span style={{
        fontSize: 10,
        color: "#fff",
        background: badgeColor,
        padding: "2px 6px",
        borderRadius: 12,
        letterSpacing: 0.4,
        textTransform: "uppercase"
      }}>{stepType}</span>
    </div>
  );

  const contentBoxStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap",
    fontSize: 12,
    background: "rgba(0,0,0,.03)",
    border: "1px dashed rgba(0,0,0,.15)",
    borderRadius: 6,
    padding: 6,
  marginBottom: 8,
  color: "#000",
  };

  const codeBoxStyle: React.CSSProperties = {
    fontSize: 11,
    background: "#0b1020",
    color: "#e6eaff",
    borderRadius: 6,
    padding: 8,
    overflow: "auto",
    maxHeight: 160,
  };

  const paramListStyle: React.CSSProperties = {
    borderTop: "1px solid rgba(0,0,0,.08)",
    paddingTop: 6,
    marginTop: 6,
    display: "grid",
    rowGap: 4
  };

  const Tag = ({ color, children }: { color: string; children: React.ReactNode }) => (
    <span style={{
      fontSize: 11,
      color: "#fff",
      background: color,
      borderRadius: 10,
      padding: "2px 6px"
    }}>{children}</span>
  );

  const KV = ({ label, value }: { label: string; value: any }) => (
    value === undefined || value === null ? null : (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
  <span style={{ color: "#000" }}>{label}</span>
  <span style={{ fontWeight: 600, color: "#000" }}>{String(value)}</span>
      </div>
    )
  );

  // --- 조건문/반복문: 플로우차트 스타일 렌더링 ---
  if (stepType === "if") {
    // 사이즈(정사각형) - extras.size.w/h 사용, 기본 160
    const sizeStored = (node as any).extras?.size;
    const defaultSide = 160;
    const side = (() => {
      const w = Number(sizeStored?.w) || defaultSide;
      const h = Number(sizeStored?.h) || defaultSide;
      const s = Math.max(100, Math.min(600, Math.min(w, h)));
      return s;
    })();
    const containerRef = useRef<HTMLDivElement>(null);
    const inPort = (node as any).getPort?.("In");
    const truePort = (node as any).getPort?.("True");
    const falsePort = (node as any).getPort?.("False");
    const paramsAny: any = (node as any).extras?.parameters || {};
    const condition: string = paramsAny.condition || "";
    const trueNext: string | undefined = paramsAny.true_next;
    const falseNext: string | undefined = paramsAny.false_next;
    const setCondition = (v: string) => {
      try {
        const extras = (node as any).extras || {};
        (node as any).extras = { ...extras, parameters: { ...(extras.parameters || {}), condition: v } };
        (node as any).content = v;
        engine.repaintCanvas();
      } catch {}
    };
    const onResizeMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = (e as any).clientX as number;
      const startY = (e as any).clientY as number;
      const rect = containerRef.current?.getBoundingClientRect();
      const startW = rect?.width || side;
      const startH = rect?.height || side;
      const onMove = (ev: MouseEvent) => {
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const newSide = Math.max(100, Math.min(600, Math.max(startW + dw, startH + dh)));
        const extras = (node as any).extras || {};
        (node as any).extras = { ...extras, size: { ...(extras.size || {}), w: newSide, h: newSide } };
        engine.repaintCanvas();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    return (
      <div ref={containerRef} style={{ position: "relative", width: side, height: side }} onDoubleClick={() => emitNodeDoubleClick(node)}>
        <svg width={side} height={side} style={{ display: "block" }}>
          <polygon
            points={`${side/2},0 ${side},${side/2} ${side/2},${side} 0,${side/2}`}
            fill={(node as any).color || "#fff"}
            stroke={borderColor}
            strokeWidth={2}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: "#000", pointerEvents: "none" }}>IF</div>
          {!isCompact && (
            <Tooltip title={condition} mouseEnterDelay={0.2}>
              <Input.TextArea
                size="small"
                placeholder="voltage <= 3.0"
                value={condition}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCondition(e.target.value)}
                autoSize={{ minRows: 1, maxRows: 3 }}
                style={{
                  maxWidth: side - 24,
                  fontSize: 12,
                  textAlign: "center",
                  lineHeight: 1.2,
                  overflow: "auto",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  color: "#000",
                  background: "#fff",
                }}
              />
            </Tooltip>
          )}
        </div>
        {/* In (Top) */}
        {inPort && (
          <div style={{ position: "absolute", top: -6, left: side/2 - 5, display: "flex", alignItems: "center", gap: 4 }}>
            <PortWidget engine={engine} port={inPort}>
              <div style={{ width: 10, height: 10, borderRadius: 10, background: "#555" }} />
            </PortWidget>
          </div>
        )}
        {/* False (Right) */}
        {falsePort && (
          <div style={{ position: "absolute", top: side/2 - 5, right: -6, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#c62828", background: "#ffcdd2", padding: "1px 6px", borderRadius: 10 }}>
              False{falseNext ? `: ${falseNext}` : ""}
            </span>
            <PortWidget engine={engine} port={falsePort}>
              <div style={{ width: 10, height: 10, borderRadius: 10, background: "#c62828" }} />
            </PortWidget>
          </div>
        )}
        {/* True (Bottom) */}
        {truePort && (
          <div style={{ position: "absolute", bottom: -6, left: side/2 - 5, display: "flex", alignItems: "center", gap: 6 }}>
            <PortWidget engine={engine} port={truePort}>
              <div style={{ width: 10, height: 10, borderRadius: 10, background: "#2e7d32" }} />
            </PortWidget>
            <span style={{ fontSize: 11, color: "#2e7d32", background: "#c8e6c9", padding: "1px 6px", borderRadius: 10 }}>
              True{trueNext ? `: ${trueNext}` : ""}
            </span>
          </div>
        )}
        {/* Resize handle (bottom-right) */}
        {selected && (
          <div
            onMouseDown={onResizeMouseDown}
            style={{
              position: "absolute",
              right: 2,
              bottom: 2,
              width: 12,
              height: 12,
              background: "#fff",
              border: "1px solid #999",
              borderRadius: 2,
              cursor: "nwse-resize",
              boxShadow: "0 1px 2px rgba(0,0,0,.15)",
            }}
          />
        )}
      </div>
    );
  }

  if (stepType === "loop") {
    // 사이즈(직사각형) - extras.size.w/h 사용, 기본 220x110
    const sizeStored = (node as any).extras?.size;
    const defaultW = 220;
    const defaultH = 110;
    const w = Math.max(160, Math.min(800, Number(sizeStored?.w) || defaultW));
    const h = Math.max(80, Math.min(600, Number(sizeStored?.h) || defaultH));
    const containerRef = useRef<HTMLDivElement>(null);
    const inPort = (node as any).getPort?.("In");
    const startPort = (node as any).getPort?.("LoopStart");
    const afterPort = (node as any).getPort?.("AfterLoop");
    const params: any = (node as any).extras?.parameters || {};
    const onResizeMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = (e as any).clientX as number;
      const startY = (e as any).clientY as number;
      const rect = containerRef.current?.getBoundingClientRect();
      const startW = rect?.width || w;
      const startH = rect?.height || h;
      const onMove = (ev: MouseEvent) => {
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const newW = Math.max(160, Math.min(800, startW + dw));
        const newH = Math.max(80, Math.min(600, startH + dh));
        const extras = (node as any).extras || {};
        (node as any).extras = { ...extras, size: { ...(extras.size || {}), w: newW, h: newH } };
        engine.repaintCanvas();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    return (
      <div ref={containerRef} style={{ position: "relative", width: w, height: h }} onDoubleClick={() => emitNodeDoubleClick(node)}>
        <div style={{
          position: "absolute", inset: 0, background: (node as any).color || "#fff",
          border: `2px solid ${borderColor}`, borderRadius: 16, boxShadow: "0 2px 6px rgba(0,0,0,.08)"
        }} />
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", pointerEvents: "none", padding: 8, color: "#000" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>LOOP</div>
          {!isCompact && (
      <div style={{ fontSize: 12, color: "#000", textAlign: "center" }}>
              <div>Repeat: <strong>{params.repeat ?? "?"}</strong></div>
              <div>Start: <strong>{params.loop_start ?? "?"}</strong> • End: <strong>{params.loop_end ?? "?"}</strong></div>
            </div>
          )}
        </div>
        {/* In (Top) */}
        {inPort && (
          <div style={{ position: "absolute", top: -6, left: w/2 - 5 }}>
            <PortWidget engine={engine} port={inPort}>
              <div style={{ width: 10, height: 10, borderRadius: 10, background: "#555" }} />
            </PortWidget>
          </div>
        )}
        {/* LoopStart (Bottom) */}
        {startPort && (
          <div style={{ position: "absolute", bottom: -6, left: w/2 - 5 }}>
            <PortWidget engine={engine} port={startPort}>
              <div style={{ width: 10, height: 10, borderRadius: 10, background: "#555" }} />
            </PortWidget>
          </div>
        )}
        {/* AfterLoop (Right) */}
        {afterPort && (
          <div style={{ position: "absolute", top: h/2 - 5, right: -6 }}>
            <PortWidget engine={engine} port={afterPort}>
              <div style={{ width: 10, height: 10, borderRadius: 10, background: "#1565c0" }} />
            </PortWidget>
          </div>
        )}
        {/* Resize handle (bottom-right) */}
        {selected && (
          <div
            onMouseDown={onResizeMouseDown}
            style={{
              position: "absolute",
              right: 4,
              bottom: 4,
              width: 12,
              height: 12,
              background: "#fff",
              border: "1px solid #999",
              borderRadius: 2,
              cursor: "nwse-resize",
              boxShadow: "0 1px 2px rgba(0,0,0,.15)",
            }}
          />
        )}
      </div>
    );
  }

  // --- 기본(직사각형 카드형) ---
  // 기본 카드형(직사각형) - 사이즈 적용 및 핸들
  const sizeStored = (node as any).extras?.size;
  const baseW = Math.max(160, Math.min(800, Number(sizeStored?.w) || (isCompact ? 160 : 220)));
  const baseH = Math.max(80, Math.min(600, Number(sizeStored?.h) || (isCompact ? 100 : 140)));
  const baseContainerRef = useRef<HTMLDivElement>(null);
  const onBaseResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = (e as any).clientX as number;
    const startY = (e as any).clientY as number;
    const rect = baseContainerRef.current?.getBoundingClientRect();
    const startW = rect?.width || baseW;
    const startH = rect?.height || baseH;
    const onMove = (ev: MouseEvent) => {
      const dw = ev.clientX - startX;
      const dh = ev.clientY - startY;
      const newW = Math.max(160, Math.min(800, startW + dw));
      const newH = Math.max(80, Math.min(600, startH + dh));
      const extras = (node as any).extras || {};
      (node as any).extras = { ...extras, size: { ...(extras.size || {}), w: newW, h: newH } };
      engine.repaintCanvas();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      style={{
        width: baseW,
        height: baseH,
        minWidth: 120,
        background: (node as any).color || "white",
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: 10,
        boxShadow: "0 2px 6px rgba(0,0,0,.08)",
        fontFamily: "inherit",
        overflow: "auto",
  position: "relative",
  color: "#000",
      }}
      ref={baseContainerRef}
      onDoubleClick={() => emitNodeDoubleClick(node)}
    >
      {header}
      {renderBody()}

      <div style={{ display: "flex", gap: 8 }}>
        {/* 입력 포트들 (왼쪽 정렬) */}
        <div style={{ flex: 1 }}>
          {inPorts.map((p: any, idx: number) => {
            if (!p) return null;
            const name = p.getName?.() ?? "";
            return (
              <div key={p.getID?.() || name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: isCompact ? 6 : 8, paddingTop: idx * 2 }}>
                <PortWidget engine={engine} port={p}>
                  <div style={{ width: 10, height: 10, borderRadius: 10, background: "#555" }} />
                </PortWidget>
                {!isCompact && <span style={{ fontSize: 12 }}>{name}</span>}
              </div>
            );
          })}
        </div>

        {/* 출력 포트들 (오른쪽 정렬) */}
        <div style={{ flex: 1 }}>
          {outPorts.map((p: any, idx: number) => {
            if (!p) return null;
            const name = p.getName?.() ?? "";
            return (
              <div key={p.getID?.() || name} style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginBottom: isCompact ? 6 : 8, paddingTop: idx * 2 }}>
                {!isCompact && <span style={{ fontSize: 12 }}>{name}</span>}
                <PortWidget engine={engine} port={p}>
                  <div style={{ width: 10, height: 10, borderRadius: 10, background: "#555" }} />
                </PortWidget>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resize handle (bottom-right) */}
      {selected && (
        <div
          onMouseDown={onBaseResizeMouseDown}
          style={{
            position: "absolute",
            right: 4,
            bottom: 4,
            width: 12,
            height: 12,
            background: "#fff",
            border: "1px solid #999",
            borderRadius: 2,
            cursor: "nwse-resize",
            boxShadow: "0 1px 2px rgba(0,0,0,.15)",
          }}
        />
      )}
    </div>
  );
}
