import React, { useState } from "react";
import MonitoringCard from "./MonitoringCard";
import Monitor_KanbanBoard from "./Monitor_KanbanBoard";

export default function MonitoringDashboard({ equipments }) {
  const [selectedEquipment, setSelectedEquipment] = useState(null);

  const handleCardClick = (equipment) => {
    console.log("클릭된 장비 데이터:", equipment); // 클릭된 데이터를 콘솔에 출력
    setSelectedEquipment(equipment); // 선택된 데이터를 상태로 설정
  };

  return (
    <div className="flex h-screen">
      {/* 왼쪽 모니터링 카드 영역 */}
      <div className="w-1/3 bg-gray-800 p-4 overflow-y-auto">
        {equipments.map((equipment) => (
          <MonitoringCard
            key={equipment.id}
            equipment={equipment}
            onClick={handleCardClick} // 클릭 이벤트 핸들러 추가
          />
        ))}
      </div>

      {/* 오른쪽 칸반 보드 영역 */}
      <div className="w-2/3 bg-gray-100 p-4">
        {selectedEquipment ? (
          <Monitor_KanbanBoard equipment={selectedEquipment} /> // 선택된 데이터를 칸반 보드로 전달
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>모니터링 카드를 클릭하여 상세 정보를 확인하세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}