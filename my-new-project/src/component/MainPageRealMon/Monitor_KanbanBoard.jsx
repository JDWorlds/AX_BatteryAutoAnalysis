import React, { useEffect, useRef } from "react";
import * as go from "gojs";

export default function KanbanBoard({ equipment }) {
  const diagramRef = useRef(null);

  useEffect(() => {
    const $ = go.GraphObject.make;

    const myDiagram = $(go.Diagram, diagramRef.current, {
      contentAlignment: go.Spot.TopLeft,
      layout: $(go.GridLayout, { wrappingColumn: 1, spacing: new go.Size(10, 10) }),
      "undoManager.isEnabled": true,
    });

    myDiagram.model = new go.GraphLinksModel(
      [
        { key: "Experiment", text: `실험: ${equipment.name}`, isGroup: true },
        { key: "Equipment", text: `설비 상태: ${equipment.status}`, isGroup: true },
        { key: "Data", text: `온도: ${equipment.temperature}°C`, isGroup: true },
        { key: "Analysis", text: `습도: ${equipment.humidity}%`, isGroup: true },
        { key: "Report", text: `진행률: ${equipment.progress}%`, isGroup: true },
      ],
      []
    );

    return () => {
      myDiagram.div = null;
    };
  }, [equipment]);

  return <div ref={diagramRef} style={{ width: "100%", height: "600px", border: "1px solid black" }} />;
}