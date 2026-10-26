import { Suspense, useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneConfig, Session, TeamMemberSpec } from "@/lib/types";
import { Employee } from "@/world/Employee";
import { Room } from "@/world/Room";
import { deskSlots, employeePose, gatherSlot, pendingApproval, type Slot } from "@/world/state";

function CameraRig({
  focus,
  scene,
}: {
  focus: Slot | null;
  scene: SceneConfig;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { target: THREE.Vector3 } | null;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const desired = useRef(new THREE.Vector3(0, 0.9, 0));

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.fov = scene.camera.fov;
    perspective.updateProjectionMatrix();
    perspective.position.set(scene.camera.radius * 0.2, scene.camera.height + 1.7, scene.camera.radius);
  }, [camera, scene.camera.fov, scene.camera.height, scene.camera.radius, scene.preset]);

  useFrame(() => {
    if (!controls) return;
    const spot = focusRef.current;
    desired.current.set(spot ? spot.x : 0, spot ? 1.05 : 0.7, spot ? spot.z : 0);
    controls.target.lerp(desired.current, 0.08);
  });
  return null;
}

export function Stage({
  scene,
  session,
  selectedId,
  simple,
  onSelect,
  onApprove,
  ready,
  onReady,
}: {
  scene: SceneConfig;
  session: Session | null;
  selectedId: string | null;
  simple: boolean;
  onSelect: (id: string | null) => void;
  onApprove: (approvalId: string) => void;
  ready: boolean;
  onReady: () => void;
}) {
  const members = session?.team?.members ?? [];
  const homes = deskSlots(Math.max(members.length, 1), scene.layout);
  const focus = members.find((member) => member.id === selectedId);
  const focusSlot = focus ? homes[members.indexOf(focus)] ?? null : null;

  return (
    <>
      <Canvas
        dpr={simple ? 1 : [1, 1.5]}
        shadows={!simple}
        camera={{ fov: scene.camera.fov, position: [1.4, 3.4, 8.5], near: 0.1, far: 48 }}
        gl={{ antialias: !simple, powerPreference: simple ? "low-power" : "high-performance" }}
        onCreated={() => onReady()}
        onPointerMissed={() => onSelect(null)}
      >
        <Suspense fallback={null}>
          <Room scene={scene} simple={simple} />
          {members.map((member, index) => (
            <EmployeeFigure
              key={member.id}
              member={member}
              session={session}
              home={homes[index] ?? homes[0]}
              gather={gatherSlot(index, members.length)}
              selected={member.id === selectedId}
              simple={simple}
              onSelect={() => onSelect(member.id)}
              onApprove={onApprove}
            />
          ))}
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={4.2}
            maxDistance={16}
            maxPolarAngle={Math.PI / 2.05}
            minPolarAngle={0.35}
          />
          <CameraRig focus={focusSlot} scene={scene} />
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
  onSelect,
  onApprove,
}: {
  member: TeamMemberSpec;
  session: Session | null;
  home: Slot;
  gather: Slot;
  selected: boolean;
  simple: boolean;
  onSelect: () => void;
  onApprove: (approvalId: string) => void;
}) {
  const pose = employeePose(member, session);
  const approval = pendingApproval(member, session);
  return (
    <Employee
      member={member}
      pose={pose}
      home={home}
      gather={gather}
      selected={selected}
      simple={simple}
      approvalLabel={approval ? approval.tool.replaceAll("_", " ") : null}
      onSelect={onSelect}
      onApprove={() => {
        if (approval) onApprove(approval.id);
      }}
    />
  );
}
