import React from "react";

export default function GraphSection() {
  return (
    <div className="flex-1 bg-gray-100 p-6">
      <h2 className="text-2xl font-bold mb-4">Graph Section</h2>
      <div className="bg-white shadow rounded p-4 h-full">
        {/* 여기에 그래프 라이브러리를 사용하여 그래프를 렌더링 */}
        <p>그래프가 여기에 표시됩니다.</p>
      </div>
    </div>
  );
}