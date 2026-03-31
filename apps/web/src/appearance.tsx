import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type AppearanceMode = "dark" | "light" | "system";
export type ResolvedAppearanceMode = Exclude<AppearanceMode, "system">;

type AppearanceContextValue = {
  appearanceMode: AppearanceMode;
  resolvedAppearanceMode: ResolvedAppearanceMode;
  setAppearanceMode: (mode: AppearanceMode) => void;
};

export const appearanceStorageKey = "synchrono-city.appearance-mode.v1";

const defaultAppearanceMode: AppearanceMode = "dark";
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function initializeAppearance() {
  const appearanceMode = loadStoredAppearanceMode();
  applyAppearanceMode(appearanceMode, resolveAppearanceMode(appearanceMode));
}

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(() => loadStoredAppearanceMode());
  const [systemAppearanceMode, setSystemAppearanceMode] = useState<ResolvedAppearanceMode>(() => resolveSystemAppearance());

  useEffect(() => {
    const mediaQueryList = resolveColorSchemeMediaQuery();
    if (!mediaQueryList) {
      return;
    }

    const handleChange = (event?: MediaQueryListEvent) => {
      setSystemAppearanceMode((event?.matches ?? mediaQueryList.matches) ? "dark" : "light");
    };

    addMediaQueryListener(mediaQueryList, handleChange);
    return () => {
      removeMediaQueryListener(mediaQueryList, handleChange);
    };
  }, []);

  const resolvedAppearanceMode = appearanceMode === "system" ? systemAppearanceMode : appearanceMode;

  useEffect(() => {
    storeAppearanceMode(appearanceMode);
    applyAppearanceMode(appearanceMode, resolvedAppearanceMode);
  }, [appearanceMode, resolvedAppearanceMode]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearanceMode,
      resolvedAppearanceMode,
      setAppearanceMode: (mode) => {
        if (mode === "dark" || mode === "light" || mode === "system") {
          setAppearanceModeState(mode);
        }
      }
    }),
    [appearanceMode, resolvedAppearanceMode]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }

  return value;
}

export function loadStoredAppearanceMode(): AppearanceMode {
  const storage = resolveStorage();
  if (!storage) {
    return defaultAppearanceMode;
  }

  const storedValue = storage.getItem(appearanceStorageKey);
  if (storedValue === "dark" || storedValue === "light" || storedValue === "system") {
    return storedValue;
  }

  return defaultAppearanceMode;
}

function storeAppearanceMode(mode: AppearanceMode) {
  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  storage.setItem(appearanceStorageKey, mode);
}

function applyAppearanceMode(appearanceMode: AppearanceMode, resolvedAppearanceMode: ResolvedAppearanceMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = resolvedAppearanceMode;
  document.documentElement.dataset.themeMode = appearanceMode;
  document.documentElement.style.colorScheme = resolvedAppearanceMode;
}

function resolveAppearanceMode(appearanceMode: AppearanceMode): ResolvedAppearanceMode {
  return appearanceMode === "system" ? resolveSystemAppearance() : appearanceMode;
}

function resolveSystemAppearance(): ResolvedAppearanceMode {
  const mediaQueryList = resolveColorSchemeMediaQuery();
  if (!mediaQueryList) {
    return "dark";
  }

  return mediaQueryList.matches ? "dark" : "light";
}

function resolveColorSchemeMediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia("(prefers-color-scheme: dark)");
}

function addMediaQueryListener(
  mediaQueryList: MediaQueryList,
  listener: (event?: MediaQueryListEvent) => void
) {
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);
    return;
  }

  if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(listener);
  }
}

function removeMediaQueryListener(
  mediaQueryList: MediaQueryList,
  listener: (event?: MediaQueryListEvent) => void
) {
  if (typeof mediaQueryList.removeEventListener === "function") {
    mediaQueryList.removeEventListener("change", listener);
    return;
  }

  if (typeof mediaQueryList.removeListener === "function") {
    mediaQueryList.removeListener(listener);
  }
}

function resolveStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined" || typeof window.localStorage !== "object" || window.localStorage === null) {
    return null;
  }

  const { getItem, setItem } = window.localStorage;
  if (typeof getItem !== "function" || typeof setItem !== "function") {
    return null;
  }

  return window.localStorage;
}
