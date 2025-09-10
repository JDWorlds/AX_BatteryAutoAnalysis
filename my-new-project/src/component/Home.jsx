import React, { useState } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import GraphSection from "./GraphSection";
import RealTimeMonitoring from "./MainPageRealMon/RealTimeMonitoring";
import SimulationDashboard from "./SimulationDash/simulationDashboard";
import RecipewithLLM from "./LLMwithn8n/RecipewithLLM"
import MainDashboard from "./Main_Dashboard";
import HistoryDashboard from "./HIstoryMon/HistoryDashboard"
import DOE4DVisualizer from "./LLMwithn8n/DOE/CoverageDiagram"
import AI_Main_Monitor from "./LLMwithn8n/AI_Monitor/AI_Main_Monitor"


export default function Home() {
  const [activeTab, setActiveTab] = useState("default");

  return (
    <div className="flex flex-col h-screen w-screen">
      {/* 상단 메뉴바 */}
      <Navbar />

      <div className="flex flex-1">
        {/* 왼쪽 사이드바 */}
        <Sidebar setActiveTab={setActiveTab} />

        {/* 메인 콘텐츠 */}
        <div className="flex-1">
          {activeTab === "default" && <MainDashboard/>}
          {activeTab === "실험 실시간 모니터링" && <RealTimeMonitoring />}
          {activeTab === "HILS Driving 시뮬레이션" && <SimulationDashboard/>}
          {activeTab === "레시피 등록/조회" && <RecipewithLLM/>}
          {activeTab === "History 실험보기" && <HistoryDashboard/>}
          {activeTab === "실험 DOE 커버리지" && <DOE4DVisualizer/>}
          {activeTab === "AI 모니터링" && <AI_Main_Monitor/>}
        </div>
      </div>
    </div>
  );
}