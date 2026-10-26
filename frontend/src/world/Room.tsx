import { Suspense, useEffect, useMemo, useRef } from "react";
import { ContactShadows, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneConfig } from "@/lib/types";
import { deskSlots, type Slot } from "@/world/state";
import { paintScreen, screenTexture, skyTexture } from "@/world/textures";

export type RoomFeed = { lines: string[]; plans: string[] };

function forward(slot: Slot, distance: number): [number, number] {
  return [slot.x + Math.sin(slot.rot) * distance, slot.z + Math.cos(slot.rot) * distance];
}

function Mat({
  color,
  simple,
  roughness = 0.72,
  metalness = 0.04,
  emissive,
  emissiveIntensity = 0,
  map,
}: {
  color: string;
  simple: boolean;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  map?: THREE.Texture;
}) {
  if (simple) return <meshLambertMaterial color={color} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} map={map} />;
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive ?? "#000"}
      emissiveIntensity={emissiveIntensity}
      map={map}
      emissiveMap={emissive ? map : undefined}
    />
  );
}

export function Room({
  scene,
  simple,
  seats,
  feed,
}: {
  scene: SceneConfig;
  simple: boolean;
  seats: number;
  feed: RoomFeed;
}) {
  const { floor, wall, trim, fog, accent } = scene.palette;
  const roof = scene.preset === "rooftop";
  const night = scene.time_of_day === "night" || scene.time_of_day === "dusk";
  const slots = useMemo(() => deskSlots(Math.max(seats, 1), scene.layout), [seats, scene.layout]);
  const sky = useMemo(() => skyTexture(scene.time_of_day), [scene.time_of_day]);
  const deskWood = scene.preset === "lab" ? "#e7eef3" : scene.preset === "war_room" ? "#2a241c" : scene.preset === "library" ? "#6d4c32" : "#cbb89a";
  const showScreens = scene.props.screens || scene.preset === "lab" || scene.preset === "war_room";

  return (
    <group>
      <color attach="background" args={[fog]} />
      <fog attach="fog" args={[fog, roof ? 16 : 12, roof ? 36 : 28]} />
      <hemisphereLight color={night ? "#9eb4d6" : "#fff6ea"} groundColor={floor} intensity={scene.lighting.ambient * 0.9} />
      <directionalLight
        position={[7, 11, 5]}
        intensity={scene.lighting.key}
        color={night ? "#c5d4ee" : "#fff3df"}
        castShadow={!simple}
        shadow-mapSize-width={simple ? 512 : 2048}
        shadow-mapSize-height={simple ? 512 : 2048}
        shadow-bias={-0.0004}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      <directionalLight position={[-6, 4, -3]} intensity={0.25} color={night ? "#6e88b8" : "#ffe8d2"} />
      {scene.props.lamps ? <pointLight position={[0, 2.4, 0]} color={accent} intensity={night ? 2.4 : 0.55} distance={14} decay={2} /> : null}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <circleGeometry args={[22, simple ? 24 : 64]} />
        <meshStandardMaterial color={fog} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[11.4, 8.4]} />
        <Mat color={floor} simple={simple} roughness={0.86} />
      </mesh>
      {simple ? null : <ContactShadows position={[0, 0.012, 0.2]} opacity={night ? 0.45 : 0.32} scale={16} blur={2.6} far={3.2} />}

      {scene.props.rug ? (
        <group position={[0, 0.02, 0.2]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[scene.layout === "meeting" ? 4.8 : 3.6, scene.layout === "meeting" ? 3.4 : 2.4]} />
            <Mat color={accent} simple={simple} roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
            <ringGeometry args={[0.7, 0.86, 32]} />
            <meshStandardMaterial color={trim} roughness={1} />
          </mesh>
        </group>
      ) : null}

      {roof ? <Parapet trim={trim} /> : <Walls scene={scene} simple={simple} sky={sky} />}

      <MeetingTable scene={scene} simple={simple} wood={deskWood} />
      {slots.map((slot, index) => (
        <Desk
          key={`${slot.x}-${slot.z}-${index}`}
          slot={slot}
          wood={deskWood}
          trim={trim}
          accent={accent}
          simple={simple}
          screen={showScreens}
          line={feed.lines[index % Math.max(feed.lines.length, 1)] ?? feed.lines[0]}
          lines={feed.lines}
        />
      ))}
      <Whiteboard trim={trim} wall={wall} accent={accent} simple={simple} plans={feed.plans} />
      <Plants simple={simple} accent={accent} full={scene.props.plants || scene.preset === "library" || scene.preset === "loft" || scene.preset === "studio" || scene.preset === "rooftop"} />
      <Shelves preset={scene.preset} trim={trim} simple={simple} />
      <ChargeStation accent={accent} trim={trim} simple={simple} night={night} />
      {scene.props.lamps ? <Lamps scene={scene} simple={simple} /> : null}
      {scene.preset === "studio" ? <Easel accent={accent} trim={trim} /> : null}
      {scene.preset === "lab" ? <Holo accent={accent} /> : null}
      {roof && !simple ? <StringLights accent={accent} /> : null}
      {simple ? null : <Motes night={night} accent={accent} />}
      {scene.props.posters ? <Poster scene={scene} /> : null}
    </group>
  );
}

