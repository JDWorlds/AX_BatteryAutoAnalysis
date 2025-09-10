import React, { useState, useEffect } from "react";
import FilterPanel from "./FilterPanel";
import GraphPanel from "./GraphPanel";
import VehicleSpecsPanel from "./VehicleSpecsPanel"; // 차량 재원 지정 탭 컴포넌트
import DrivePatternPanel from "./DrivePatternPanel"; // 주행패턴 입력 컴포넌트
import MapComponent from "../MapComponent/MapComponent";
import * as XLSX from "xlsx";
import { Line } from "react-chartjs-2";
import Split from "react-split";

function YAxisPopup({ metricKey, settings, onChange, onClose }) {
  if (!metricKey) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-96">
        <h2 className="text-xl font-semibold mb-4">Y축 설정: {metricKey}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">최소값</label>
            <input
              type="number"
              value={settings.min !== undefined && settings.min !== null ? settings.min : ""}
              onChange={(e) => onChange(metricKey, "min", Number(e.target.value))}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">최대값</label>
            <input
              type="number"
              value={settings.max !== undefined && settings.max !== null ? settings.max : ""}
              onChange={(e) => onChange(metricKey, "max", Number(e.target.value))}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">간격</label>
            <input
              type="number"
              value={settings.interval !== undefined && settings.interval !== null ? settings.interval : ""}
              onChange={(e) => onChange(metricKey, "interval", Number(e.target.value))}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
        </div>
        <div className="text-right mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600 transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SimulationDashboard() {
  const [activeTab, setActiveTab] = useState("vehicleSpecs"); // 기본 탭을 차량 재원 지정으로 설정
  const [data, setData] = useState([]);
  const [graphs, setGraphs] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState(["speed", "current"]);
  const [yAxisSettings, setYAxisSettings] = useState({
    speed: { min: 0, max: 200, interval: 20 },
    motorPower: { min: 0, max: 1000, interval: 10},
    current: { min: 0, max: 100, interval: 10 },
    voltage: { min: 0, max: 500, interval: 50 },
    soc: { min: 0, max: 100, interval: 10 },
    temperature: { min: -20, max: 100, interval: 10 },
  });
  const [popupVisible, setPopupVisible] = useState(false);
  const [currentMetric, setCurrentMetric] = useState(null);

  //----------------- 차량재원 및 주행패턴 데이터 관리 및 API 전송 --------------------------//
  const [vehicleParams, setVehicleParams] = useState(null);
  const [driveProfile, setDriveProfile] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);

  //Simulation 수행
  const handleSimulate = async () => {
    if (!vehicleParams || !driveProfile || !Array.isArray(driveProfile)) {
      alert("차량 재원과 주행패턴 모두 선택하세요");
      return;
    }

    const requestData = {
      vehicleParameters: vehicleParams,
      driveProfile: driveProfile.map((data) => ({
        time: data.time,
        speed: data.speed,
      })),
    };

    console.log(requestData);

    try {
      const response = await fetch("/api/Simulation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error("시뮬레이션 요청 실패");
      }

      const result = await response.json();
      console.log(result);

      setSimulationResult(result); // 결과 저장
      console.log(simulationResult);
    } catch (error) {
      console.error("시뮬레이션 요청 중 오류 발생:", error);
      alert("시뮬레이션 요청 중 오류가 발생했습니다.");
    }
  };
  
  //-------------------------------------------------------------------------------//

  const metrics = [
    { key: "speed", label: "속도 (km/h)", color: "#8884d8", yAxisId: "left" },
    { key: "motorPower", label: "요구파워 (W)", color: "#28a745", yAxisId: "right" },
    { key: "current", label: "전류 (A)", color: "#82ca9d", yAxisId: "right" },
    { key: "voltage", label: "전압 (V)", color: "#ff7300", yAxisId: "voltage" },
    { key: "soc", label: "SOC (%)", color: "#387908", yAxisId: "soc" },
    { key: "temperature", label: "온도 (℃)", color: "#888", yAxisId: "temp" },
  ];

  const handleMetricChange = (metricKey) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricKey)
        ? prev.filter((key) => key !== metricKey)
        : [...prev, metricKey]
    );
  };

  const handleGenerateGraph = () => {
    const graphTitle = selectedMetrics.map((key) => metrics.find((m) => m.key === key)?.label).join(", ");
    setGraphs((prev) => [...prev, { id: prev.length + 1, metrics: selectedMetrics, title: graphTitle }]);
  };

  const handleDownloadExcel = () => {
    const workbook = XLSX.utils.book_new();
    graphs.forEach((graph) => {
      const sanitizedTitle = (graph.title || `Graph ${graph.id}`).replace(/[:\\\/\?\*\[\]]/g, "");
      const sheetData = data.map((row) => {
        const filteredRow = { time: row.time };
        graph.metrics.forEach((metricKey) => {
          filteredRow[metricKey] = row[metricKey];
        });
        return filteredRow;
      });
      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, sanitizedTitle);
    });
    XLSX.writeFile(workbook, "simulation_data.xlsx");
  };

  const handleYAxisChange = (metricKey, field, value) => {
    setYAxisSettings((prev) => ({
      ...prev,
      [metricKey]: {
        ...prev[metricKey],
        [field]: value,
      },
    }));
  };

  const openYAxisPopup = (metricKey) => {
    setCurrentMetric(metricKey);
    setPopupVisible(true);
  };

  const closeYAxisPopup = () => {
    setPopupVisible(false);
    setCurrentMetric(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* 상단 고정된 책갈피 스타일 메뉴 */}
      <div className="flex bg-white shadow-md p-4 sticky top-0 z-50">
        <div className="flex space-x-4 w-full justify-start">
          <button
            onClick={() => setActiveTab("vehicleSpecs")}
            className={`px-6 py-2 rounded-l-full rounded-r-full text-sm font-semibold ${
              activeTab === "vehicleSpecs"
                ? "bg-blue-500 text-white shadow-md"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            🚗 차량 재원 지정
          </button>
          <button
            onClick={() => setActiveTab("filter")}
            className={`px-6 py-2 rounded-l-full rounded-r-full text-sm font-semibold ${
              activeTab === "filter"
                ? "bg-blue-500 text-white shadow-md"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            📑 필터 설정
          </button>
          <button
            onClick={() => setActiveTab("graph")}
            className={`px-6 py-2 rounded-l-full rounded-r-full text-sm font-semibold ${
              activeTab === "graph"
                ? "bg-blue-500 text-white shadow-md"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            📊 그래프 보기
          </button>
          <button
            onClick={() => setActiveTab("map")}
            className={`px-6 py-2 rounded-l-full rounded-r-full text-sm font-semibold ${
              activeTab === "map"
                ? "bg-blue-500 text-white shadow-md"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            🗺️ 지도 보기
          </button>
        </div>
        {/* 시뮬레이션 시작 버튼을 오른쪽으로 정렬 */}
        <div className="flex w-full justify-end pr-4">
          {vehicleParams && driveProfile && (
            <button
              onClick={handleSimulate}
              className="px-6 py-3 bg-red-500 text-white font-bold rounded shadow hover:bg-red-600 transition"
            >
              시뮬레이션 시작
            </button>
          )}
        </div>
      </div>

      {/* 탭에 따른 콘텐츠 */}
      <div className="flex-grow flex flex-col items-start w-full max-w-full mx-auto mt-6">
        {activeTab === "vehicleSpecs" && (
          <div className="flex-grow w-full h-full">
            <Split
              sizes={[50, 50]} // 초기 크기 비율
              minSize={200} // 최소 크기
              gutterSize={20} // 분리선 크기
              direction="horizontal" // 수평 분리
              className="flex"
            >
              {/* 왼쪽: 차량 재원 입력 패널 */}
              <div className="h-full p-4 bg-white">
                <VehicleSpecsPanel onParamsChange={setVehicleParams} />
              </div>

              {/* 오른쪽: 주행 패턴 입력 패널 */}
              <div className="h-full p-4 bg-white">
                <DrivePatternPanel onDriveProfileChange={setDriveProfile} />
              </div>
            </Split>
          </div>
        )}
        {activeTab === "filter" && (
          <FilterPanel
            metrics={metrics}
            selectedMetrics={selectedMetrics}
            onMetricChange={handleMetricChange}
            onGenerateGraph={handleGenerateGraph}
            yAxisSettings={yAxisSettings}
            onYAxisChange={handleYAxisChange}
          />
        )}

        {/* GraphPanel */}
        {activeTab === "graph" && (
          <GraphPanel
            graphs={graphs}
            data={simulationResult} // 전달
            metrics={metrics}
            yAxisSettings={yAxisSettings}
            onDownloadExcel={handleDownloadExcel}
            onYAxisDoubleClick={openYAxisPopup}
          />
        )}
        {activeTab === "map" && (
          <MapComponent/>
        )}
      </div>

      {/* Y축 설정 팝업 */}
      {popupVisible && (
        <YAxisPopup
          metricKey={currentMetric}
          settings={yAxisSettings[currentMetric]}
          onChange={handleYAxisChange}
          onClose={closeYAxisPopup}
        />
      )}
    </div>
  );
}
