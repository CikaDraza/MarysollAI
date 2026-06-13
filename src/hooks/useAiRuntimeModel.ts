// src/hooks/useAiRuntimeModel.ts
//
// Model Lab — klijentski izbor modela. Fetch-uje dostupne modele sa servera
// (GET /api/ai/models), čuva izbor u localStorage (marysoll_ai_model_id), i ako
// je sačuvani model nedostupan pada na default. Server svejedno revalidira —
// ovo je samo preferencija.

"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicAiModel } from "@/lib/ai/models/aiModelRegistry";

const STORAGE_KEY = "marysoll_ai_model_id";

/** Model Lab je vidljiv samo kad je flag uključen; inače read-only labela. */
function isModelLabEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(
    process.env.NEXT_PUBLIC_AI_MODEL_LAB ?? "",
  );
}

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* localStorage nedostupan — izbor ostaje samo u memoriji ove sesije */
  }
}

export interface UseAiRuntimeModel {
  models: PublicAiModel[];
  selectedModelId: string | null;
  setSelectedModelId: (id: string) => void;
  selectedModel: PublicAiModel | null;
  loading: boolean;
  labEnabled: boolean;
}

export function useAiRuntimeModel(): UseAiRuntimeModel {
  const [models, setModels] = useState<PublicAiModel[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [selectedModelId, setSelected] = useState<string | null>(readStored);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ai/models");
        if (!res.ok) return;
        const data = (await res.json()) as {
          models: PublicAiModel[];
          defaultModelId: string;
        };
        if (cancelled) return;
        setModels(data.models);
        setDefaultModelId(data.defaultModelId);
        // Ako sačuvani izbor nije među dostupnima → fallback na default.
        const stored = readStored();
        const available = data.models.some((m) => m.id === stored);
        const resolved = available ? stored! : data.defaultModelId;
        setSelected(resolved);
        writeStored(resolved);
      } catch {
        /* mreža/parse pad — ostajemo na sačuvanom/null, server default radi */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelectedModelId = useCallback(
    (id: string) => {
      if (!models.some((m) => m.id === id)) return;
      setSelected(id);
      writeStored(id);
    },
    [models],
  );

  const selectedModel =
    models.find((m) => m.id === selectedModelId) ??
    models.find((m) => m.id === defaultModelId) ??
    null;

  return {
    models,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    loading,
    labEnabled: isModelLabEnabled(),
  };
}
