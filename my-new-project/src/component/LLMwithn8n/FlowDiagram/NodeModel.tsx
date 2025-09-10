// src/NodeModel.tsx
import {
  NodeModel as StormNodeModel,
  DefaultPortModel
} from "@projectstorm/react-diagrams";
import { BaseModelOptions } from "@projectstorm/react-canvas-core";

export interface NodeModelOptions extends BaseModelOptions {
  color?: string;
  title?: string;
  content?: string;
  source?: boolean;
  inputs?: string[];
  outputs?: string[];
  extras?: {
    functionCode?: string;
    parameters?: any;
  };
}

export class NodeModel extends StormNodeModel {
  color: string;
  title: string;
  content?: string;
  source: boolean;
  inputs: string[];
  outputs: string[];
  extras?: { functionCode?: string; parameters?: any };

  constructor(options: NodeModelOptions = {}) {
    super({ ...options, type: "ts-custom-node" });

    this.color = options.color || "White";
    this.title = options.title || "Node";
    this.content = options.content;
    this.source = !!options.source;
    this.inputs = options.inputs || [];
    this.outputs = options.outputs || [];
    this.extras = options.extras || {};

    if (this.inputs.length > 0 || this.outputs.length > 0) {
      this.inputs.forEach((name) => this.ensurePort(name, true));
      this.outputs.forEach((name) => this.ensurePort(name, false));
    } else {
      if (this.content && !this.source) this.ensurePort("In", true);
      if (this.content) this.ensurePort("Out", false);
    }
  }

  private ensurePort(name: string, isIn: boolean) {
    if (!name) return;
    if (!this.getPort(name)) {
      this.addPort(new DefaultPortModel({ in: isIn, name }));
    }
  }

  serialize() {
    const base = super.serialize();
    const pos = this.getPosition();
    return {
      ...base,
      color: this.color,
      title: this.title,
      content: this.content,
      source: this.source,
      inputs: this.inputs,
      outputs: this.outputs,
      extras: this.extras || {},
      position: { x: pos.x, y: pos.y }
    };
  }

  deserialize(event: any): void {
    super.deserialize(event);
    const d = event.data || {};
    this.color = d.color;
    this.title = d.title;
    this.content = d.content;
    this.source = !!d.source;
    this.inputs = d.inputs || [];
    this.outputs = d.outputs || [];
    this.extras = d.extras || {};

    if (d.position) this.setPosition(d.position.x || 0, d.position.y || 0);

    if (this.inputs.length > 0 || this.outputs.length > 0) {
      this.inputs.forEach((name: string) => this.ensurePort(name, true));
      this.outputs.forEach((name: string) => this.ensurePort(name, false));
    } else {
      if (this.content && !this.source) this.ensurePort("In", true);
      if (this.content) this.ensurePort("Out", false);
    }
  }
}
