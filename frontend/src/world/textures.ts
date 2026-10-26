import * as THREE from "three";
import type { TimeOfDay } from "@/lib/types";

const skies = new Map<string, THREE.CanvasTexture>();

/** A painted window: sky, sun or moon, and a skyline. One texture per time of day. */
export function skyTexture(time: TimeOfDay): THREE.CanvasTexture {
  const cached = skies.get(time);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    skies.set(time, fallback);
    return fallback;
  }
  const sky: Record<TimeOfDay, [string, string]> = {
    dawn: ["#f6c7a1", "#8eb6d8"],
    day: ["#d7ecff", "#8fb7e8"],
    dusk: ["#f0a07a", "#3c4d78"],
    night: ["#1b2744", "#070b16"],
  };
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, sky[time][1]);
  gradient.addColorStop(1, sky[time][0]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);
  if (time === "night") {
    ctx.fillStyle = "#f4f7ff";
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 97) % 512;
      const y = (i * 53) % 140;
      ctx.globalAlpha = 0.35 + (i % 5) * 0.12;
      ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }
  const orb = time === "night" ? "#f3efe2" : time === "dusk" ? "#ffd2a8" : "#fff6dd";
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(time === "dawn" ? 120 : 380, time === "night" ? 54 : 70, time === "night" ? 14 : 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = time === "night" ? "#121826" : "#2b3442";
  const blocks = [40, 90, 130, 180, 230, 280, 330, 390, 440];
  blocks.forEach((x, index) => {
    const h = 40 + ((index * 37) % 70);
    ctx.fillRect(x, 256 - h, 36 + (index % 3) * 8, h);
    if (time === "night" || time === "dusk") {
      ctx.fillStyle = index % 2 === 0 ? "#f2c56b" : "#9fd0ff";
      for (let wy = 256 - h + 8; wy < 248; wy += 10) {
        for (let wx = x + 6; wx < x + 30; wx += 8) {
          if ((wx + wy + index) % 3 === 0) ctx.fillRect(wx, wy, 3, 4);
        }
      }
      ctx.fillStyle = time === "night" ? "#121826" : "#2b3442";
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  skies.set(time, texture);
  return texture;
}

export function screenTexture(lines: string[], accent: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  paintScreen(texture, lines, accent);
  return texture;
}

export function paintScreen(texture: THREE.CanvasTexture, lines: string[], accent: string) {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#123044";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, canvas.width, 6);
  ctx.font = "600 15px Inter, sans-serif";
  ctx.fillStyle = "#d7e6f5";
  const rows = lines.slice(0, 4);
  rows.forEach((line, index) => {
    const text = line.length > 28 ? `${line.slice(0, 27)}…` : line;
    ctx.fillText(text, 12, 36 + index * 28);
  });
  if (rows.length === 0) {
    ctx.fillStyle = "#8aa0b5";
    ctx.fillText("Standing by", 12, 48);
  }
  texture.needsUpdate = true;
}
