"use client";

import { Sparkles, Stars } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ForgeBackdrop } from "./ForgeBackdrop";

function ForgeCameraRig() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime() * 0.14;
    camera.position.x = Math.sin(t) * 0.8;
    camera.position.y = 1.2 + Math.cos(t * 1.2) * 0.25;
    camera.lookAt(0, 0.3, 0);
  });

  return null;
}

function SacredMesh({
  position,
  scale,
  color,
  rotationSpeed,
}: {
  position: [number, number, number];
  scale: number;
  color: string;
  rotationSpeed: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) {
      return;
    }

    ref.current.rotation.x += delta * rotationSpeed * 0.6;
    ref.current.rotation.y += delta * rotationSpeed;
  });

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <torusKnotGeometry args={[0.8, 0.22, 164, 18, 2, 3]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.32}
        roughness={0.3}
        metalness={0.55}
      />
    </mesh>
  );
}

function EmberField() {
  const points = useMemo(() => {
    const buffer = new Float32Array(500 * 3);

    for (let i = 0; i < buffer.length; i += 3) {
      buffer[i] = (Math.random() - 0.5) * 18;
      buffer[i + 1] = Math.random() * 10 - 4;
      buffer[i + 2] = (Math.random() - 0.5) * 18;
    }

    return buffer;
  }, []);

  const ref = useRef<THREE.Points>(null);

  useFrame((_, delta) => {
    if (!ref.current) {
      return;
    }

    ref.current.rotation.y += delta * 0.025;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          args={[points, 3]}
          attach="attributes-position"
          count={points.length / 3}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#d4af37"
        size={0.06}
        sizeAttenuation
        transparent
        opacity={0.8}
      />
    </points>
  );
}

export function ForgeScene() {
  const reducedMotion = Boolean(useReducedMotion());
  const [show3d, setShow3d] = useState(false);

  useEffect(() => {
    const browserNavigator = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
    };
    const enable3d =
      !reducedMotion &&
      typeof window !== "undefined" &&
      window.innerWidth >= 900 &&
      !window.matchMedia("(pointer: coarse)").matches &&
      !browserNavigator.connection?.saveData &&
      (browserNavigator.deviceMemory === undefined ||
        browserNavigator.deviceMemory >= 4);

    setShow3d(enable3d);
  }, [reducedMotion]);

  if (!show3d) {
    return <ForgeBackdrop />;
  }

  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <Canvas camera={{ position: [0, 1.2, 8], fov: 48 }} dpr={[1, 1.6]}>
        <color attach="background" args={["#071920"]} />
        <fog attach="fog" args={["#071920", 8, 22]} />
        <ambientLight intensity={0.45} color="#f5f5f5" />
        <pointLight position={[0, 1.5, 2.5]} intensity={18} color="#c9a84c" />
        <pointLight position={[0, -1.5, -3.5]} intensity={9} color="#8b1e3f" />
        <spotLight
          position={[0, 8, 6]}
          angle={0.42}
          penumbra={0.8}
          intensity={45}
          color="#f5f5f5"
        />
        <ForgeCameraRig />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.3, 0]}>
          <circleGeometry args={[8, 96]} />
          <meshStandardMaterial color="#102a31" roughness={0.95} metalness={0.1} />
        </mesh>

        <mesh position={[0, -1.15, 0]}>
          <cylinderGeometry args={[1.3, 1.8, 0.55, 9]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.7} metalness={0.32} />
        </mesh>

        <SacredMesh position={[-3.2, 1.6, -4]} scale={0.9} color="#c9a84c" rotationSpeed={0.18} />
        <SacredMesh position={[3.4, -0.3, -5.2]} scale={1.1} color="#8b1e3f" rotationSpeed={0.14} />
        <SacredMesh position={[0.3, 2.8, -6.6]} scale={0.7} color="#d7bf73" rotationSpeed={0.2} />

        <Sparkles
          count={180}
          scale={[14, 10, 14]}
          size={2.6}
          speed={0.18}
          opacity={0.85}
          color="#d4af37"
        />
        <Stars radius={34} depth={20} count={1200} factor={3} saturation={0} fade speed={0.25} />
        <EmberField />
      </Canvas>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,_rgba(201,168,76,0.12),_transparent_28%),linear-gradient(180deg,_rgba(7,25,32,0.08),_rgba(7,25,32,0.62)_68%,_rgba(4,12,16,0.92))]" />
    </div>
  );
}
