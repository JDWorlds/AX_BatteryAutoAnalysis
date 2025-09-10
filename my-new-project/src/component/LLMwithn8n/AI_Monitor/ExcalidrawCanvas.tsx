import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export type ExcalidrawCanvasHandle = {
  addSpeechBubble: (text: string, role?: "user" | "assistant", pos?: { x: number; y: number }) => void;
  addImageFromUrl: (url: string, pos?: { x: number; y: number }) => void;
  convertAllTextToHelvetica: () => void;
};

function rand() {
  return Math.floor(Math.random() * 2 ** 31);
}

type Props = { className?: string; theme?: "light" | "dark" };

const ExcalidrawCanvas = forwardRef<ExcalidrawCanvasHandle, Props>(function ExcalidrawCanvas(
  { className, theme = "light" },
  ref,
) {
  const apiRef = useRef<any>(null);
  const nextPosRef = useRef<{ x: number; y: number }>({ x: 80, y: 80 });
  const readyRef = useRef<boolean>(false);

  // CSS is imported above per integration docs.

  useImperativeHandle(ref, () => ({
    addSpeechBubble: (text: string, role: "user" | "assistant" = "assistant", pos?: { x: number; y: number }) => {
      // Defer until Excalidraw is ready to avoid setState during render
      if (!apiRef.current || !readyRef.current) {
        setTimeout(() => {
          if (!apiRef.current || !readyRef.current) return;
          // re-enter once ready
          (ref as any)?.current?.addSpeechBubble?.(text, role);
        }, 0);
        return;
      }
      const api = apiRef.current;
      const scene = api.getSceneElements?.() || [];

      const padding = 16;
      const lineHeight = 22;
      const maxWidth = 360;
      const lines = text.split(/\r?\n/).filter(Boolean);
      const estWidth = Math.min(maxWidth, Math.max(...lines.map((l) => l.length)) * 8 + padding * 2);
      const estHeight = Math.max(54, lines.length * lineHeight + padding * 2);

  const { x, y } = pos || nextPosRef.current;
      const bg = role === "user" ? "#2563eb" : "#ffffff"; // blue / white
      const stroke = role === "user" ? "#1e40af" : "#0f172a"; // darker blue / slate-900
      const textColor = role === "user" ? "#ffffff" : "#111827";

      const rectId = `rect-${rand()}`;
      const textId = `text-${rand()}`;
      const ts = Date.now();

      const rect: any = {
        id: rectId,
        type: "rectangle",
        x: x - estWidth / 2,
        y: y - estHeight / 2,
        width: estWidth,
        height: estHeight,
        angle: 0,
        strokeColor: stroke,
        backgroundColor: bg,
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        roundness: { type: 3 },
        version: 1,
        versionNonce: rand(),
        isDeleted: false,
        groupIds: [],
        boundElements: [],
        updated: ts,
        seed: rand(),
        locked: false,
      };

      const textEl: any = {
        id: textId,
        type: "text",
        x: x - estWidth / 2 + padding,
        y: y - estHeight / 2 + padding,
        width: estWidth - padding * 2,
        height: estHeight - padding * 2,
        angle: 0,
        strokeColor: textColor,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        version: 1,
        versionNonce: rand(),
        isDeleted: false,
        groupIds: [],
        boundElements: [],
        updated: ts,
        seed: rand(),
        locked: false,
        text,
        fontSize: 18,
  // 2 = Helvetica in Excalidraw's font enum; mapped via @font-face to LGSmart
  fontFamily: 2,
        textAlign: "left",
        verticalAlign: "top",
        baseline: 18,
        // Bind the text to the rectangle for proper wrapping inside the container
        containerId: rectId,
        originalText: text,
        lineHeight: 1.25,
      };

      // Link text as a bound element of the rectangle
      rect.boundElements = [...(rect.boundElements || []), { id: textId, type: "text" }];

  api.updateScene?.({ elements: [...scene, rect, textEl] });

      // Next position update (flowing down)
      // Update next position only when not explicitly positioned by drop
  if (!pos) nextPosRef.current = { x, y: y + estHeight / 2 + 24 };
  },
    addImageFromUrl: async (url: string, pos?: { x: number; y: number }) => {
      if (!apiRef.current || !readyRef.current) {
        setTimeout(() => (ref as any)?.current?.addImageFromUrl?.(url), 0);
        return;
      }
      try {
        // fetch image and convert to dataURL
        const res = await fetch(url, { mode: "cors" });
        const blob = await res.blob();
        const dataURL: string = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onerror = () => reject(new Error("read fail"));
          fr.onload = () => resolve(String(fr.result || ""));
          fr.readAsDataURL(blob);
        });

        // compute dimensions
        const imgDims: { w: number; h: number } = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const maxW = 480;
            const scale = img.width > maxW ? maxW / img.width : 1;
            resolve({ w: Math.max(24, Math.round(img.width * scale)), h: Math.max(24, Math.round(img.height * scale)) });
          };
          img.onerror = () => resolve({ w: 320, h: 180 });
          img.src = URL.createObjectURL(blob);
        });

        const api = apiRef.current;
        const scene = api.getSceneElements?.() || [];
        const fileId = `file-${rand()}`;
        api.addFiles?.([
          {
            id: fileId,
            dataURL,
            mimeType: blob.type || "image/png",
          },
        ]);

  const { x, y } = pos || nextPosRef.current;
        const ts = Date.now();
        const imgEl: any = {
          id: `img-${rand()}`,
          type: "image",
          x: x - imgDims.w / 2,
          y: y - imgDims.h / 2,
          width: imgDims.w,
          height: imgDims.h,
          angle: 0,
          fileId,
          status: "saved",
          strokeColor: "transparent",
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          version: 1,
          versionNonce: rand(),
          isDeleted: false,
          groupIds: [],
          boundElements: [],
          updated: ts,
          seed: rand(),
          locked: false,
        };

  api.updateScene?.({ elements: [...scene, imgEl] });
  if (!pos) nextPosRef.current = { x, y: y + imgDims.h / 2 + 24 };
      } catch (e) {
        // fallback: add URL as text bubble
  (ref as any)?.current?.addSpeechBubble?.(url, "assistant", pos);
      }
    },
    convertAllTextToHelvetica: () => {
      if (!apiRef.current || !readyRef.current) return;
      const api = apiRef.current;
      const scene = api.getSceneElements?.() || [];
      const converted = scene.map((el: any) => {
        if (el?.type === "text" && el.fontFamily !== 2) {
          return { ...el, fontFamily: 2, version: (el.version || 0) + 1, versionNonce: rand(), updated: Date.now() };
        }
        return el;
      });
      api.updateScene?.({ elements: converted });
    },
  }));

  const excalidraw = useMemo(
    () => (
  <Excalidraw
        initialData={{ appState: { currentItemFontFamily: 2 } }}
        excalidrawAPI={(api: any) => {
          apiRef.current = api;
          // Mark ready on next frame after mount to ensure we don't update during render
          readyRef.current = false;
          requestAnimationFrame(() => {
            const ensureFonts = async () => {
              try {
                // Preload Helvetica mapped to LGSmart so canvas measures/render use it
                await Promise.all([
                  (document as any).fonts.load('400 16px Helvetica'),
                  (document as any).fonts.load('700 16px Helvetica'),
                ]);
              } catch {}
              readyRef.current = true;
              try {
                api.updateScene?.({ appState: { currentItemFontFamily: 2 } });
              } catch {}
            };
            ensureFonts();
          });
        }}
  theme={theme}
        
        UIOptions={{
          dockedSidebarBreakpoint: 768,
          canvasActions: {
            changeViewBackgroundColor: true,
            loadScene: true,
      saveToActiveFile: true,
      clearCanvas: true,
            export: { saveFileToDisk: true },
      saveAsImage: true,
      toggleTheme: null,
          },
        }}
    zenModeEnabled={false}
    viewModeEnabled={false}
      />
    ),
  [theme],
  );

  return (
    <div
      className={className}
      style={{ height: "100%", width: "100%" }}
      onDragOver={(e) => {
        const types = Array.from(e.dataTransfer?.types || []);
        if (types.includes("application/x-bubble") || types.includes("application/x-image") || types.includes("text/plain")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        try {
          e.preventDefault();
          // Compute drop position in scene coords
          const api = apiRef.current;
          let dropPos: { x: number; y: number } | undefined = undefined;
          if (api && readyRef.current) {
            const container = e.currentTarget as HTMLDivElement;
            const appState = api.getAppState?.() || {} as any;
            const zoom = (appState.zoom && (appState.zoom.value ?? appState.zoom)) || 1;
            const scrollX = appState.scrollX || 0;
            const scrollY = appState.scrollY || 0;
            // Prefer the actual canvas rect for precise positioning
            const canvasEl = container.querySelector('.excalidraw__canvas') as HTMLCanvasElement | null;
            const baseRect = (canvasEl || container).getBoundingClientRect();
            const useOffsets = !canvasEl; // only apply appState offsets when we don't have the canvas rect
            const offsetLeft = (useOffsets && (appState.offsetLeft || 0)) || 0;
            const offsetTop = (useOffsets && (appState.offsetTop || 0)) || 0;
            const relX = e.clientX - baseRect.left - offsetLeft;
            const relY = e.clientY - baseRect.top - offsetTop;
            // viewport -> scene: scene = (viewport/zoom) - scroll
            dropPos = { x: relX / zoom - scrollX, y: relY / zoom - scrollY };
          }
          const payload = e.dataTransfer.getData("application/x-bubble");
          if (payload) {
            const { text, role } = JSON.parse(payload || "{}");
            if (text) {
              (ref as any)?.current?.addSpeechBubble?.(String(text), role === "user" ? "user" : "assistant", dropPos);
              return;
            }
          }
          const imgPayload = e.dataTransfer.getData("application/x-image");
          if (imgPayload) {
            const { url } = JSON.parse(imgPayload || "{}");
            if (url) {
              (ref as any)?.current?.addImageFromUrl?.(String(url), dropPos);
              return;
            }
          }
          const txt = e.dataTransfer.getData("text/plain");
          if (txt) {
            // if looks like an image URL, try to add as image, else as text
            if (/\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(txt)) {
              (ref as any)?.current?.addImageFromUrl?.(String(txt), dropPos);
            } else {
              (ref as any)?.current?.addSpeechBubble?.(String(txt), "assistant", dropPos);
            }
          }
        } catch {}
      }}
    >
      {excalidraw}
    </div>
  );
});

export default ExcalidrawCanvas;
