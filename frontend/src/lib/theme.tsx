import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";

type ThemeContextValue = {
  choice: ThemeChoice;
  dark: boolean;
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveDark(choice: ThemeChoice) {
  if (choice === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return choice === "dark";
}

function apply(choice: ThemeChoice) {
  const dark = resolveDark(choice);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  return dark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => {
    const stored = localStorage.getItem("muster-theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "dark";
  });
  const [dark, setDark] = useState(() => resolveDark(choice));

  useEffect(() => {
    setDark(apply(choice));
    localStorage.setItem("muster-theme", choice);
  }, [choice]);

  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(apply("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  return (
    <ThemeContext.Provider value={{ choice, dark, setChoice: setChoiceState }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is missing");
  return value;
}
