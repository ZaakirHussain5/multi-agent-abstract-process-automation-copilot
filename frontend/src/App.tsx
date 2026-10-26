import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Shell } from "@/components/shell";
import { getHealth, getTools } from "@/lib/api";
import { ThemeProvider, useTheme } from "@/lib/theme";
import type { Health, ToolInfo } from "@/lib/types";
import { Jobs } from "@/views/jobs";
import { StagePage } from "@/views/stage-page";
import { Templates } from "@/views/templates";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </ThemeProvider>
  );
}

function Root() {
  const { dark } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextHealth, nextTools] = await Promise.all([getHealth(), getTools()]);
        if (cancelled) return;
        setHealth(nextHealth);
        setTools(nextTools);
        setApiError(null);
      } catch (error) {
        if (!cancelled) setApiError(error instanceof Error ? error.message : "API unavailable");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Routes>
        <Route index element={<StagePage />} />
        <Route path="s/:id" element={<StagePage />} />
        <Route element={<Shell health={health} tools={tools} apiError={apiError} />}>
          <Route path="jobs" element={<Jobs />} />
          <Route path="templates" element={<Templates />} />
        </Route>
      </Routes>
      <Toaster theme={dark ? "dark" : "light"} position="bottom-right" />
    </>
  );
}
