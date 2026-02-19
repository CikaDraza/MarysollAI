// src/hooks/useHydrated.ts
"use client";

import { useEffect, useState } from "react";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // odložen setState -> ne izaziva cascading render warning
    const id = requestAnimationFrame(() => setHydrated(true));

    return () => cancelAnimationFrame(id);
  }, []);

  return hydrated;
}
