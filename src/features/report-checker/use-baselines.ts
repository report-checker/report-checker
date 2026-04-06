"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

function makeBaselineKey(
  fileName: string,
  ruleId: string,
  message: string,
): string {
  return `${fileName}||${ruleId}||${message}`;
}

async function loadFromFile(): Promise<Set<string>> {
  try {
    const raw = await invoke<string>("read_baselines");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set<string>(parsed as string[]);
    }
  } catch {
    // ignore — treat as empty
  }
  return new Set<string>();
}

async function saveToFile(keys: Set<string>): Promise<void> {
  const content = JSON.stringify(Array.from(keys), null, 2);
  await invoke("write_baselines", { content });
}

export type BaselineEntry = {
  fileName: string;
  ruleId: string;
  message: string;
};

export function useBaselines() {
  const [keys, setKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadFromFile().then(setKeys);
  }, []);

  const hasBaseline = useCallback(
    (fileName: string, ruleId: string, message: string): boolean => {
      return keys.has(makeBaselineKey(fileName, ruleId, message));
    },
    [keys],
  );

  const addBaselinesMany = useCallback(
    (entries: BaselineEntry[]): void => {
      setKeys((prev) => {
        const next = new Set(prev);
        for (const { fileName, ruleId, message } of entries) {
          next.add(makeBaselineKey(fileName, ruleId, message));
        }
        void saveToFile(next);
        return next;
      });
    },
    [],
  );

  const removeBaselinesMany = useCallback(
    (entries: BaselineEntry[]): void => {
      setKeys((prev) => {
        const next = new Set(prev);
        for (const { fileName, ruleId, message } of entries) {
          next.delete(makeBaselineKey(fileName, ruleId, message));
        }
        void saveToFile(next);
        return next;
      });
    },
    [],
  );

  return { hasBaseline, addBaselinesMany, removeBaselinesMany };
}
