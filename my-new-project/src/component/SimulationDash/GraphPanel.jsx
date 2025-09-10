import React, { useState } from "react";
import * as XLSX from "xlsx";
import { downloadExcel } from "./xlsx"; // 엑셀 다운로드 함수 가져오기
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function GraphPanel({
  graphs,
  data,
  metrics,
  yAxisSettings,
  onYAxisDoubleClick,
}) {
  const [interpolationType, setInterpolationType] = useState("monotone"); // 기본 보간 방식 설정

  const handleInterpolationChange = (event) => {
    setInterpolationType(event.target.value); // 사용자가 선택한 보간 방식 업데이트
  };

  const handleDownloadExcel = () => {
    downloadExcel(graphs, data); // 엑셀 다운로드 함수 호출
  };

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-6"
      style={{ height: "100%", width: "100%" }} // 부모 컨테이너의 높이와 너비를 명확히 설정
    >
      {graphs.map((graph) => (
        <div
          key={graph.id}
          className="bg-white rounded shadow"
          //style={{ height: "100%", width: "100%" }} // 자식 컨테이너의 크기 설정
        >
          <div className="flex justify-between items-center mb-2 px-4">
            <h2 className="text-xl font-semibold text-black">{graph.title || `그래프 ${graph.id}`}</h2>
            <div className="flex items-center gap-2">
              <select
                value={interpolationType}
                onChange={handleInterpolationChange}
                className="px-2 py-1 border rounded text-sm bg-white text-black"
              >
                <option value="monotone">Monotone (부드러운 곡선)</option>
                <option value="linear">Linear (직선)</option>
                <option value="step">Step (계단식)</option>
                <option value="stepBefore">Step Before (이전 값 기준)</option>
                <option value="stepAfter">Step After (다음 값 기준)</option>
                <option value="basis">Basis (자연스러운 곡선)</option>
                <option value="cardinal">Cardinal (제어점 곡선)</option>
                <option value="catmullRom">Catmull-Rom (스플라인 곡선)</option>
              </select>
              <button
                onClick={handleDownloadExcel}
                className="px-3 py-1 bg-green-500 text-white text-sm rounded shadow hover:bg-green-600 transition"
              >
                엑셀 다운로드
              </button>
            </div>
          </div>
          <div className="w-full h-[700px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} style={{backgroundColor: "#ffffff"}}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                {graph.metrics.map((metricKey) => {
                  const metric = metrics.find((m) => m.key === metricKey);
                  const color = metric.color || "#4a4a4a";
                  const settings = yAxisSettings[metricKey] || {};
                  const ticks = [];
                  if (
                    settings.min !== undefined &&
                    settings.max !== undefined &&
                    settings.interval !== undefined &&
                    settings.interval > 0
                  ) {
                    for (let i = settings.min; i <= settings.max; i += settings.interval) {
                      ticks.push(i);
                    }
                  }
                  return (
                    <YAxis
                      key={metric.key}
                      yAxisId={metric.yAxisId}
                      domain={[
                        settings.min !== undefined ? settings.min : "auto",
                        settings.max !== undefined ? settings.max : "auto",
                      ]}
                      ticks={ticks.length > 0 ? ticks : undefined}
                      label={{
                        value: metric.label,
                        angle: -90,
                        position: "inside",
                      }}
                      onDoubleClick={() => onYAxisDoubleClick(metric.key)}
                    />
                  );
                })}
                <Tooltip />
                <Legend
                  layout="horizontal" // 가로로 정렬
                  wrapperStyle={{
                    position: "absolute",
                    top: 10, // 그래프 내부의 위쪽 여백
                    left: 150, // 그래프 내부의 왼쪽 여백
                    backgroundColor: "rgba(74, 72, 72, 0.8)", // 반투명 배경 추가
                    borderRadius: "5px", // 모서리 둥글게
                    padding: "5px", // 내부 여백
                    border: "1px solid black", // 검정색 경계선 추가
                    width: "250px"
                  }}
                />
                {graph.metrics.map((metricKey) => {
                  const metric = metrics.find((m) => m.key === metricKey);
                  return (
                    <Line
                      key={metric.key}
                      yAxisId={metric.yAxisId}
                      type={interpolationType}
                      dataKey={metric.key}
                      stroke={metric.color}
                      name={metric.label}
                      dot={false}
                      strokeWidth={3}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}