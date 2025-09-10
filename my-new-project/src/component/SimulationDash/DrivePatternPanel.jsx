import React, { useState } from "react";
import { Line } from "react-chartjs-2";
import * as XLSX from "xlsx";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Chart.js 구성 요소 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function DrivePatternPanel({ onDriveProfileChange }) {
  const [inputType, setInputType] = useState("standard");
  const [graphData, setGraphData] = useState(null);

  const handleInputTypeChange = (e) => {
    const selectedType = e.target.value;
    setInputType(selectedType);
    setGraphData(null);
    onDriveProfileChange(null); // 입력 유형 변경 시 부모 컴포넌트에 null 전달
  };

  const handleStandardPatternSelect = (pattern) => {
    const standardPatterns = {
      urban: {
        labels: ["0s", "10s", "20s", "30s"],
        datasets: [
          {
            label: "Urban Driving (km/h)",
            data: [0, 15, 30, 45],
            borderColor: "rgba(75, 192, 192, 1)",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            pointRadius: 0,
          },
        ],
      },
      highway: {
        labels: ["0s", "10s", "20s", "30s"],
        datasets: [
          {
            label: "Highway Driving (km/h)",
            data: [0, 60, 80, 100],
            borderColor: "rgba(255, 99, 132, 1)",
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            pointRadius: 0,
          },
        ],
      },
    };

    const selectedPattern = standardPatterns[pattern];
    setGraphData(selectedPattern);
    onDriveProfileChange(selectedPattern); // 부모 컴포넌트로 데이터 전달
  };

  const handleCustomFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const labels = jsonData.slice(1).map((row) => row[0]);
        const speeds = jsonData.slice(1).map((row) => row[1]);

        const driveProfile = labels.map((time, index) => ({
          time: parseFloat(time),
          speed: parseFloat(speeds[index]),
        }));

        setGraphData({
          labels: labels,
          datasets: [
            {
              label: "Custom Driving Pattern (km/h)",
              data: speeds,
              borderColor: "rgba(153, 102, 255, 1)",
              backgroundColor: "rgba(153, 102, 255, 0.2)",
              pointRadius: 0,
            },
          ],
        });

        onDriveProfileChange(driveProfile); // 변환된 데이터를 부모 컴포넌트로 전달
      };
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="p-6 bg-white shadow-md rounded w-full h-full flex flex-col justify-between">
      {/* 맨 위 제목 */}
      <h1 className="text-3xl font-black text-left mb-6 border-b-2 pb-2">
        📈 주행 패턴 입력
      </h1>

      {/* 입력 유형 선택 */}
      <div className="space-y-6 bg-gray-100 p-4 rounded-md flex-grow">
        <h2 className="text-xl font-black text-left mb-2 border-b pb-2">입력 유형 선택</h2>
        <div className="flex items-center space-x-4">
          {/* 콤보 박스 */}
          <select
            value={inputType}
            onChange={handleInputTypeChange}
            className="border rounded px-4 py-2"
          >
            <option value="standard">표준 양식</option>
            <option value="custom">사용자 정의</option>
          </select>

          {/* 표준 주행 패턴 선택 버튼 */}
          {inputType === "standard" && (
            <div className="flex space-x-4">
              <button
                onClick={() => handleStandardPatternSelect("urban")}
                className="px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600 transition"
              >
                도시 주행
              </button>
              <button
                onClick={() => handleStandardPatternSelect("highway")}
                className="px-4 py-2 bg-green-500 text-white rounded shadow hover:bg-green-600 transition"
              >
                고속도로 주행
              </button>
            </div>
          )}

          {/* 사용자 정의 파일 업로드 */}
          {inputType === "custom" && (
            <div>
              <input
                type="file"
                accept=".csv, .xlsx"
                onChange={handleCustomFileUpload}
                className="border rounded px-4 py-2"
              />
            </div>
          )}
        </div>
      </div>

      {/* 주행 패턴 그래프 */}
      {graphData && (
        <div className="space-y-6 bg-gray-50 p-4 rounded-md mt-4 flex-grow">
          <h2 className="text-xl font-black mb-2 border-b pb-2">주행 패턴 그래프</h2>
          <Line data={graphData} />
        </div>
      )}
    </div>
  );
}