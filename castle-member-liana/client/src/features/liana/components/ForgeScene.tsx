"use client";

import { Sparkles, Stars } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ForgeBackdrop } from "./ForgeBackdrop";

function ForgeCameraRig() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime() * 0.12;
    camera.position.x = Math.sin(t) * 0.55;
    camera.position.y = 1 + Math.cos(t * 1.4) * 0.22;
    camera.lookAt(0, 0.1, -0.8);
  });

  return null;
}

function EclipseMoon() {
  const moonRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    if (moonRef.current) {
      moonRef.current.rotation.y += delta * 0.08;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.06;
    }

    if (shadowRef.current) {
      shadowRef.current.position.x = Math.sin(t * 0.35) * 0.16 + 0.18;
    }
  });

  return (
    <group position={[0, 1.85, -4.8]}>
      <mesh ref={moonRef}>
        <sphereGeometry args={[1.18, 64, 64]} />
        <meshStandardMaterial
          color="#d6b35f"
          emissive="#d6b35f"
          emissiveIntensity={0.26}
          metalness={0.35}
          roughness={0.52}
        />
      </mesh>
      <mesh ref={shadowRef} position={[0.18, 0, 0.36]}>
        <sphereGeometry args={[1.02, 48, 48]} />
        <meshStandardMaterial color="#070913" roughness={0.84} metalness={0.08} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2.1, 0, 0.4]}>
        <torusGeometry args={[1.62, 0.03, 24, 160]} />
        <meshStandardMaterial color="#f6f1de" emissive="#f6f1de" emissiveIntensity={0.16} />
      </mesh>
    </group>
  );
}

function MountainRange() {
  const mountains = useMemo(
    () => [
      { position: [-4.4, -2.15, -6.8] as [number, number, number], scale: 1.5 },
      { position: [-2.4, -2.2, -5.7] as [number, number, number], scale: 2.1 },
      { position: [0.1, -2.28, -6.3] as [number, number, number], scale: 2.8 },
      { position: [2.8, -2.18, -5.9] as [number, number, number], scale: 2 },
      { position: [4.9, -2.08, -6.8] as [number, number, number], scale: 1.35 }
    ],
    []
  );

  return (
    <group>
      {mountains.map((mountain) => (
        <mesh key={mountain.position.join(":")} position={mountain.position} scale={mountain.scale}>
          <coneGeometry args={[1, 1.8, 5]} />
          <meshStandardMaterial color="#1a2236" roughness={0.95} metalness={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function RiverRibbon() {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.6, -1.98, -2),
        new THREE.Vector3(-1.2, -1.75, -1.2),
        new THREE.Vector3(0.2, -1.9, -1.8),
        new THREE.Vector3(1.5, -1.68, -0.9),
        new THREE.Vector3(3.3, -1.88, -1.4)
      ]),
    []
  );
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) {
      return;
    }

    const material = ref.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 0.18 + Math.sin(clock.getElapsedTime() * 1.2) * 0.06;
  });

  return (
    <mesh ref={ref} rotation={[-0.12, 0, 0]}>
      <tubeGeometry args={[curve, 96, 0.07, 12, false]} />
      <meshStandardMaterial
        color="#53b7b0"
        emissive="#53b7b0"
        emissiveIntensity={0.14}
        roughness={0.38}
        metalness={0.46}
      />
    </mesh>
  );
}

function EmberField() {
  const points = useMemo(() => {
    const buffer = new Float32Array(640 * 3);

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
        color="#d6b35f"
        size={0.05}
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
        <color attach="background" args={["#070913"]} />
        <fog attach="fog" args={["#070913", 8, 22]} />
        <ambientLight intensity={0.42} color="#f6f1de" />
        <pointLight position={[0, 2.2, 1.4]} intensity={16} color="#d6b35f" />
        <pointLight position={[0, -1.2, -3.5]} intensity={7} color="#8c5870" />
        <pointLight position={[-3.5, 0.5, -1.5]} intensity={6} color="#53b7b0" />
        <spotLight
          position={[0, 8, 6]}
          angle={0.42}
          penumbra={0.8}
          intensity={45}
          color="#f6f1de"
        />
        <ForgeCameraRig />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.3, 0]}>
          <circleGeometry args={[8, 96]} />
          <meshStandardMaterial color="#11182a" roughness={0.95} metalness={0.1} />
        </mesh>

        <mesh position={[0, -1.15, 0]}>
          <cylinderGeometry args={[1.6, 2.1, 0.48, 9]} />
          <meshStandardMaterial color="#182134" roughness={0.76} metalness={0.22} />
        </mesh>

        <EclipseMoon />
        <MountainRange />
        <RiverRibbon />

        <Sparkles
          count={220}
          scale={[14, 10, 14]}
          size={2.1}
          speed={0.16}
          opacity={0.85}
          color="#d6b35f"
        />
        <Stars radius={34} depth={20} count={1200} factor={3} saturation={0} fade speed={0.25} />
        <EmberField />
      </Canvas>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,_rgba(214,179,95,0.1),_transparent_24%),linear-gradient(180deg,_rgba(7,9,19,0.08),_rgba(7,9,19,0.64)_68%,_rgba(7,9,19,0.94))]" />
    </div>
  );
}
