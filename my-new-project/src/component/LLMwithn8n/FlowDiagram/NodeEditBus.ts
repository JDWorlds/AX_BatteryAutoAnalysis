import type { NodeModel } from "./NodeModel";

type Handler = (node: NodeModel) => void;
let dblClickHandler: Handler | null = null;

export function onNodeDoubleClick(cb: Handler) {
  dblClickHandler = cb;
}

export function emitNodeDoubleClick(node: NodeModel) {
  try { dblClickHandler?.(node); } catch {}
}
