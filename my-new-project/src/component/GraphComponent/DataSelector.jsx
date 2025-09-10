import React, { useState } from "react";

export default function DataSelector({ availableMetrics, onMetricSelect }) {
  const [selectedMetrics, setSelectedMetrics] = useState({});
  const [selectedUnits, setSelectedUnits] = useState({});

  const handleCheckboxChange = (metricKey) => {
    setSelectedMetrics((prevMetrics) => ({
      ...prevMetrics,
      [metricKey]: !prevMetrics[metricKey], // 체크 상태 토글
    }));
  };

  const handleUnitChange = (metricKey, unit) => {
    setSelectedUnits((prevUnits) => ({
      ...prevUnits,
      [metricKey]: unit,
    }));
  };

  const handleGenerateGraph = () => {
    const selectedData = Object.keys(selectedMetrics)
      .filter((key) => selectedMetrics[key]) // 체크된 항목만 필터링
      .map((key) => ({
        key,
        unit: selectedUnits[key] || "", // 단위가 선택되지 않은 경우 빈 문자열
      }));
    onMetricSelect(selectedData); // 부모 컴포넌트로 전달
  };

  return (
    <div className="bg-gray-800 p-4 rounded shadow-md text-white"> {/* 배경색과 텍스트 색상 조정 */}
      <h3 className="text-lg font-bold mb-4 text-gray-200">데이터 선택 및 단위 설정</h3>
      <table className="w-full border-collapse border border-gray-700"> {/* 테이블 스타일 조정 */}
        <thead>
          <tr>
            <th className="border border-gray-700 p-2 text-left text-gray-300">선택</th>
            <th className="border border-gray-700 p-2 text-left text-gray-300">데이터 항목</th>
            <th className="border border-gray-700 p-2 text-left text-gray-300">단위 선택</th>
          </tr>
        </thead>
        <tbody>
          {availableMetrics.map((metric) => (
            <tr key={metric.key} className="hover:bg-gray-700"> {/* 행 hover 효과 추가 */}
              <td className="border border-gray-700 p-2 text-center">
                <input
                  type="checkbox"
                  checked={selectedMetrics[metric.key] || false}
                  onChange={() => handleCheckboxChange(metric.key)}
                  className="accent-blue-500" // 체크박스 색상 조정
                />
              </td>
              <td className="border border-gray-700 p-2 text-gray-300">{metric.label}</td>
              <td className="border border-gray-700 p-2">
                <select
                  value={selectedUnits[metric.key] || ""}
                  onChange={(e) => handleUnitChange(metric.key, e.target.value)}
                  className="w-full p-2 border rounded bg-gray-900 text-gray-300" // 드롭다운 스타일 조정
                >
                  <option value="">단위를 선택하세요</option>
                  <option value="°C">°C (온도)</option>
                  <option value="%">% (습도)</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={handleGenerateGraph}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600 transition"
      >
        그래프 생성
      </button>
    </div>
  );
}