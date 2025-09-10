import React from "react";

export default function MonitoringCard({ equipment, onClick }) {
  return (
    <div 
      className="bg-gray-600 shadow-md rounded p-4 cursor-pointer hover:shadow-lg hover:bg-gray-700 transition"
      onClick={() => onClick(equipment)} // 클릭 시 데이터를 전달
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">{equipment.name}</h2>
        <div className="relative w-10 h-10">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#4B5563"
              strokeWidth="4"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#10B981"
              strokeWidth="4"
              strokeDasharray={`${equipment.progress}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white">
            {equipment.progress}%
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-left">
        <p className="text-sm text-gray-300">상태: {equipment.status}</p>
        <p className="text-sm text-gray-300">온도: {equipment.temperature}°C</p>
        <p className="text-sm text-gray-300">습도: {equipment.humidity}%</p>
      </div>
    </div>
  );
}