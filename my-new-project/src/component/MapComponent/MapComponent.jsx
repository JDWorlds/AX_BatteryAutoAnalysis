import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapComponent() {
  const mapContainerRef = useRef(null);

  useEffect(() => {
    // MapLibre GL JS 초기화
    const map = new maplibregl.Map({
      container: mapContainerRef.current, // 지도를 렌더링할 DOM 요소
      style: "http://localhost:8080/styles/basic-preview/style.json", // Tileserver-GL 스타일 URL
      center: [127.1432, 37.4536], // 초기 중심 좌표 (경도, 위도)
      zoom: 11.01, // 초기 줌 레벨
    });

    // 지도 컨트롤 추가 (줌 및 회전)
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    return () => {
      // 컴포넌트 언마운트 시 지도 정리
      map.remove();
    };
  }, []);

  return (
    <div
      ref={mapContainerRef}
      style={{
        height: "500px", // 지도 높이
        width: "100%", // 지도 너비
      }}
    ></div>
  );
}