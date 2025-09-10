import React, { useState } from "react";

export default function FunctionEditorModal({
  initialCode,
  onClose,
  onSave,
}: {
  initialCode: string;
  onClose: () => void;
  onSave: (code: string) => void;
}) {
  const [code, setCode] = useState(initialCode);

  return (
    <div
      style={{
        position: "fixed",
        top: "20%",
        left: "25%",
        width: "50%",
        backgroundColor: "white",
        border: "1px solid #aaa",
        padding: 20,
        zIndex: 9999,
        boxShadow: "0 0 10px #00000055",
      }}
    >
      <h3>🧠 Function Editor</h3>
      <textarea
        style={{ width: "100%", height: "200px", fontFamily: "monospace" }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div style={{ marginTop: 10, textAlign: "right" }}>
        <button onClick={() => onSave(code)} style={{ marginRight: 10 }}>
          💾 저장
        </button>
        <button onClick={onClose}>❌ 닫기</button>
      </div>
    </div>
  );
}