function Walls({ scene, simple, sky }: { scene: SceneConfig; simple: boolean; sky: THREE.CanvasTexture }) {
  const { wall, trim } = scene.palette;
  return (
    <group>
      <mesh position={[0, 1.6, -4.05]} receiveShadow castShadow>
        <boxGeometry args={[11.4, 3.2, 0.16]} />
        <Mat color={wall} simple={simple} roughness={0.94} />
      </mesh>
      <mesh position={[-5.62, 1.6, 0]} receiveShadow>
        <boxGeometry args={[0.16, 3.2, 8.2]} />
        <Mat color={wall} simple={simple} roughness={0.94} />
      </mesh>
      <mesh position={[5.62, 1.6, 0]} receiveShadow>
        <boxGeometry args={[0.16, 3.2, 8.2]} />
        <Mat color={wall} simple={simple} roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.08, -3.96]}>
        <boxGeometry args={[11.2, 0.12, 0.08]} />
        <Mat color={trim} simple={simple} roughness={0.6} />
      </mesh>
      <group position={[0, 2.05, -3.9]}>
        <mesh>
          <planeGeometry args={[4.4, 1.55]} />
          <meshBasicMaterial map={sky} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <boxGeometry args={[4.55, 0.06, 0.04]} />
          <Mat color={trim} simple={simple} />
        </mesh>
        <mesh position={[0, -0.75, 0.02]}>
          <boxGeometry args={[4.55, 0.06, 0.04]} />
          <Mat color={trim} simple={simple} />
        </mesh>
        <mesh position={[0, 0.78, 0.02]}>
          <boxGeometry args={[4.55, 0.06, 0.04]} />
          <Mat color={trim} simple={simple} />
        </mesh>
        <mesh position={[-1.1, 0, 0.03]}>
          <boxGeometry args={[0.05, 1.55, 0.04]} />
          <Mat color={trim} simple={simple} />
        </mesh>
        <mesh position={[1.1, 0, 0.03]}>
          <boxGeometry args={[0.05, 1.55, 0.04]} />
          <Mat color={trim} simple={simple} />
        </mesh>
      </group>
    </group>
  );
}

function Parapet({ trim }: { trim: string }) {
  return (
    <group>
      <mesh position={[0, 0.42, -3.95]} castShadow>
        <boxGeometry args={[11.4, 0.84, 0.16]} />
        <meshStandardMaterial color={trim} roughness={0.7} />
      </mesh>
      <mesh position={[-5.6, 0.36, 0]}>
        <boxGeometry args={[0.16, 0.72, 8.3]} />
        <meshStandardMaterial color={trim} roughness={0.7} />
      </mesh>
      <mesh position={[5.6, 0.36, 0]}>
        <boxGeometry args={[0.16, 0.72, 8.3]} />
        <meshStandardMaterial color={trim} roughness={0.7} />
      </mesh>
    </group>
  );
}

