import { useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TeamMemberSpec } from "@/lib/types";
import { Robot } from "@/world/Robot";
import type { EmployeePose, Slot } from "@/world/state";
import { bubbleOpacity, type SpeechBubble } from "@/world/speech";

const POSE_LABEL: Record<EmployeePose, string> = {
  idle: "At their desk",
  thinking: "Thinking",
  working: "Working",
  talking: "In a handoff",
  waiting: "Needs a yes",
  done: "Done",
};

export function Employee({
  member,
  pose,
  home,
  gather,
  selected,
  simple,
  bubbles,
  now,
  dock,
  onSelect,
  onOpenBubble,
}: {
  member: TeamMemberSpec;
  pose: EmployeePose;
  home: Slot;
  gather: Slot;
  selected: boolean;
  simple: boolean;
  bubbles: SpeechBubble[];
  now: number;
  dock: Slot | null;
  onSelect: () => void;
  onOpenBubble: (bubble: SpeechBubble) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const goal = useRef(new THREE.Vector3(home.x, 0, home.z));
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);

  useFrame((_, delta) => {
    const spot = pose === "talking" ? gather : pose === "idle" && dock ? dock : home;
    goal.current.set(spot.x, 0, spot.z);
    const root = group.current;
    if (!root) return;
    const dx = goal.current.x - root.position.x;
    const dz = goal.current.z - root.position.z;
    const distance = Math.hypot(dx, dz);
    const nextMoving = distance > 0.18;
    if (nextMoving !== movingRef.current) {
      movingRef.current = nextMoving;
      setMoving(nextMoving);
    }
    root.position.lerp(goal.current, 1 - Math.pow(0.08, delta));
    const heading = nextMoving ? Math.atan2(dx, dz) : spot.rot;
    root.rotation.y = THREE.MathUtils.damp(root.rotation.y, heading, 5, delta);
  });

  const bubbleY = member.silhouette === "compact" ? 1.35 : member.silhouette === "tall" ? 1.85 : 1.55;
  return (
    <group
      ref={group}
      position={[home.x, 0, home.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <Robot member={member} pose={pose} moving={moving} simple={simple} />
      {pose === "done" ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.42, 24]} />
          <meshBasicMaterial color="#7dcea0" transparent opacity={0.85} />
        </mesh>
      ) : null}
      {bubbles.length ? (
        <Html position={[0.05, bubbleY, 0]} center zIndexRange={[40, 0]} distanceFactor={7}>
          <div className="flex flex-col items-start gap-1.5 font-sans">
            {bubbles.map((bubble) => (
              <button
                key={bubble.id}
                type="button"
                data-speech={bubble.kind}
                className="pointer-events-auto max-w-[188px] rounded-2xl rounded-bl-md border border-white/40 bg-white/75 px-2.5 py-1.5 text-left font-sans text-[11px] leading-snug text-[#1c140e] shadow-[0_10px_30px_rgba(20,16,12,0.28)] backdrop-blur-md"
                style={{ opacity: bubbleOpacity(bubble, now) }}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenBubble(bubble);
                }}
              >
                {bubble.short}
              </button>
            ))}
          </div>
        </Html>
      ) : null}
      {selected && bubbles.length === 0 ? (
        <Html position={[0, 1.72, 0]} center zIndexRange={[20, 0]} distanceFactor={8}>
          <div className="pointer-events-none whitespace-nowrap rounded-full border border-white/40 bg-white/75 px-2.5 py-1 text-center font-sans text-[11px] text-[#1c140e] shadow-[0_8px_24px_rgba(20,16,12,0.25)] backdrop-blur-md">
            <div className="font-medium tracking-tight">{member.name}</div>
            <div className="text-[10px] text-[#5c5148]">{POSE_LABEL[pose]}</div>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
