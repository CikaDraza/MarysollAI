// src/lib/ai/debug-log.ts
//
// Phase 1.5 — Dev-only structured logging for the orchestration layer.
// Disabled in production. Toggleable per-namespace via window.__AI_DEBUG (browser)
// or process.env.AI_DEBUG (server).
//
// Usage:
//   const log = aiLog("BLOCK_ORCHESTRATOR");
//   log("openBlock", { type: "AuthBlock" });

type Namespace =
  | "AI_ORCHESTRATOR"
  | "BLOCK_ORCHESTRATOR"
  | "AGENT_TRANSITION"
  | "BOOKING_FLOW"
  | "LAYOUT_ENGINE"
  | "SEARCH_ENGINE"
  | "RANKING"
  | "FALLBACK"
  | "SLOT_SCORE";

const isProd = process.env.NODE_ENV === "production";

function isEnabled(ns: Namespace): boolean {
  if (isProd) return false;
  if (typeof window !== "undefined") {
    const flag = (window as unknown as { __AI_DEBUG?: boolean | string[] })
      .__AI_DEBUG;
    if (flag === false) return false;
    if (Array.isArray(flag)) return flag.includes(ns);
    // Default: enabled in dev unless explicitly opted out.
    return flag !== undefined ? Boolean(flag) : true;
  }
  return process.env.AI_DEBUG !== "false";
}

export function aiLog(namespace: Namespace) {
  return function log(event: string, data?: Record<string, unknown>): void {
    if (!isEnabled(namespace)) return;
    if (data) {
      console.log(`[${namespace}] ${event}`, data);
    } else {
      console.log(`[${namespace}] ${event}`);
    }
  };
}
