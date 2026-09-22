/**
 * Armazenamento 100% local (localStorage).
 * Nenhum dado sai do computador. Nenhum banco externo.
 * Se o app for empacotado com Tauri, basta trocar a implementação
 * de `read`/`write` por leitura/escrita em arquivo JSON local.
 */
import { useCallback, useEffect, useState } from "react";

const PREFIX = "vlocal:";

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / modo privado */
  }
}

/** Estado persistido localmente, seguro para SSR (hidrata após montar). */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(readLocal<T>(key, initial));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (hydrated) writeLocal(key, value);
  }, [key, value, hydrated]);

  const reset = useCallback(() => setValue(initial), [initial]);

  return { value, setValue, hydrated, reset } as const;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export const STORAGE_KEYS = {
  pages: "pages",
  competitors: "competitors",
  followerHistory: "follower-history",
  templates: "templates",
  editorPrefs: "editor-prefs",
  appSettings: "app-settings",
} as const;
