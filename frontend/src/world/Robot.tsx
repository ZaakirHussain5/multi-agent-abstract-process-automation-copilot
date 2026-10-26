import { useLayoutEffect, useMemo, useRef } from "react";
import { useFBX } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { TeamMemberSpec } from "@/lib/types";
import type { EmployeePose } from "@/world/state";

const MODEL = "/models/quaternius-robot.fbx";

export type RobotKit = "lens" | "tool" | "visor" | "headset" | "antenna";

/** Accessories follow the persona, the role words, and the tools they were given. */
export function roleKit(member: TeamMemberSpec): RobotKit {
  const blob = `${member.role} ${member.persona} ${member.allowed_tools.join(" ")} ${member.model_hint}`.toLowerCase();
  if (member.model_hint === "code" || /\b(code|engineer|api|build)\b/.test(blob)) return "tool";
  if (member.model_hint === "image" || /\b(brand|campaign|studio|visual|design)\b/.test(blob)) return "visor";
  if (/\b(research|lab|investigat|lens|evidence)\b/.test(blob)) return "lens";
  if (!member.reports_to) return "headset";
  return "antenna";
}

function clipFor(pose: EmployeePose, moving: boolean): string {
  if (moving) return "Robot_Walking";
  if (pose === "waiting") return "Robot_Wave";
  if (pose === "working") return "Robot_Sitting";
  if (pose === "talking") return "Robot_Yes";
  if (pose === "done") return "Robot_Dance";
  return "Robot_Idle";
}

