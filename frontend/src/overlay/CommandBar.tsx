import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

export function CommandBar({
  mode,
  onMode,
  value,
  onChange,
  onSubmit,
  busy,
  canRun,
  running,
  onRun,
  placeholder,
}: {
  mode: "hire" | "room";
  onMode: (mode: "hire" | "room") => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
  placeholder: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className="pointer-events-auto flex w-[min(720px,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-white/15 bg-[#1a140f]/80 p-1.5 shadow-2xl backdrop-blur-md"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex shrink-0 rounded-full bg-white/10 p-0.5 text-[12px] text-[#f6efe4]">
        <button
          type="button"
          className={`rounded-full px-3 py-1.5 ${mode === "hire" ? "bg-[#f6efe4] text-[#1a140f]" : "text-[#f6efe4]/80"}`}
          onClick={() => onMode("hire")}
        >
          Hire
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-1.5 ${mode === "room" ? "bg-[#f6efe4] text-[#1a140f]" : "text-[#f6efe4]/80"}`}
          onClick={() => onMode("room")}
        >
          Room
        </button>
      </div>
      <input
        ref={input}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          if (/^(make it|make this|restyle|turn the|turn it)\b/i.test(next.trim())) {
            onMode("room");
          }
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-1 text-sm text-[#f6efe4] outline-none placeholder:text-[#f6efe4]/45"
        aria-label={mode === "hire" ? "Describe the work" : "Describe the room"}
      />
      {canRun ? (
        <button
          type="button"
          className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] text-[#f6efe4] hover:bg-white/20"
          onClick={onRun}
          disabled={running}
        >
          {running ? "Working" : "Let them work"}
        </button>
      ) : null}
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6efe4] px-3.5 text-[13px] font-medium text-[#1a140f] disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {mode === "hire" ? "Staff" : "Restyle"}
      </button>
    </form>
  );
}
