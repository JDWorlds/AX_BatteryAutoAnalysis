import React from "react";
import LGCNS_logo from "../assets/fonts/LGCNS.svg";
import cute_logo from "../assets/fonts/cute.svg";

export default function Navbar() {
  const userName = "김범수"; // 로그인한 사용자 이름 (예제)

  return (
    <div className="bg-gray-900 text-white p-3 flex items-center justify-between shadow-lg border-b border-gray-700">
      {/* 로고와 텍스트 */}
      <div className="flex items-center space-x-4">
        <img
          src={LGCNS_logo} // LG 로고 URL
          alt="LG Logo"
          className="h-10" // 로고 높이 설정
        />
        <h1 className="text-2xl font-bold">Cycler AI Agent</h1>
      </div>

      {/* 버튼들 및 사용자 정보 */}
      <div className="flex items-center space-x-4">
        <button className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600">
          레시피 등록/조회
        </button>
        <button className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600">
          즐겨찾기2
        </button>
        <button className="bg-red-600 px-4 py-2 rounded hover:bg-red-500">
          로그아웃
        </button>
        {/* 사용자 정보 */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">{userName} 님</span>
          <img
            src={cute_logo}
            alt="User Profile"
            className="w-8 h-8 rounded-full"
          />
        </div>
      </div>
    </div>
  );
}