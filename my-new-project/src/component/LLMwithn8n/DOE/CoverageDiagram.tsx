// BarChartFancy.tsx
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';

type BarData = {
  x: number;
  z: number;
  height: number;     // y axis
  soc: number;        // 0 (red) → 1 (blue)
  qdDrop: number;     // 0 (transparent) → 1 (opaque)
  irTavg: number;     // 0.3 (thin) → 1 (thick)
};

const sampleData: BarData[] = [
  { x: 0, z: 0, height: 300, soc: 0.9, qdDrop: 0.2, irTavg: 0.6 },
  { x: 1, z: 0, height: 650, soc: 0.8, qdDrop: 0.3, irTavg: 0.8 },
  { x: 2, z: 0, height: 900, soc: 1.0, qdDrop: 0.1, irTavg: 1.0 },
  { x: 0, z: 1, height: 250, soc: 0.1, qdDrop: 0.9, irTavg: 0.4 },
  { x: 1, z: 1, height: 500, soc: 0.2, qdDrop: 0.7, irTavg: 0.7 },
  { x: 2, z: 1, height: 250, soc: 0.0, qdDrop: 0.8, irTavg: 0.5 },
];

const Bar: React.FC<{ data: BarData }> = ({ data }) => {
  const { x, z, height, soc, qdDrop, irTavg } = data;

  const color = new THREE.Color().setHSL((0.0 + (1.0 - soc) * 0.6), 1, 0.5); // blue → red
  const opacity = THREE.MathUtils.clamp(1 - qdDrop, 0.2, 1); // Qd drop
  const size = 80 * irTavg; // width/depth scale

  return (
    <mesh position={[x * 120 + 60, height / 2, z * 120 + 60]}>
      <boxGeometry args={[size, height, size]} />
      <meshLambertMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
};

const DOE4DVisualizer: React.FC = () => {
  return (
    <Canvas style={{ background: '#111' }}>
      <PerspectiveCamera makeDefault position={[400, 500, 600]} />
      <OrbitControls target={[180, 200, 60]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[500, 800, 500]} intensity={0.8} />
      <axesHelper args={[500]} />
      <gridHelper args={[500, 10, 0x333333, 0x222222]} />
      {sampleData.map((bar, i) => (
        <Bar key={i} data={bar} />
      ))}
      {/* (선택) 라벨이나 범례는 여기에 Html 사용 가능 */}
    </Canvas>
  );
};

export default DOE4DVisualizer;