function paintFace(canvas: HTMLCanvasElement, pose: EmployeePose, time: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const blink = Math.sin(time * 0.65) > 0.97;
  const glow = ctx.createLinearGradient(0, 0, 0, 64);
  glow.addColorStop(0, "#163044");
  glow.addColorStop(1, "#071018");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 64);
  const look = Math.sin(time * 0.45) * 8;
  const eyeY = 28;
  const open = blink ? 3 : pose === "working" ? 10 : 16;
  ctx.fillStyle = pose === "waiting" ? "#ffd27a" : pose === "done" ? "#b6ffb0" : "#d7fbff";
  const eyes = [38 + look, 90 + look];
  for (const x of eyes) {
    ctx.beginPath();
    ctx.ellipse(x, eyeY, 9, open, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pose === "thinking") {
    ctx.fillStyle = "#d5f4ff";
    for (let i = 0; i < 3; i += 1) {
      const pulse = (Math.sin(time * 4 - i) + 1) / 2;
      ctx.globalAlpha = 0.35 + pulse * 0.65;
      ctx.beginPath();
      ctx.arc(48 + i * 16, 50, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.strokeStyle = "#d8f6ff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (pose === "talking") {
    const h = 4 + Math.abs(Math.sin(time * 8)) * 8;
    ctx.ellipse(64, 48, 8, h, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#d8f6ff";
    ctx.fill();
  } else if (pose === "done") {
    ctx.arc(64, 42, 12, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (pose === "waiting") {
    ctx.moveTo(48, 50);
    ctx.quadraticCurveTo(64, 44, 80, 50);
    ctx.stroke();
  } else {
    ctx.moveTo(52, 48);
    ctx.quadraticCurveTo(64, 56, 76, 48);
    ctx.stroke();
  }
}

export function Robot({
  member,
  pose,
  moving,
  simple,
}: {
  member: TeamMemberSpec;
  pose: EmployeePose;
  moving: boolean;
  simple: boolean;
}) {
  const source = useFBX(MODEL);
  const face = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas, texture };
  }, []);
  const kit = roleKit(member);
  const accent = useMemo(() => new THREE.Color(`hsl(${member.avatar_hue} 72% 58%)`), [member.avatar_hue]);
  const model = useMemo(() => {
    const cloned = cloneSkinned(source);
    const hue = new THREE.Color(`hsl(${member.avatar_hue} 48% 46%)`);
    cloned.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !simple;
      mesh.receiveShadow = !simple;
      mesh.frustumCulled = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map((material) => {
        const copy = material.clone() as THREE.MeshPhongMaterial;
        if (copy.name === "Main") copy.color.copy(hue);
        if (copy.name === "Black") {
          copy.color = new THREE.Color("#d8fbff");
          copy.emissive = new THREE.Color("#9be7ff");
          copy.emissiveIntensity = 1.6;
        }
        if (copy.name === "Grey") {
          copy.color = new THREE.Color("#8d8c84");
          copy.specular = new THREE.Color("#444");
        }
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    return cloned;
  }, [source, member.avatar_hue, member.id, kit, accent, face.texture, simple]);

  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of source.animations) {
      const name = clip.name.split("|").pop() || clip.name;
      const action = mixer.clipAction(clip, model);
      action.loop = THREE.LoopRepeat;
      map.set(name, action);
    }
    return map;
  }, [mixer, model, source.animations]);
  const playing = useRef("");
  const spin = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.Group>(null);
  const gear = useRef<THREE.Group>(null);
  const handGear = useRef<THREE.Group>(null);
  const world = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    const idle = actions.get("Robot_Idle");
    idle?.play();
    playing.current = "Robot_Idle";
  }, [actions]);

  useFrame((state, delta) => {
    mixer.update(delta);
    paintFace(face.canvas, pose, state.clock.elapsedTime);
    face.texture.needsUpdate = true;
    const nextName = clipFor(pose, moving);
    if (nextName !== playing.current) {
      const next = actions.get(nextName) ?? actions.get("Robot_Idle");
      const prev = actions.get(playing.current);
      if (next) {
        next.reset().fadeIn(0.28).play();
        next.timeScale = pose === "thinking" ? 0.55 : 1;
        prev?.fadeOut(0.28);
        playing.current = nextName;
      }
    } else {
      const current = actions.get(playing.current);
      if (current) current.timeScale = pose === "thinking" && !moving ? 0.55 : 1;
    }
    if (spin.current) spin.current.rotation.z += delta * 2.4;
    if (sparks.current) sparks.current.rotation.y += delta * 1.6;
    const head = model.getObjectByName("Head");
    const palm = model.getObjectByName("Palm1R");
    if (head && gear.current?.parent) {
      head.getWorldPosition(world);
      gear.current.parent.worldToLocal(world);
      gear.current.position.copy(world);
    }
    if (palm && handGear.current?.parent) {
      palm.getWorldPosition(world);
      handGear.current.parent.worldToLocal(world);
      handGear.current.position.copy(world);
    }
  });

  const tall = member.silhouette === "tall" ? 1.38 : member.silhouette === "broad" ? 1.05 : 0.78;
  const wide = member.silhouette === "broad" ? 1.28 : member.silhouette === "tall" ? 0.86 : 1.05;
  const unit = tall / 464;

  return (
    <group>
      <primitive object={model} scale={[unit * wide, unit, unit]} />
      <group ref={gear}>
        <mesh position={[0, 0.02, 0.16]}>
          <planeGeometry args={[0.2, 0.11]} />
          <meshBasicMaterial map={face.texture} toneMapped={false} />
        </mesh>
        <mesh position={[-0.045, 0.03, 0.18]}>
          <sphereGeometry args={[0.028, 12, 10]} />
          <meshBasicMaterial color="#e7fbff" toneMapped={false} />
        </mesh>
        <mesh position={[0.045, 0.03, 0.18]}>
          <sphereGeometry args={[0.028, 12, 10]} />
          <meshBasicMaterial color="#e7fbff" toneMapped={false} />
        </mesh>
        {kit === "lens" ? (
          <mesh position={[0.1, 0.02, 0.2]}>
            <torusGeometry args={[0.055, 0.012, 8, 18]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        ) : null}
        {kit === "visor" ? (
          <mesh position={[0, 0.03, 0.19]}>
            <boxGeometry args={[0.22, 0.045, 0.02]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} toneMapped={false} />
          </mesh>
        ) : null}
        {kit === "antenna" || kit === "headset" ? (
          <group position={[kit === "headset" ? 0 : 0.06, 0.22, 0]}>
            <mesh>
              <cylinderGeometry args={[0.012, 0.012, 0.28, 6]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} />
            </mesh>
            <mesh position={[0, 0.16, 0]}>
              <sphereGeometry args={[0.04, 10, 8]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          </group>
        ) : null}
      </group>
      {kit === "tool" ? (
        <group ref={handGear}>
          <mesh rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.04, 0.22, 0.04]} />
            <meshStandardMaterial color="#d5dde6" metalness={0.6} roughness={0.3} emissive={accent} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0.12, 0]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.12, 0.035, 0.035]} />
            <meshStandardMaterial color="#d5dde6" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ) : null}
      {pose === "thinking" ? (
        <group ref={spin} position={[0, tall + 0.18, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16, 0.02, 8, 24]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={simple ? 0.4 : 1.5} toneMapped={false} />
          </mesh>
        </group>
      ) : null}
      {pose === "done" ? (
        <group ref={sparks} position={[0, tall * 0.72, 0]}>
          {[0, 1, 2, 3, 4].map((index) => (
            <mesh key={index} position={[Math.cos(index) * 0.34, 0.2 + (index % 2) * 0.16, Math.sin(index) * 0.34]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshBasicMaterial color={index % 2 ? "#ffe08a" : "#b6ffb0"} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ) : null}
    </group>
  );
}

useFBX.preload(MODEL);
