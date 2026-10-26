import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const delta = then - Date.now();
  const abs = Math.abs(delta);
  const min = Math.round(abs / 60000);
  if (min < 1) return delta > 15_000 ? "moments" : "just now";
  if (min < 60) return delta >= 0 ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return delta >= 0 ? `in ${hr}h` : `${hr}h ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "team";
}

export function modelLabel(hint: string): string {
  if (hint === "code") return "Muse Code";
  if (hint === "image") return "Muse Image";
  return "Muse Spark";
}

export function statusLabel(status: string): string {
  switch (status) {
    case "clarifying":
      return "Questions";
    case "designing":
      return "Designing";
    case "review":
      return "Review";
    case "running":
      return "Running";
    case "awaiting_approval":
      return "Needs approval";
    case "awaiting_input":
      return "Question open";
    case "completed":
      return "Done";
    case "error":
      return "Stopped";
    default:
      return status;
  }
}

export async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