function MeetingTable({ scene, simple, wood }: { scene: SceneConfig; simple: boolean; wood: string }) {
  const wide = scene.layout === "meeting" || scene.preset === "war_room";
  return (
    <group position={[0, 0, 0.15]}>
      <mesh position={[0, wide ? 0.42 : 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[wide ? 2.8 : 1.7, 0.08, wide ? 1.45 : 0.95]} />
        <Mat color={scene.preset === "war_room" ? "#14161c" : wood} simple={simple} roughness={0.45} metalness={0.08} />
      </mesh>
      {[-1, 1].map((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}${z}`} position={[(wide ? 1.15 : 0.65) * x, 0.18, (wide ? 0.55 : 0.32) * z]} castShadow>
            <cylinderGeometry args={[0.045, 0.05, 0.36, 8]} />
            <Mat color={scene.palette.trim} simple={simple} metalness={0.2} roughness={0.4} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Desk({
  slot,
  wood,
  trim,
  accent,
  simple,
  screen,
  line,
  lines,
}: {
  slot: Slot;
  wood: string;
  trim: string;
  accent: string;
  simple: boolean;
  screen: boolean;
  line: string;
  lines: string[];
}) {
  const [x, z] = forward(slot, 0.72);
  const texture = useMemo(() => screenTexture([line], accent), [accent, line]);
  useEffect(() => {
    paintScreen(texture, lines.length ? lines : [line], accent);
  }, [texture, lines, line, accent]);
  return (
    <group position={[x, 0, z]} rotation={[0, slot.rot, 0]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.05, 0.06, 0.58]} />
        <Mat color={wood} simple={simple} roughness={0.55} />
      </mesh>
      <mesh position={[-0.42, 0.2, 0.18]} castShadow>
        <boxGeometry args={[0.06, 0.4, 0.06]} />
        <Mat color={trim} simple={simple} />
      </mesh>
      <mesh position={[0.42, 0.2, 0.18]} castShadow>
        <boxGeometry args={[0.06, 0.4, 0.06]} />
        <Mat color={trim} simple={simple} />
      </mesh>
      <mesh position={[0, 0.22, -0.22]} castShadow>
        <boxGeometry args={[0.42, 0.36, 0.42]} />
        <Mat color={trim} simple={simple} roughness={0.8} />
      </mesh>
      {screen ? (
        <group position={[0, 0.72, -0.12]}>
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.32, 0.03]} />
            <Mat color="#1a212b" simple={simple} roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[0.44, 0.26]} />
            <meshStandardMaterial map={texture} emissive="#d7f2ff" emissiveMap={texture} emissiveIntensity={simple ? 0.35 : 1.15} roughness={0.35} toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.06, 0.08, 0.06]} />
            <Mat color="#1a212b" simple={simple} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function Whiteboard({
  trim,
  wall,
  accent,
  simple,
  plans,
}: {
  trim: string;
  wall: string;
  accent: string;
  simple: boolean;
  plans: string[];
}) {
  const texture = useMemo(() => screenTexture(plans, accent), [accent, plans]);
  useEffect(() => {
    paintScreen(texture, plans, accent);
  }, [texture, plans, accent]);
  return (
    <group position={[-5.48, 1.55, -0.4]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[1.7, 1.05]} />
        <Mat color={wall} simple={simple} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[1.5, 0.86]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={simple ? 0.15 : 0.35} />
      </mesh>
      <mesh position={[0, -0.56, 0.03]}>
        <boxGeometry args={[1.7, 0.05, 0.04]} />
        <Mat color={trim} simple={simple} />
      </mesh>
    </group>
  );
}

function Plants({ simple, accent, full }: { simple: boolean; accent: string; full: boolean }) {
  const all = [[-4.4, -2.6], [4.35, -1.5], [-4.5, 1.4], [3.2, -2.8], [-2.4, -3.15]];
  const spots = simple || !full ? all.slice(0, 2) : all;
  return (
    <group>
      {spots.map(([x, z], index) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.16, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.13, 0.32, 8]} />
            <meshStandardMaterial color={index % 2 ? "#8d5a3c" : "#6e4630"} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.48, 0]} castShadow>
            <sphereGeometry args={[0.26, simple ? 8 : 14, simple ? 6 : 10]} />
            <meshStandardMaterial color={index % 2 ? "#3f6b45" : "#2f6a4a"} roughness={0.85} />
          </mesh>
          <mesh position={[0.12, 0.62, 0.05]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Shelves({ preset, trim, simple }: { preset: SceneConfig["preset"]; trim: string; simple: boolean }) {
  const count = preset === "library" ? 4 : preset === "loft" || preset === "studio" ? 1 : 0;
  if (count === 0 || (simple && preset !== "library")) return null;
  const xs = preset === "library" ? [-3.3, -1.1, 1.2, 3.3] : [3.6];
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, 0, -3.72]}>
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[1.35, 2.2, 0.28]} />
            <meshStandardMaterial color={preset === "library" ? "#6a432c" : trim} roughness={0.75} />
          </mesh>
          {Array.from({ length: simple ? 3 : 6 }, (_, index) => (
            <mesh key={index} position={[-0.42 + (index % 3) * 0.28, 0.45 + Math.floor(index / 3) * 0.7, 0.16]}>
              <boxGeometry args={[0.16, 0.42, 0.08]} />
              <meshStandardMaterial color={index % 2 ? "#c4553a" : "#d8c7a2"} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function ChargeStation({ accent, trim, simple, night }: { accent: string; trim: string; simple: boolean; night: boolean }) {
  const pad = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!pad.current) return;
    const material = pad.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = (night ? 0.8 : 0.35) + Math.sin(state.clock.elapsedTime * 2) * 0.15;
  });
  return (
    <group position={[4.35, 0, -0.15]}>
      <mesh position={[0, 0.42, -0.35]} castShadow>
        <boxGeometry args={[1.15, 0.84, 0.42]} />
        <meshStandardMaterial color={trim} roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh position={[-0.2, 0.72, -0.12]}>
        <cylinderGeometry args={[0.08, 0.09, 0.16, 10]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.4} />
      </mesh>
      <mesh position={[0.22, 0.68, -0.12]}>
        <boxGeometry args={[0.22, 0.08, 0.16]} />
        <meshStandardMaterial color="#2a2420" roughness={0.4} />
      </mesh>
      <mesh ref={pad} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0.25]}>
        <circleGeometry args={[0.42, 20]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} />
      </mesh>
      {simple ? null : (
        <mesh position={[-0.2, 0.95, -0.12]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.45} />
        </mesh>
      )}
    </group>
  );
}

function Lamps({ scene, simple }: { scene: SceneConfig; simple: boolean }) {
  const spots = scene.preset === "rooftop" ? [-3.2, -1, 1.2, 3.4] : [-2.4, 2.4];
  return (
    <group>
      {spots.map((x) => (
        <group key={x} position={[x, 0, scene.preset === "rooftop" ? -1.2 : -2.4]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.05, 1.4, 8]} />
            <meshStandardMaterial color={scene.palette.trim} metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.48, 0]}>
            <sphereGeometry args={[0.14, simple ? 8 : 16, simple ? 8 : 12]} />
            <meshStandardMaterial color={scene.palette.accent} emissive={scene.palette.accent} emissiveIntensity={scene.time_of_day === "day" ? 0.35 : 1.1} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.72, 0.2]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color={scene.palette.accent} emissive={scene.palette.accent} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function Easel({ accent, trim }: { accent: string; trim: string }) {
  return (
    <group position={[-3.4, 0, 1.6]} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.7, 0]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.04]} />
        <meshStandardMaterial color="#f7f3ec" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.7, 0.03]} rotation={[0.15, 0, 0]}>
        <planeGeometry args={[0.5, 0.4]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      <mesh position={[-0.28, 0.4, 0]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.04, 1.1, 0.04]} />
        <meshStandardMaterial color={trim} />
      </mesh>
      <mesh position={[0.28, 0.4, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.04, 1.1, 0.04]} />
        <meshStandardMaterial color={trim} />
      </mesh>
    </group>
  );
}

function Holo({ accent }: { accent: string }) {
  const panel = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!panel.current) return;
    panel.current.position.y = 1.35 + Math.sin(state.clock.elapsedTime * 1.4) * 0.04;
  });
  return (
    <mesh ref={panel} position={[2.4, 1.55, -2.35]} rotation={[0, 0.4, 0]}>
      <planeGeometry args={[0.9, 0.55]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} transparent opacity={0.45} side={THREE.DoubleSide} />
    </mesh>
  );
}

function StringLights({ accent }: { accent: string }) {
  const bulbs = [-4, -2.4, -0.8, 0.8, 2.4, 4];
  return (
    <group>
      {bulbs.map((x, index) => (
        <mesh key={x} position={[x, 2.15 + Math.sin(index) * 0.08, -0.4]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.3} />
        </mesh>
      ))}
    </group>
  );
}

function Motes({ night, accent }: { night: boolean; accent: string }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const array = new Float32Array(48 * 3);
    for (let i = 0; i < 48; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 9;
      array[i * 3 + 1] = Math.random() * 2.6;
      array[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    return array;
  }, []);
  useFrame((_, delta) => {
    if (!points.current) return;
    const attribute = points.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attribute.count; i += 1) {
      let y = attribute.getY(i) + delta * 0.08;
      if (y > 2.8) y = 0.2;
      attribute.setY(i, y);
    }
    attribute.needsUpdate = true;
  });
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={night ? accent : "#fff8ee"} size={0.035} transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

function Poster({ scene }: { scene: SceneConfig }) {
  const image = scene.poster_image;
  const url = !image ? null : image.startsWith("<svg") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}` : image;
  return (
    <group position={[3.15, 1.65, -3.9]}>
      <mesh>
        <planeGeometry args={[1.25, 1.6]} />
        <meshStandardMaterial color={scene.palette.trim} />
      </mesh>
      {url ? (
        <Suspense fallback={null}>
          <PosterImage url={url} />
        </Suspense>
      ) : (
        <mesh position={[0, 0.05, 0.02]}>
          <planeGeometry args={[1.05, 1.15]} />
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
    <mesh position={[0, 0.05, 0.02]}>
      <planeGeometry args={[1.05, 1.15]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

void paintScreen;
