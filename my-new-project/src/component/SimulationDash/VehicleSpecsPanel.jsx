import React, { useState } from "react";

const vehicleTypes = [
  {
    type: "경차",
    image: "/images/small-car.png", // 경차 이미지 경로
    specs: {
      mass: 1000,
      wheelRadius: 0.25,
      gearRatio: 4.5,
      drivetrainEfficiency: 85,
      maxMotorTorque: 150,
      regenTorqueLimit: 50,
      cd: 0.3,
      cr: 0.01,
      frontalArea: 2.0,
      airDensity: 1.225,
      slopeAngleDeg: 0,
    },
  },
  {
    type: "중형",
    image: "/images/mid-car.png", // 중형차 이미지 경로
    specs: {
      mass: 1500,
      wheelRadius: 0.3,
      gearRatio: 4.2,
      drivetrainEfficiency: 85,
      maxMotorTorque: 300,
      regenTorqueLimit: 100,
      cd: 0.32,
      cr: 0.015,
      frontalArea: 2.2,
      airDensity: 1.225,
      slopeAngleDeg: 0,
    },
  },
  {
    type: "대형",
    image: "/images/large-car.png", // 대형차 이미지 경로
    specs: {
      mass: 2000,
      wheelRadius: 0.35,
      gearRatio: 4.0,
      drivetrainEfficiency: 80,
      maxMotorTorque: 400,
      regenTorqueLimit: 150,
      cd: 0.35,
      cr: 0.02,
      frontalArea: 2.5,
      airDensity: 1.225,
      slopeAngleDeg: 0,
    },
  },
];

export default function VehicleSpecsPanel({ onParamsChange }) {
  const [currentVehicleIndex, setCurrentVehicleIndex] = useState(0);
  const [vehicleSpecs, setVehicleSpecs] = useState(vehicleTypes[0].specs);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setVehicleSpecs((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleVehicleChange = (direction) => {
    let newIndex = currentVehicleIndex + direction;
    if (newIndex < 0) newIndex = vehicleTypes.length - 1;
    if (newIndex >= vehicleTypes.length) newIndex = 0;

    setCurrentVehicleIndex(newIndex);
    setVehicleSpecs(vehicleTypes[newIndex].specs);

    // 부모 컴포넌트로 데이터 전달
    if (onParamsChange) {
      onParamsChange(vehicleTypes[newIndex].specs);
    }
  };

  const handleSubmit = () => {
    console.log("Vehicle Specs Submitted:", vehicleSpecs);
    alert("차량 재원이 저장되었습니다!");

    // 부모 컴포넌트로 데이터 전달
    if (onParamsChange) {
      onParamsChange(vehicleSpecs);
    }
  };

  return (
    <div className="p-6 bg-white shadow-md rounded w-full">
      {/* 맨 위 제목 */}
      <h1 className="text-3xl font-bold text-left mb-6 border-b-2 pb-2">
        🚗 차량 제원 및 환경 파라미터
      </h1>

      {/* 차량 유형 선택 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => handleVehicleChange(-1)}
          className="px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400 transition"
        >
          ◀
        </button>
        <div className="text-center">
          <img
            src={vehicleTypes[currentVehicleIndex].image}
            alt={vehicleTypes[currentVehicleIndex].type}
            className="w-100 h-64 mx-auto" // 사진 크기를 4배로 키움
          />
          <p className="text-xl font-semibold mt-4">
            {vehicleTypes[currentVehicleIndex].type}
          </p>
        </div>
        <button
          onClick={() => handleVehicleChange(1)}
          className="px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400 transition"
        >
          ▶
        </button>
      </div>

      {/* 차량 재원 입력 */}
      <div className="space-y-6 bg-gray-100 p-4 rounded-md">
        <h2 className="text-xl font-bold mb-2 border-b pb-2 text-left">차량 제원</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-left">차량 중량 (kg)</label>
            <input
              type="number"
              name="mass"
              value={vehicleSpecs.mass}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">휠 반지름 (m)</label>
            <input
              type="number"
              name="wheelRadius"
              value={vehicleSpecs.wheelRadius}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">기어비</label>
            <input
              type="number"
              name="gearRatio"
              value={vehicleSpecs.gearRatio}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">구동 효율 (%)</label>
            <input
              type="number"
              name="drivetrainEfficiency"
              value={vehicleSpecs.drivetrainEfficiency}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">최대 모터 토크 (Nm)</label>
            <input
              type="number"
              name="maxMotorTorque"
              value={vehicleSpecs.maxMotorTorque}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">회생 제동 토크 한계 (Nm)</label>
            <input
              type="number"
              name="regenTorqueLimit"
              value={vehicleSpecs.regenTorqueLimit}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
        </div>
      </div>

      {/* 주행 환경 입력 */}
      <div className="space-y-6 bg-gray-100 p-4 rounded-md mt-2">
        <h2 className="text-xl font-bold mb-2 border-b pb-2 text-left">주행 환경</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-left">공기 저항 계수 (Cd)</label>
            <input
              type="number"
              name="cd"
              value={vehicleSpecs.cd}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">구름 저항 계수 (Cr)</label>
            <input
              type="number"
              name="cr"
              value={vehicleSpecs.cr}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">전면 면적 (m²)</label>
            <input
              type="number"
              name="frontalArea"
              value={vehicleSpecs.frontalArea}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">공기 밀도 (kg/m³)</label>
            <input
              type="number"
              name="airDensity"
              value={vehicleSpecs.airDensity}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-left">경사각 (°)</label>
            <input
              type="number"
              name="slopeAngleDeg"
              value={vehicleSpecs.slopeAngleDeg}
              onChange={handleInputChange}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
        </div>
      </div>

      <div className="text-right mt-6">
        <button
          onClick={handleSubmit}
          className="px-6 py-3 bg-blue-500 text-white font-bold rounded shadow hover:bg-blue-600 transition"
        >
          저장
        </button>
      </div>
    </div>
  );
}