import React, { useEffect, useState } from "react";
import MonitoringCard from "./MonitoringCard";
import GraphDisplay from "./GraphDisplay"; // GraphDisplay 컴포넌트 가져오기
import {
  ThemeProvider,
  createTheme,
  Button,
  TextField,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";

export default function RealTimeMonitoring() {
  const [equipmentData, setEquipmentData] = useState([]);
  const [filter, setFilter] = useState("");
  const [location, setLocation] = useState("");
  const [batteryModel, setBatteryModel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [recipe, setRecipe] = useState("");
  const [viewMode, setViewMode] = useState("card");
  const [selectedEquipment, setSelectedEquipment] = useState(null);

  useEffect(() => {
    const exampleData = [
      {
        id: 1,
        name: "설비 A",
        location: "서울",
        batteryModel: "모델 X",
        startDate: "2023-01-01",
        recipe: "레시피 1",
        status: "정상",
        temperature: [25, 26, 27, 28],
        humidity: [60, 62, 63, 65],
        progress: 60, // 진행률 추가
      },
      {
        id: 2,
        name: "설비 B",
        location: "부산",
        batteryModel: "모델 Y",
        startDate: "2023-02-01",
        recipe: "레시피 2",
        status: "경고",
        temperature: [30, 31, 32, 33],
        humidity: [70, 72, 73, 75],
        progress: 80, // 진행률 추가
      },
      {
        id: 3,
        name: "설비 C",
        location: "대전",
        batteryModel: "모델 Z",
        startDate: "2023-03-01",
        recipe: "레시피 3",
        status: "정상",
        temperature: [22, 23, 24, 25],
        humidity: [55, 56, 57, 58],
        progress: 40, // 진행률 추가
      },
    ];

    setEquipmentData(exampleData);
  }, []);

  const filteredData = equipmentData.filter((equipment) => {
    return (
      equipment.name.includes(filter) &&
      (location === "" || equipment.location === location) &&
      (batteryModel === "" || equipment.batteryModel === batteryModel) &&
      (startDate === "" || equipment.startDate === startDate) &&
      (recipe === "" || equipment.recipe === recipe)
    );
  });

  const theme = createTheme();

  const handleViewModeChange = (event, newViewMode) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const handleRowClick = (equipment) => {
    setSelectedEquipment(equipment); // 선택된 설비 데이터 설정
  };

  const handleCardClick = (equipment) => {
    setSelectedEquipment(equipment); // 카드 클릭 시 선택된 설비 데이터 설정
  };

  const handleDownloadExcel = () => {
    console.log("엑셀 다운로드 실행");
  };

  const handleYAxisDoubleClick = (metricKey) => {
    console.log(`Y축 더블 클릭: ${metricKey}`);
  };

  return (
    <ThemeProvider theme={theme}>
      <div className="p-4 bg-gray-900 text-white h-full"> {/* 배경색을 블랙 계열로 설정 */}
        <h1 className="text-xl font-bold mb-4 text-left text-gray-200">실시간 실험 중인 설비</h1>
        <hr className="border-gray-700 mb-4" />

        <div className="bg-gray-700 shadow-md rounded p-2 mb-4 flex-grow flex"> {/* 조회 칸 배경색을 더 연하게 설정 */}
          <div className="flex-grow grid grid-row-1 grid-cols-2 gap-2 pr-4 border-r border-gray-600">
            <TextField
              label="설비 이름"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth={false}
              style={{ width: "250px", backgroundColor: "#2d3748", color: "white" }} // 배경색을 더 연하게 설정
              InputLabelProps={{ style: { color: "#9ca3af" } }} // 라벨 색상
              InputProps={{ style: { color: "white" } }} // 텍스트 색상
            />
            <TextField
              label="설비 운용 위치"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              variant="outlined"
              select
              size="small"
              fullWidth={false}
              style={{ width: "250px", backgroundColor: "#2d3748", color: "white" }} // 배경색을 더 연하게 설정
              InputLabelProps={{ style: { color: "#9ca3af" } }}
              InputProps={{ style: { color: "white" } }}
            >
              <MenuItem value="">전체</MenuItem>
              <MenuItem value="서울">서울</MenuItem>
              <MenuItem value="부산">부산</MenuItem>
              <MenuItem value="대전">대전</MenuItem>
            </TextField>
            <TextField
              label="배터리 모델"
              value={batteryModel}
              onChange={(e) => setBatteryModel(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth={false}
              style={{ width: "250px", backgroundColor: "#2d3748", color: "white" }} // 배경색을 더 연하게 설정
              InputLabelProps={{ style: { color: "#9ca3af" } }}
              InputProps={{ style: { color: "white" } }}
            />
          </div>

          <div className="flex items-center pl-4">
            <Button
              variant="contained"
              color="primary"
              onClick={() => console.log("검색 버튼 클릭")}
              style={{ height: "80px", width: "100px", backgroundColor: "#2563eb", color: "white" }} // 버튼 배경색을 파란색(#2563eb)으로 설정
            >
              검색
            </Button>
          </div>
        </div>

        <div className="flex justify-end mb-2">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            aria-label="보기 모드 선택"
            size="small"
          >
            <ToggleButton value="card" aria-label="카드 보기" style={{ color: "white", backgroundColor: "#374151" }}>
              카드 보기
            </ToggleButton>
            <ToggleButton value="table" aria-label="표 보기" style={{ color: "white", backgroundColor: "#374151" }}>
              표 보기
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        {viewMode === "card" ? (
          <div className="flex flex-wrap gap-4 bg-gray-800 p-4 rounded shadow-md">
            {filteredData.map((equipment) => (
              <MonitoringCard
                key={equipment.id}
                equipment={equipment}
                onClick={() => handleCardClick(equipment)}
                style={{
                  backgroundColor: "#2d3748", // 카드 배경색
                  color: "white", // 텍스트 색상
                  border: "1px solid #4a5568", // 카드 테두리
                  borderRadius: "8px", // 카드 모서리 둥글게
                  padding: "16px", // 카드 내부 여백
                }}
              />
            ))}
          </div>
        ) : (
          <TableContainer
            component={Paper}
            style={{
              backgroundColor: "#1f2937", // 테이블 배경색
              color: "white", // 텍스트 색상
              borderRadius: "8px", // 테이블 모서리 둥글게
              padding: "16px", // 테이블 내부 여백
            }}
          >
            <Table>
              <TableHead>
                <TableRow style={{ backgroundColor: "#374151" }}> {/* 헤더 배경색 설정 */}
                  <TableCell style={{ color: "white", fontWeight: "bold", borderRight: "1px solid #4a5568" }}>설비 이름</TableCell>
                  <TableCell style={{ color: "white", fontWeight: "bold", borderRight: "1px solid #4a5568" }}>운용 위치</TableCell>
                  <TableCell style={{ color: "white", fontWeight: "bold", borderRight: "1px solid #4a5568" }}>배터리 모델</TableCell>
                  <TableCell style={{ color: "white", fontWeight: "bold", borderRight: "1px solid #4a5568" }}>실험 시작 날짜</TableCell>
                  <TableCell style={{ color: "white", fontWeight: "bold", borderRight: "1px solid #4a5568" }}>레시피</TableCell>
                  <TableCell style={{ color: "white", fontWeight: "bold" }}>상태</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredData.map((equipment, index) => (
                  <TableRow
                    key={equipment.id}
                    onClick={() => handleRowClick(equipment)}
                    style={{
                      cursor: "pointer",
                      color: "white",
                      backgroundColor: index % 2 === 0 ? "#2d3748" : "#1f2937", // 짝수/홀수 행 배경색 다르게 설정
                    }}
                  >
                    <TableCell style={{ color: "white", borderRight: "1px solid #4a5568" }}>{equipment.name}</TableCell>
                    <TableCell style={{ color: "white", borderRight: "1px solid #4a5568" }}>{equipment.location}</TableCell>
                    <TableCell style={{ color: "white", borderRight: "1px solid #4a5568" }}>{equipment.batteryModel}</TableCell>
                    <TableCell style={{ color: "white", borderRight: "1px solid #4a5568" }}>{equipment.startDate}</TableCell>
                    <TableCell style={{ color: "white", borderRight: "1px solid #4a5568" }}>{equipment.recipe}</TableCell>
                    <TableCell style={{ color: "white" }}>{equipment.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <GraphDisplay
          selectedEquipment={selectedEquipment}
          onDownloadExcel={handleDownloadExcel}
          onYAxisDoubleClick={handleYAxisDoubleClick}
          style={{
            backgroundColor: "#1f2937", // 그래프 배경색
            color: "white", // 텍스트 색상
            borderRadius: "8px", // 그래프 모서리 둥글게
            padding: "16px", // 그래프 내부 여백
          }}
        />
      </div>
    </ThemeProvider>
  );
}