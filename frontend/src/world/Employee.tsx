import { useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TeamMemberSpec } from "@/lib/types";
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
  onSelect: () => void;
  onOpenBubble: (bubble: SpeechBubble) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const goal = useRef(new THREE.Vector3(home.x, 0, home.z));
  const cloth = useMemo(() => new THREE.Color(`hsl(${member.avatar_hue} 38% 52%)`), [member.avatar_hue]);
  const skin = useMemo(() => new THREE.Color(`hsl(${(member.avatar_hue + 24) % 360} 32% 74%)`), [member.avatar_hue]);
  const tall = member.silhouette === "tall" ? 1.12 : member.silhouette === "broad" ? 0.94 : 1;
  const wide = member.silhouette === "broad" ? 1.16 : member.silhouette === "tall" ? 0.88 : 1;

  useFrame((state, delta) => {
    const spot = pose === "talking" ? gather : home;
    goal.current.set(spot.x, 0, spot.z);
    const root = group.current;
    if (!root) return;
    root.position.lerp(goal.current, 1 - Math.pow(0.012, delta));
    const bob = pose === "thinking" ? 0.045 : pose === "talking" ? 0.02 : 0.012;
    root.position.y = Math.sin(state.clock.elapsedTime * (pose === "working" ? 6 : 2) + member.avatar_hue) * bob;
    const face = Math.atan2(spot.x - root.position.x, spot.z - root.position.z);
    if (pose === "talking") {
      root.rotation.y = THREE.MathUtils.damp(root.rotation.y, gather.rot, 4, delta);
    } else {
      root.rotation.y = THREE.MathUtils.damp(root.rotation.y, home.rot + face * 0.05, 4, delta);
    }
    const raised = pose === "waiting" ? -2.35 : pose === "working" ? -0.85 : pose === "talking" ? -1.15 : -0.25;
    if (arm.current) arm.current.rotation.x = THREE.MathUtils.damp(arm.current.rotation.x, raised, 6, delta);
  });

  const body = tall * 0.46;
  return (
    <group
      ref={group}
      position={[home.x, 0, home.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <group scale={[wide, tall, wide]}>
        <mesh position={[0, 0.62, 0]} castShadow={!simple}>
          <capsuleGeometry args={[0.22, body, simple ? 3 : 6, simple ? 8 : 12]} />
          {simple ? <meshLambertMaterial color={cloth} /> : <meshStandardMaterial color={cloth} roughness={0.72} />}
        </mesh>
        <mesh position={[0, 1.18, 0]} castShadow={!simple}>
          <sphereGeometry args={[0.2, simple ? 10 : 18, simple ? 8 : 14]} />
          {simple ? <meshLambertMaterial color={skin} /> : <meshStandardMaterial color={skin} roughness={0.58} />}
        </mesh>
        {simple ? null : (
          <group>
            <mesh position={[-0.07, 1.22, 0.16]}>
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshStandardMaterial color="#241c18" />
            </mesh>
            <mesh position={[0.07, 1.22, 0.16]}>
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshStandardMaterial color="#241c18" />
            </mesh>
          </group>
        )}
        <group ref={arm} position={[-0.28, 0.92, 0]} rotation={[0, 0, 0.35]}>
          <mesh position={[0, -0.18, 0]} castShadow={!simple}>
            <capsuleGeometry args={[0.055, 0.22, 3, 8]} />
            {simple ? <meshLambertMaterial color={cloth} /> : <meshStandardMaterial color={cloth} roughness={0.72} />}
          </mesh>
        </group>
        <group position={[0.28, 0.92, 0]} rotation={[-0.35, 0, -0.35]}>
          <mesh position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.055, 0.22, 3, 8]} />
            {simple ? <meshLambertMaterial color={cloth} /> : <meshStandardMaterial color={cloth} roughness={0.72} />}
          </mesh>
        </group>
      </group>
      {pose === "done" ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.36, 20]} />
          <meshBasicMaterial color="#7dcea0" />
        </mesh>
      ) : null}
      {bubbles.length ? (
        <Html position={[0.12, 1.78, 0]} center zIndexRange={[40, 0]} distanceFactor={7}>
          <div className="flex flex-col items-start gap-1.5">
            {bubbles.map((bubble) => (
              <button
                key={bubble.id}
                type="button"
                data-speech={bubble.kind}
                className="pointer-events-auto max-w-[180px] rounded-2xl rounded-bl-md border border-white/20 bg-[#1c140e]/92 px-2.5 py-1.5 text-left text-[11px] leading-snug text-[#f6efe4] shadow-lg"
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
          <div className="pointer-events-none whitespace-nowrap rounded-full bg-[#1c140e]/80 px-2.5 py-1 text-center text-[11px] text-[#f6efe4] shadow">
            <div className="font-medium">{member.name}</div>
            <div className="text-[10px] text-[#e7d3bc]">{POSE_LABEL[pose]}</div>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
