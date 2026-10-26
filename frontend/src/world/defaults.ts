import type { SceneConfig, ScenePreset, TimeOfDay } from "@/lib/types";

/** Matches the server loft so the room can paint before the first response. */
export const LOFT: SceneConfig = {
  preset: "loft",
  time_of_day: "day",
  layout: "desks",
  props: { plants: true, screens: true, posters: true, lamps: true, rug: true },
  lighting: { ambient: 0.7, key: 1.15, accent: "#e07a3d" },
  camera: { fov: 38, height: 1.6, radius: 8.5 },
  palette: { floor: "#c4b39a", wall: "#efe6d6", trim: "#2c2824", fog: "#d9d0c3", accent: "#e07a3d" },
  poster_title: "Muster",
  poster_image: "",
  quality: "full",
  source_prompt: "",
  customized: false,
};

export const PRESET_LABEL: Record<SceneConfig["preset"], string> = {
  loft: "Loft",
  lab: "Lab",
  war_room: "War room",
  studio: "Studio",
  rooftop: "Rooftop",
  library: "Library",
};

const LOOK: Record<
  ScenePreset,
  Pick<SceneConfig, "palette" | "camera" | "layout" | "props" | "time_of_day">
> = {
  loft: {
    time_of_day: "day",
    layout: "desks",
    props: { plants: true, screens: true, posters: true, lamps: true, rug: true },
    camera: { fov: 38, height: 1.6, radius: 8.5 },
    palette: { floor: "#c4b39a", wall: "#efe6d6", trim: "#2c2824", fog: "#d9d0c3", accent: "#e07a3d" },
  },
  lab: {
    time_of_day: "day",
    layout: "desks",
    props: { plants: false, screens: true, posters: true, lamps: true, rug: false },
    camera: { fov: 36, height: 1.65, radius: 8 },
    palette: { floor: "#d5dde4", wall: "#f4f7f8", trim: "#243044", fog: "#e4ebf0", accent: "#3d8bfd" },
  },
  war_room: {
    time_of_day: "night",
    layout: "meeting",
    props: { plants: false, screens: true, posters: true, lamps: true, rug: true },
    camera: { fov: 34, height: 1.75, radius: 7.4 },
    palette: { floor: "#1a1c22", wall: "#12141a", trim: "#3a342c", fog: "#0c0e14", accent: "#e8a04a" },
  },
  studio: {
    time_of_day: "day",
    layout: "open",
    props: { plants: true, screens: true, posters: true, lamps: true, rug: true },
    camera: { fov: 40, height: 1.5, radius: 8.6 },
    palette: { floor: "#d8c7ae", wall: "#f3eee6", trim: "#3a322c", fog: "#e7dccb", accent: "#c4654a" },
  },
  rooftop: {
    time_of_day: "night",
    layout: "open",
    props: { plants: true, screens: false, posters: false, lamps: true, rug: false },
    camera: { fov: 42, height: 2.15, radius: 11 },
    palette: { floor: "#2a3038", wall: "#1b2128", trim: "#c9c3b6", fog: "#12161c", accent: "#f2c14e" },
  },
  library: {
    time_of_day: "dusk",
    layout: "desks",
    props: { plants: true, screens: false, posters: false, lamps: true, rug: true },
    camera: { fov: 36, height: 1.55, radius: 8 },
    palette: { floor: "#8d6a48", wall: "#efe4d2", trim: "#3a2a1e", fog: "#e6d7c3", accent: "#b5522a" },
  },
};

export function lightingFor(preset: ScenePreset, time: TimeOfDay, accent: string): SceneConfig["lighting"] {
  const table: Record<TimeOfDay, [number, number]> = {
    dawn: [0.46, 0.85],
    day: [0.7, 1.15],
    dusk: [0.34, 0.62],
    night: [0.16, 0.42],
  };
  let [ambient, key] = table[time];
  if (preset === "war_room" && time === "night") key = 0.55;
  if (preset === "rooftop" && time === "night") ambient = 0.2;
  return { ambient, key, accent };
}

export function withPreset(scene: SceneConfig, preset: ScenePreset): SceneConfig {
  const look = LOOK[preset];
  return {
    ...scene,
    ...look,
    preset,
    props: { ...look.props },
    camera: { ...look.camera },
    palette: { ...look.palette },
    lighting: lightingFor(preset, look.time_of_day, look.palette.accent),
    customized: true,
  };
}

export function withTime(scene: SceneConfig, time: TimeOfDay): SceneConfig {
  return {
    ...scene,
    time_of_day: time,
    lighting: lightingFor(scene.preset, time, scene.palette.accent),
    customized: true,
  };
}
