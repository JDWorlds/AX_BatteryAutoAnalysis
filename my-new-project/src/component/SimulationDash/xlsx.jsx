import * as XLSX from "xlsx";

export const downloadExcel = (graphs, data) => {
  // 새 워크북 생성
  const workbook = XLSX.utils.book_new();

  // 각 그래프 데이터를 시트로 추가
  graphs.forEach((graph) => {
    // 그래프에 포함된 메트릭 데이터 필터링
    const sheetData = data.map((row) => {
      const filteredRow = { time: row.time }; // 시간 데이터 포함
      graph.metrics.forEach((metricKey) => {
        filteredRow[metricKey] = row[metricKey];
      });
      return filteredRow;
    });

    // 시트 생성
    const worksheet = XLSX.utils.json_to_sheet(sheetData);

    // 워크북에 시트 추가 (그래프 제목을 시트 이름으로 사용)
    XLSX.utils.book_append_sheet(workbook, worksheet, graph.title || `Graph ${graph.id}`);
  });

  // 엑셀 파일 생성 및 다운로드
  XLSX.writeFile(workbook, "Monitoring Data.xlsx");
};