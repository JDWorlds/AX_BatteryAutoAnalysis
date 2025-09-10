import React, { useState } from "react";
import GraphPanel from "../SimulationDash/GraphPanel";
import DataSelector from "../GraphComponent/DataSelector"; // DataSelector 컴포넌트 가져오기
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css"; // ResizableBox 기본 스타일 가져오기

export default function GraphDisplay({ selectedEquipment, onDownloadExcel, onYAxisDoubleClick }) {
  const [graphs, setGraphs] = useState([]); // 여러 그래프를 관리하는 상태

  if (!selectedEquipment) {
    return <div className="text-center text-gray-500">설비를 선택하면 그래프가 표시됩니다.</div>;
  }

  const handleMetricSelect = (metrics) => {
    // 새로운 그래프 추가
    setGraphs((prevGraphs) => [
      ...prevGraphs,
      {
        id: prevGraphs.length + 1, // 그래프 ID
        metrics, // 선택된 메트릭
      },
    ]);
  };

  const graphData = selectedEquipment.temperature.map((temp, index) => ({
    time: `시간 ${index + 1}`,
    temperature: temp,
    humidity: selectedEquipment.humidity[index],
  }));

  return (
    <div className="mt-4 bg-gray-800 shadow-md rounded p-4 flex text-white"> {/* 배경색과 텍스트 색상 조정 */}
      {/* 왼쪽: 그래프 영역 */}
      <div className="flex-grow-[8] pr-4">
        <h2 className="text-lg font-bold mb-4 text-gray-200">{selectedEquipment.name} - 실시간 그래프</h2>
        <div className="grid grid-cols-2 gap-4">
          {graphs.map((graph) => (
            <ResizableBox
              key={graph.id}
              width={600} // 초기 너비
              height={500} // 초기 높이
              minConstraints={[300, 200]} // 최소 크기
              maxConstraints={[1200, 800]} // 최대 크기
              resizeHandles={["se"]} // 오른쪽 아래 모서리에서 크기 조절 가능
              className="bg-gray-700 shadow-md rounded p-3" // 카드 배경색과 스타일 조정
            >
              <GraphPanel
                graphs={[
                  { id: graph.id, title: `그래프 ${graph.id}`, metrics: graph.metrics.map((m) => m.key) },
                ]}
                data={graphData}
                metrics={graph.metrics.map((m) => ({
                  key: m.key,
                  label: `${m.key} (${m.unit})`,
                  color: m.key === "temperature" ? "red" : "blue",
                  yAxisId: m.key === "temperature" ? "left" : "right",
                }))}
                yAxisSettings={{
                  temperature: { min: 20, max: 40, interval: 5 },
                  humidity: { min: 50, max: 80, interval: 5 },
                }}
                onDownloadExcel={onDownloadExcel}
                onYAxisDoubleClick={onYAxisDoubleClick}
              />
            </ResizableBox>
          ))}
        </div>
      </div>

      {/* 오른쪽: 데이터 선택 및 단위 설정 */}
      <div className="flex-grow-[2] bg-gray-700 shadow-md rounded p-4"> {/* 배경색과 스타일 조정 */}
        <DataSelector
          availableMetrics={[
            { key: "temperature", label: "온도" },
            { key: "humidity", label: "습도" },
          ]}
          onMetricSelect={(metrics) => handleMetricSelect(metrics)}
        />
      </div>
    </div>
  );
}