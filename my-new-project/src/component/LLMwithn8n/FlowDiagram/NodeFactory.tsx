// src/.../NodeFactory.tsx
import { AbstractReactFactory } from "@projectstorm/react-canvas-core";
import { NodeModel } from "./NodeModel";
// ⬇️ 이 줄을 default import로 고쳐주세요
import NodeWidget from "./NodeWidget";
import React from "react";

export class NodeFactory extends AbstractReactFactory<NodeModel, any> {
  constructor() {
    super("ts-custom-node");
  }

  generateModel() {
    return new NodeModel({});
  }

  generateReactWidget(event: { model: NodeModel }) {
    return <NodeWidget engine={this.engine} node={event.model} />;
  }
}
