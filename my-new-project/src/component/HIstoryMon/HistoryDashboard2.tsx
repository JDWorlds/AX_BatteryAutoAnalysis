import React, { useState, useEffect } from "react";
import { Table, TableHead, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, Filler, LineElement, PointElement, CategoryScale, LinearScale } from "chart.js";
import { v4 as uuidv4 } from "uuid"; // UUID 생성 라이브러리 사용
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

ChartJS.register(Filler, LineElement, PointElement, CategoryScale, LinearScale);

const HistoryDashboard = () => {
  const [cellData, setCellData] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [summaryData, setSummaryData] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState(["ir"]); // 복수형 선택 상태
  const [searchQuery, setSearchQuery] = useState(""); // 검색어 상태
  const [searchMode, setSearchMode] = useState("cell_id"); // 검색 모드 상태 ("cell_id" 또는 "ai_mode")
  const [aiResults, setAiResults] = useState([]); // AI Mode 검색 결과
  const sessionID = uuidv4(); // 고유한 sessionID 생성

  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/cells")
      .then((res) => res.json())
      .then((data) => setCellData(data))
      .catch((err) => console.error("Error fetching cell data:", err));
  }, []);

  const handleSearch = () => {
    if (searchMode === "cell_id") {
      fetch(`http://127.0.0.1:5000/api/cells?search=${searchQuery}`)
        .then((res) => res.json())
        .then((data) => {
          console.log("셀 ID 검색 결과:", data);
          setCellData(data);
        })
        .catch((err) => console.error("Error fetching search results:", err));
    } else if (searchMode === "ai_mode") {
      fetch(`http://localhost:5678/webhook-test/start-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Session-ID": sessionID,
        },
        body: JSON.stringify({ query: searchQuery }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("AI Mode 검색 결과:", data);
          setAiResults(data);

          // HTML에서 셀 ID 추출
          const cellIdMatch = data.html.match(/<p><strong>Cell ID:<\/strong>\s*(\w+)<\/p>/);
          if (cellIdMatch) {
            const cellId = cellIdMatch[1];
            setSelectedCell(cellId);

            // 셀 ID를 기준으로 그래프 데이터 가져오기
            fetch(`http://127.0.0.1:5000/api/cycle_summaries?cell_id=${cellId}`)
              .then((res) => res.json())
              .then((summaryData) => {
                setSummaryData(summaryData); // 그래프 데이터 업데이트
              })
              .catch((err) => console.error("Error fetching summary data:", err));
          } else {
            console.error("Cell ID not found in AI Mode HTML.");
          }
        })
        .catch((err) => console.error("Error fetching AI search results:", err));
    }
  };

  const handleDetailClick = (cellId) => {
    setSelectedCell(cellId);

    fetch(`http://127.0.0.1:5000/api/cycle_summaries?cell_id=${cellId}`)
      .then((res) => res.json())
      .then((data) => setSummaryData(data))
      .catch((err) => console.error("Error fetching summary data:", err));
  };

  const summaryChartData = {
    labels: summaryData.map((item) => item.cycle_index), // X축: Cycle Index
    datasets: selectedMetrics.map((metric, index) => ({
      label: metric,
      data: summaryData.map((item) => item[metric]),
      borderColor: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 1)`,
      backgroundColor: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.2)`,
      yAxisID: `y-axis-${index}`, // 각 데이터셋에 별도의 Y축 ID를 부여
    })),
  };

  const chartOptions = {
    responsive: true,
    scales: {
      x: {
        beginAtZero: true,
      },
      ...selectedMetrics.reduce((acc, metric, index) => {
        acc[`y-axis-${index}`] = {
          type: "linear",
          position: index % 2 === 0 ? "left" : "right", // Y축을 좌우로 번갈아 배치
          ticks: {
            callback: function (value) {
              return value.toFixed(2); // 소수점 2자리로 표시
            },
          },
        };
        return acc;
      }, {}),
    },
  };

  const handleMetricChange = (metric) => {
    if (selectedMetrics.includes(metric)) {
      setSelectedMetrics(selectedMetrics.filter((m) => m !== metric));
    } else {
      setSelectedMetrics([...selectedMetrics, metric]);
    }
  };

  const handleDownloadPDF = () => {
    const iframeContent = document.querySelector("iframe")?.contentDocument?.body;

    if (iframeContent) {
      // HTML 요소를 캡처하기 위해 스타일을 유지한 상태로 캔버스 생성
      html2canvas(iframeContent, {
        scale: 2, // 캔버스 해상도 증가
        useCORS: true, // 외부 리소스 허용
        logging: true, // 디버깅 로그 활성화
      }).then((canvas) => {
        const imgData = canvas.toDataURL("image/png"); // 캔버스를 이미지로 변환
        const pdf = new jsPDF("p", "mm", "a4"); // A4 크기 PDF 생성
        const pdfWidth = pdf.internal.pageSize.getWidth(); // PDF 너비
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width; // PDF 높이 비율 계산

        // 이미지 추가 및 PDF 저장
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save("AI_Report.pdf");
      }).catch((err) => {
        console.error("Error generating PDF:", err);
      });
    } else {
      console.error("iframe content not found.");
    }
  };

  const options = {
    margin: 0, // 여백을 최소화
    filename: "AI_Report.pdf",
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "px", format: [window.innerWidth, window.innerHeight], orientation: "portrait" },
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">배터리 셀 평가 대시보드</h1>

      {/* 검색 조건 */}
      <div className="mb-4 flex items-center gap-4">
        <label htmlFor="search-mode" className="block text-sm font-large text-gray-700">
          MODE:
        </label>
        <select
          id="search-mode"
          value={searchMode}
          onChange={(e) => setSearchMode(e.target.value)}
          className="block p-2 border border-gray-300 rounded"
        >
          <option value="cell_id">셀 ID 검색</option>
          <option value="ai_mode">AI Mode</option>
        </select>

        <input
          id="search"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full p-2 border border-gray-300 rounded"
          placeholder={searchMode === "cell_id" ? "셀 ID를 입력하세요" : "AI 검색어를 입력하세요"}
        />
        <Button onClick={() => handleSearch()} className="p-2 bg-blue-500 text-white rounded">
          검색
        </Button>
      </div>

      {/* 셀 정보 테이블 */}
      {searchMode === "cell_id" && (
        <div className="bg-white shadow-md rounded p-4 mb-6">
          <h2 className="text-xl font-bold mb-4">셀 정보</h2>
          <Table className="table-auto">
            <TableHead>
              <TableRow>
                <TableCell className="font-bold text-left">셀 ID</TableCell>
                <TableCell className="font-bold text-left">충전 정책</TableCell>
                <TableCell className="font-bold text-left">사이클 수명</TableCell>
                <TableCell className="font-bold text-left">상세보기</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cellData.map((cell) => (
                <TableRow key={cell.cell_id}>
                  <TableCell className="text-left">{cell.cell_id}</TableCell>
                  <TableCell className="text-left">{cell.charge_policy}</TableCell>
                  <TableCell className="text-left">{cell.cycle_life}</TableCell>
                  <TableCell className="text-left">
                    <Button onClick={() => handleDetailClick(cell.cell_id)}>📈 상세보기</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedCell && summaryData.length > 0 && (
        <div className="bg-white shadow-md rounded p-4 flex w-full">
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-4">셀 상세 정보: {selectedCell}</h2>
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-4">Cycle Summary Graph</h3>
              <Line data={summaryChartData} options={chartOptions} />
            </div>
          </div>

          {/* 체크박스 UI */}
          <div className="w-1/6 bg-white shadow-md rounded p-6">
            <h3 className="text-lg font-bold mb-4 text-center text-gray-800">Y축 데이터 선택</h3>
            <div className="space-y-4">
              {["ir", "q_charge", "q_discharge", "tavg", "tmin", "tmax", "chargetime"].map((metric) => (
                <div key={metric} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric)}
                    onChange={() => handleMetricChange(metric)}
                    className="mr-2 h-5 w-5 text-blue-500 focus:ring-blue-400 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">{metric}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Mode 결과 탭 */}
      {searchMode === "ai_mode" && aiResults?.html && (
        <>
          {/* AI 분석 결과 보고서 */}
          <div className="bg-gray-100 shadow-md rounded p-4">
            <h3 className="text-lg font-bold mb-4">AI 분석 결과</h3>
            <iframe
              srcDoc={aiResults.html}
              className="w-full h-[1200px] border border-gray-300 rounded"
              title="AI Mode 결과"
            ></iframe>
            <button
              onClick={handleDownloadPDF}
              className="mt-4 p-2 bg-blue-500 text-white rounded"
            >
              PDF 다운로드
            </button>
          </div>
        </>
      )}

    </div>
  );
};

export default HistoryDashboard;