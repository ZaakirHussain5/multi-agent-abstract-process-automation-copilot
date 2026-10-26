import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-4 w-4", className)} aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1.4" className="fill-foreground" />
      <rect x="9" y="1" width="6" height="6" rx="1.4" className="fill-muted-foreground" />
      <rect x="5" y="9" width="6" height="6" rx="1.4" fill="hsl(var(--signal))" />
    </svg>
  );
}

export function Avatar({
  name,
  hue,
  size = 32,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: size < 28 ? 10 : 12,
        background: `linear-gradient(160deg, hsl(${hue} 42% 48%), hsl(${(hue + 28) % 360} 32% 26%))`,
      }}
      aria-hidden
    >
      {initials || "•"}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const tone =
    status === "running" || status === "designing"
      ? "bg-signal motion-safe:animate-pulse"
      : status === "awaiting_approval" || status === "awaiting_input"
        ? "bg-warning"
        : status === "completed"
          ? "bg-success"
          : status === "error"
            ? "bg-destructive"
            : "bg-muted-foreground/50";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)} />;
}
