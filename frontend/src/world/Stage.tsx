import { Suspense, useEffect, useMemo, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { SceneConfig, Session, TeamMemberSpec } from "@/lib/types";
import { Employee } from "@/world/Employee";
import { Room, type RoomFeed } from "@/world/Room";
import type { SpeechBubble } from "@/world/speech";
import { speechBubbles } from "@/world/speech";
import { deskSlots, employeePose, gatherSlot, type Slot } from "@/world/state";

const CHARGE: Slot = { x: 3.55, z: 0.15, rot: -1.4 };

function StudioLight() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = texture;
    return () => {
      texture.dispose();
      pmrem.dispose();
      if (scene.environment === texture) scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

function CameraRig({
  focus,
  scene,
  flyToken,
}: {
  focus: Slot | null;
  scene: SceneConfig;
  flyToken: string;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const mode = useRef<"intro" | "focus" | "reset" | "free">("intro");
  const intro = useRef(1);
  const dragging = useRef(false);
  const goal = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const far = useRef(new THREE.Vector3());
  const rest = useRef(new THREE.Vector3());
  const lookFar = useRef(new THREE.Vector3());
  const lookRest = useRef(new THREE.Vector3());

  useEffect(() => {
    intro.current = 1;
    mode.current = "intro";
    camera.fov = scene.camera.fov;
    camera.updateProjectionMatrix();
    const radius = scene.camera.radius;
    const height = scene.camera.height;
    far.current.set(radius * 0.62, height + 6.2, radius * 1.45);
    rest.current.set(radius * 0.18, height + 1.5, radius * 0.92);
    lookFar.current.set(0, 1.5, 0);
    lookRest.current.set(0, 0.72, 0);
    camera.position.copy(far.current);
  }, [camera, flyToken, scene.camera.fov, scene.camera.height, scene.camera.radius, scene.preset]);

  useEffect(() => {
    const controlsNow = controls;
    if (!controlsNow) return;
    const start = () => {
      dragging.current = true;
      mode.current = "free";
    };
    const end = () => {
      dragging.current = false;
    };
    controlsNow.addEventListener("start", start);
    controlsNow.addEventListener("end", end);
    return () => {
      controlsNow.removeEventListener("start", start);
      controlsNow.removeEventListener("end", end);
    };
  }, [controls]);

  useFrame((_, delta) => {
    if (!controls || dragging.current) return;
    const spot = focusRef.current;
    if (intro.current > 0) {
      intro.current = Math.max(0, intro.current - delta * 0.38);
      const eased = intro.current * intro.current;
      camera.position.lerpVectors(rest.current, far.current, eased);
      controls.target.lerpVectors(lookRest.current, lookFar.current, eased);
      if (intro.current === 0) mode.current = spot ? "focus" : "free";
      return;
    }
    if (spot) mode.current = "focus";
    else if (mode.current === "focus") mode.current = "reset";
    if (mode.current === "free") return;
    if (mode.current === "focus" && spot) {
      goal.current.set(spot.x + 1.2, 1.7, spot.z + 2.1);
      look.current.set(spot.x, 0.95, spot.z);
    } else {
      goal.current.copy(rest.current);
      look.current.copy(lookRest.current);
    }
    const blend = 1 - Math.pow(0.045, delta);
    camera.position.lerp(goal.current, blend);
    controls.target.lerp(look.current, blend);
    if (mode.current === "reset" && camera.position.distanceTo(goal.current) < 0.15) mode.current = "free";
  });
  return null;
}

function Grade({ simple, focused }: { simple: boolean; focused: boolean }) {
  if (simple) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom intensity={0.42} luminanceThreshold={0.68} luminanceSmoothing={0.25} mipmapBlur />
      <DepthOfField focusDistance={focused ? 0.012 : 0.02} focalLength={0.018} bokehScale={focused ? 2.4 : 1.15} />
      <Vignette eskil={false} offset={0.2} darkness={0.62} />
    </EffectComposer>
  );
}

export function Stage({
  scene,
  session,
  selectedId,
  simple,
  now,
  flyToken,
  onSelect,
  onOpenBubble,
  ready,
  onReady,
}: {
  scene: SceneConfig;
  session: Session | null;
  selectedId: string | null;
  simple: boolean;
  now: number;
  flyToken: string;
  onSelect: (id: string | null) => void;
  onOpenBubble: (bubble: SpeechBubble) => void;
  ready: boolean;
  onReady: () => void;
}) {
  const members = session?.team?.members ?? [];
  const homes = deskSlots(Math.max(members.length, 1), scene.layout);
  const focus = members.find((member) => member.id === selectedId);
  const focusSlot = focus ? homes[members.indexOf(focus)] ?? null : null;
  const dockId =
    session && (session.status === "review" || session.status === "completed")
      ? members.find((member) => employeePose(member, session) === "idle")?.id ?? null
      : null;
  const feed = useMemo<RoomFeed>(() => {
    const lines = (session?.events ?? []).slice(-4).reverse().map((event) => event.title).filter(Boolean);
    const plans = [
      session?.team?.name,
      ...(session?.deliverables ?? []).slice(0, 3).map((item) => `${item.status} · ${item.title}`),
    ].filter((line): line is string => Boolean(line));
    return {
      lines: lines.length ? lines : ["Standing by"],
      plans: plans.length ? plans : ["The plan lands on this board"],
    };
  }, [session]);

  return (
    <>
      <Canvas
        dpr={simple ? 1 : [1, 1.5]}
        shadows={!simple}
        camera={{ fov: scene.camera.fov, position: [1.4, 3.4, 8.5], near: 0.1, far: 48 }}
        gl={{
          antialias: !simple,
          powerPreference: simple ? "low-power" : "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          onReady();
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <Suspense fallback={null}>
          {simple ? null : <StudioLight />}
          <Room scene={scene} simple={simple} seats={Math.max(members.length, 1)} feed={feed} />
          {members.map((member, index) => (
            <EmployeeFigure
              key={member.id}
              member={member}
              session={session}
              home={homes[index] ?? homes[0]}
              gather={gatherSlot(index, members.length)}
              dock={member.id === dockId ? CHARGE : null}
              selected={member.id === selectedId}
              simple={simple}
              now={now}
              onSelect={() => onSelect(member.id)}
              onOpenBubble={onOpenBubble}
            />
          ))}
          <CameraRig focus={focusSlot} scene={scene} flyToken={flyToken} />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={3.2}
            maxDistance={18}
            maxPolarAngle={Math.PI / 2.08}
            minPolarAngle={0.28}
          />
          <Grade simple={simple} focused={Boolean(focusSlot)} />
        </Suspense>
      </Canvas>
      {ready ? null : (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-28">
          <p className="rounded-full bg-[#1c140e]/80 px-4 py-2 text-sm text-[#f6efe4]">Opening the room</p>
        </div>
      )}
    </>
  );
}

function EmployeeFigure({
  member,
  session,
  home,
  gather,
  selected,
  simple,
  now,
  dock,
  onSelect,
  onOpenBubble,
}: {
  member: TeamMemberSpec;
  session: Session | null;
  home: Slot;
  gather: Slot;
  dock: Slot | null;
  selected: boolean;
  simple: boolean;
  now: number;
  onSelect: () => void;
  onOpenBubble: (bubble: SpeechBubble) => void;
}) {
  const pose = employeePose(member, session);
  const bubbles = speechBubbles(member.id, session, now);
  return (
    <Employee
      member={member}
      pose={pose}
      home={home}
      gather={gather}
      selected={selected}
      simple={simple}
      bubbles={bubbles}
      now={now}
      dock={dock}
      onSelect={onSelect}
      onOpenBubble={onOpenBubble}
    />
  );
}
