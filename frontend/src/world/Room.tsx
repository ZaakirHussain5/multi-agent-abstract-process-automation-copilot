import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { SceneConfig } from "@/lib/types";
import { deskSlots } from "@/world/state";

const WINDOW: Record<SceneConfig["time_of_day"], string> = {
  dawn: "#f3b183",
  day: "#f6f1e6",
  dusk: "#e08a62",
  night: "#1a2740",
};

function posterUrl(image: string): string | null {
  if (!image) return null;
  if (image.startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`;
  return image;
}

function Instances({
  count,
  matrices,
  color,
  geometry,
  roughness = 0.72,
  emissive,
  simple,
}: {
  count: number;
  matrices: THREE.Matrix4[];
  color: string;
  geometry: "box" | "cylinder" | "sphere";
  roughness?: number;
  emissive?: string;
  simple: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);
  if (count <= 0) return null;
  return (
    <instancedMesh key={count} ref={ref} args={[undefined, undefined, count]} castShadow={!simple} receiveShadow>
      {geometry === "box" ? <boxGeometry args={[1, 1, 1]} /> : null}
      {geometry === "cylinder" ? <cylinderGeometry args={[0.5, 0.5, 1, simple ? 6 : 10]} /> : null}
      {geometry === "sphere" ? <sphereGeometry args={[0.5, simple ? 6 : 10, simple ? 6 : 8]} /> : null}
      {simple ? (
        <meshLambertMaterial color={color} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.8 : 0} />
      ) : (
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          metalness={0.02}
          emissive={emissive ?? "#000"}
          emissiveIntensity={emissive ? 0.9 : 0}
        />
      )}
    </instancedMesh>
  );
}

function mat(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0) {
  const dummy = new THREE.Object3D();
  dummy.position.set(x, y, z);
  dummy.rotation.y = rotY;
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

export function Room({ scene, simple }: { scene: SceneConfig; simple: boolean }) {
  const { floor, wall, trim, fog, accent } = scene.palette;
  const roof = scene.preset === "rooftop";
  const night = scene.time_of_day === "night" || scene.time_of_day === "dusk";
  const slots = useMemo(() => deskSlots(scene.layout === "meeting" ? 6 : 6, scene.layout), [scene.layout]);
  const deskColor = scene.preset === "lab" ? "#e7eef3" : scene.preset === "war_room" ? "#2a241c" : "#cbb89a";
  const chairColor = trim;

  const desks = useMemo(
    () => slots.map((slot) => mat(slot.x, 0.4, slot.z + Math.sin(slot.rot) * -0.15, 1.15, 0.06, 0.62, slot.rot)),
    [slots],
  );
  const chairs = useMemo(
    () => slots.map((slot) => mat(slot.x, 0.28, slot.z, 0.42, 0.46, 0.42, slot.rot)),
    [slots],
  );
  const screens = useMemo(() => {
    if (!scene.props.screens) return [];
    return slots.map((slot) => mat(slot.x, 0.72, slot.z - 0.22 * Math.cos(slot.rot), 0.46, 0.28, 0.03, slot.rot));
  }, [scene.props.screens, slots]);
  const plants = useMemo(() => {
    if (!scene.props.plants) return [];
    const spots = [
      [-4.4, 0.35, -2.6],
      [4.3, 0.42, -2.2],
      [-4.6, 0.28, 2.2],
      [4.5, 0.3, 2.4],
    ];
    const used = simple ? spots.slice(0, 2) : spots;
    return used.map(([x, y, z]) => mat(x, y, z, 0.34, 0.7, 0.34));
  }, [scene.props.plants, simple]);
  const bulbs = useMemo(() => {
    if (!scene.props.lamps) return [];
    const count = roof ? (simple ? 6 : 10) : 3;
    return Array.from({ length: count }, (_, index) => {
      const t = index / Math.max(count - 1, 1);
      const x = roof ? -4.2 + t * 8.4 : -1.2 + index * 1.2;
      const y = roof ? 2.35 + Math.sin(t * Math.PI) * 0.25 : 2.15;
      const z = roof ? -0.2 : -3.35;
      return mat(x, y, z, 0.12, 0.12, 0.12);
    });
  }, [scene.props.lamps, roof, simple]);
  const shelves = useMemo(() => {
    if (scene.preset !== "library") return [];
    return [-3.2, -1.1, 1.1, 3.2].map((x) => mat(x, 1.15, -3.55, 1.5, 2.1, 0.28));
  }, [scene.preset]);

  return (
    <group>
      <color attach="background" args={[fog]} />
      <fog attach="fog" args={[fog, roof ? 14 : 11, roof ? 32 : 26]} />
      <hemisphereLight
        color={night ? "#243044" : "#fff4e4"}
        groundColor={floor}
        intensity={scene.lighting.ambient}
      />
      <directionalLight
        position={[6.5, 9, 4]}
        intensity={scene.lighting.key}
        color={night ? "#b9c7e6" : "#fff1dc"}
        castShadow={!simple}
        shadow-mapSize-width={simple ? 256 : 1024}
        shadow-mapSize-height={simple ? 256 : 1024}
        shadow-camera-near={0.5}
        shadow-camera-far={24}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      {scene.props.lamps ? (
        <pointLight
          position={[0, 2.3, 0]}
          color={scene.lighting.accent}
          intensity={night ? 2.2 : 0.45}
          distance={12}
          decay={2}
        />
      ) : null}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[18, simple ? 24 : 48]} />
        <meshStandardMaterial color={fog} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[11.2, 8.2]} />
        {simple ? (
          <meshLambertMaterial color={floor} />
        ) : (
          <meshStandardMaterial color={floor} roughness={0.9} metalness={0} />
        )}
      </mesh>

      {scene.props.rug ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0.15]} receiveShadow>
          <planeGeometry args={[scene.layout === "meeting" ? 4.4 : 3.2, scene.layout === "meeting" ? 3.2 : 2.2]} />
          <meshStandardMaterial color={accent} roughness={1} />
        </mesh>
      ) : null}

      {roof ? (
        <group>
          <mesh position={[0, 0.35, -3.9]} castShadow>
            <boxGeometry args={[11.2, 0.7, 0.18]} />
            <meshStandardMaterial color={trim} roughness={0.8} />
          </mesh>
          <mesh position={[-5.5, 0.28, 0]}>
            <boxGeometry args={[0.16, 0.56, 8.2]} />
            <meshStandardMaterial color={trim} roughness={0.8} />
          </mesh>
          <mesh position={[5.5, 0.28, 0]}>
            <boxGeometry args={[0.16, 0.56, 8.2]} />
            <meshStandardMaterial color={trim} roughness={0.8} />
          </mesh>
        </group>
      ) : (
        <group>
          <mesh position={[0, 1.55, -4]} receiveShadow castShadow>
            <boxGeometry args={[11.2, 3.1, 0.16]} />
            <meshStandardMaterial color={wall} roughness={0.92} />
          </mesh>
          <mesh position={[-5.55, 1.55, 0]} receiveShadow>
            <boxGeometry args={[0.16, 3.1, 8.1]} />
            <meshStandardMaterial color={wall} roughness={0.92} />
          </mesh>
          <mesh position={[5.55, 1.55, 0]} receiveShadow>
            <boxGeometry args={[0.16, 3.1, 8.1]} />
            <meshStandardMaterial color={wall} roughness={0.92} />
          </mesh>
          <mesh position={[0, 2.05, -3.9]}>
            <planeGeometry args={[3.4, 1.35]} />
            <meshStandardMaterial color={WINDOW[scene.time_of_day]} emissive={WINDOW[scene.time_of_day]} emissiveIntensity={night ? 0.35 : 0.55} />
          </mesh>
          <mesh position={[0, 2.05, -3.88]}>
            <boxGeometry args={[3.55, 0.06, 0.04]} />
            <meshStandardMaterial color={trim} />
          </mesh>
          <mesh position={[0, 1.4, -3.88]}>
            <boxGeometry args={[3.55, 0.06, 0.04]} />
            <meshStandardMaterial color={trim} />
          </mesh>
        </group>
      )}

      <mesh position={[0, scene.layout === "meeting" ? 0.42 : 0.36, 0]} castShadow receiveShadow>
        <boxGeometry args={[scene.layout === "meeting" ? 2.8 : 1.6, 0.08, scene.layout === "meeting" ? 1.5 : 0.9]} />
        <meshStandardMaterial color={scene.preset === "war_room" ? "#14161c" : deskColor} roughness={0.55} />
      </mesh>

      <Instances count={desks.length} matrices={desks} color={deskColor} geometry="box" simple={simple} roughness={0.62} />
      <Instances count={chairs.length} matrices={chairs} color={chairColor} geometry="box" simple={simple} roughness={0.8} />
      <Instances count={screens.length} matrices={screens} color={night ? "#9ecbff" : "#1d2430"} geometry="box" simple={simple} emissive={night ? "#7eb6ff" : undefined} />
      <Instances count={plants.length} matrices={plants} color={"#3f6b45"} geometry="sphere" simple={simple} roughness={0.9} />
      <Instances count={bulbs.length} matrices={bulbs} color={accent} geometry="sphere" simple={simple} emissive={accent} />
      <Instances count={shelves.length} matrices={shelves} color={"#6a432c"} geometry="box" simple={simple} roughness={0.8} />

      {scene.props.posters ? <Poster scene={scene} /> : null}
    </group>
  );
}

function Poster({ scene }: { scene: SceneConfig }) {
  const url = posterUrl(scene.poster_image);
  return (
    <group position={[3.15, 1.7, -3.9]}>
      <mesh>
        <planeGeometry args={[1.35, 1.7]} />
        <meshStandardMaterial color={scene.palette.trim} />
      </mesh>
      {url ? (
        <Suspense
          fallback={
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[1.15, 1.45]} />
              <meshStandardMaterial color={scene.palette.accent} />
            </mesh>
          }
        >
          <PosterImage url={url} />
        </Suspense>
      ) : (
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[1.15, 1.45]} />
          <meshStandardMaterial color={scene.palette.accent} />
        </mesh>
      )}
    </group>
  );
}

function PosterImage({ url }: { url: string }) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[1.15, 1.45]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
