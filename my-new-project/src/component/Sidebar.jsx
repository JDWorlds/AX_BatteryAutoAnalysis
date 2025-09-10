import React, { useState } from "react";

export default function Sidebar({setActiveTab}) {
  const [activeMenu, setActiveMenu] = useState(null); // 현재 활성화된 메뉴 상태

  // 하위 메뉴 데이터
  const subMenus = {
    "CYCLE 모니터링": ["실험 실시간 모니터링", "History 실험보기", "실험 DOE 커버리지", "AI 모니터링"],
    "실험 Setting/관리": ["장비실험 관리 및 등록", "장비 실험현황 및 알림","배터리 모델 등록/조회"],
    "레시피 작성UX": ["레시피 등록/조회", "CYCLE자동화 프로토콜 조회/설정","HILS Driving 시뮬레이션"],
    "데이터 분석/이상진단": ["분석 데이터/시각화", "분석로직 등록 및 조회", "배터리 열화패턴 분석", "AI 데이터 이상감지", "배터리 모델 생성 및 모의예측"],
    "History실험 조회": ["실험목록 조회 및 엑셀다운", "실험히스토리 패턴 조회"],
    "시스템 설정": ["S/W 조회", "S/W 업데이트"],
    "XYTOS 장비 조회/점검": ["검교정", "안전모니터링", "장비 상태조회 / SPEC"],
  };

  return (
    <div className="flex">
      {/* 사이드바 */}
      <div className="bg-gray-800 text-white w-64 p-4 flex flex-col space-y-4">
        {/* 제목 */}
        <h2 className="text-xl font-extrabold">Main Menu</h2>
        <hr className="border-gray-600 border-t-2 my-2" />

        {/* 메뉴 항목 */}
        <ul className="space-y-2">
          {Object.keys(subMenus).map((menu) => (
            <li key={menu}>
              <button
                className={`w-full text-left hover:bg-gray-800 p-2 rounded ${
                  activeMenu === menu ? "bg-gray-800" : "bg-gray-800"
                }`}
                onClick={() =>
                  setActiveMenu(activeMenu === menu ? null : menu) // 클릭 시 활성화/비활성화
                }
              >
                {menu}
              </button>
              {activeMenu === menu && (
                <ul className="ml-4 mt-2 space-y-1">
                  {subMenus[menu].map((subMenu) => (
                    <li
                      key={subMenu}
                      className="text-sm bg-gray-800 hover:bg-gray-700 p-2 rounded text-left"
                      onClick={()=> {setActiveTab(subMenu); console.log(subMenu)}}
                    >
                      {subMenu}
                    </li>
                  ))}
                </ul>
              )}
              <hr className="border-gray-700" />
            </li>
          ))}
        </ul>
      </div>
      {/*
      <div className="flex-1 bg-gray-100 p-4">
        {activeMenu ? (
          <h3 className="text-lg font-bold">
            {activeMenu}의 하위 메뉴를 선택하세요.
          </h3>
        ) : (
          <h3 className="text-lg font-bold">메뉴를 선택하세요.</h3>
        )}
      </div>
      */}
    </div>
  );
}