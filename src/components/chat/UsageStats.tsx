// src/components/chat/UsageStats.tsx
import { motion, AnimatePresence } from "framer-motion";
import { useHydrated } from "@/hooks/useHydrated";
import type { PublicAiModel } from "@/lib/ai/models/aiModelRegistry";

interface Props {
  isOpen: boolean;
  usage: {
    messagesSent: number;
    estimatedTokens: number;
    // Model Lab — prave metrike (kad postoje); fallback na procenu iznad.
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number | null;
    provider?: string;
    model?: string;
    latencyMs?: number;
  };
  // Model Lab
  models?: PublicAiModel[];
  selectedModelId?: string | null;
  onSelectModel?: (id: string) => void;
  labEnabled?: boolean;
  loading?: boolean;
}

function fmtCost(v: number | null | undefined): string {
  if (v == null) return "n/a";
  return `$${v.toFixed(4)}`;
}

export function UsageStats({
  isOpen,
  usage,
  models = [],
  selectedModelId,
  onSelectModel,
  labEnabled = false,
  loading = false,
}: Props) {
  const isHydrated = useHydrated();
  const LIMITS = { daily: 1500, minute: 15 };

  if (!isHydrated) return null;

  const activeLabel =
    models.find((m) => m.id === selectedModelId)?.label ??
    usage.model ??
    "DeepSeek V3.2";
  const hasRealUsage =
    usage.totalTokens != null ||
    usage.inputTokens != null ||
    usage.outputTokens != null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute bottom-full mb-4 w-64 bg-gray-900/95 backdrop-blur-md text-white p-4 rounded-lg shadow-2xl"
        >
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            System Usage / Model Lab
          </h3>

          <div className="space-y-4">
            {/* Model select (lab) ili read-only labela */}
            <div>
              <div className="flex justify-between items-center text-[10px] mb-1">
                <span className="text-[#BA34B7] font-bold">Model</span>
                {usage.provider && (
                  <span className="text-gray-500">{usage.provider}</span>
                )}
              </div>
              {labEnabled && onSelectModel ? (
                <select
                  value={selectedModelId ?? ""}
                  disabled={loading || models.length === 0}
                  onChange={(e) => onSelectModel(e.target.value)}
                  className="w-full bg-gray-800 text-white text-[11px] rounded-lg border border-white/10 px-2 py-1.5 outline-none focus:border-[#BA34B7] disabled:opacity-50"
                >
                  {models.length === 0 && (
                    <option value="">{loading ? "Učitavam…" : "—"}</option>
                  )}
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-gray-200">{activeLabel}</p>
              )}
            </div>

            {/* Requests / minute */}
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span>Requests (Minute)</span>
                <span>
                  {usage.messagesSent} / {LIMITS.minute}
                </span>
              </div>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#BA34B7] transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (usage.messagesSent / LIMITS.minute) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Metrike */}
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                {hasRealUsage ? (
                  <>
                    <span className="text-[#BA34B7] font-bold">Input:</span>{" "}
                    {(usage.inputTokens ?? 0).toLocaleString()}
                    <br />
                    <span className="text-[#BA34B7] font-bold">
                      Output:
                    </span>{" "}
                    {(usage.outputTokens ?? 0).toLocaleString()}
                    <br />
                    <span className="text-[#BA34B7] font-bold">
                      Total:
                    </span>{" "}
                    {(usage.totalTokens ?? 0).toLocaleString()}
                  </>
                ) : (
                  <>
                    <span className="text-[#BA34B7] font-bold">Tokens:</span> ~
                    {usage.estimatedTokens} used
                  </>
                )}
                {usage.latencyMs != null && (
                  <>
                    <br />
                    <span className="text-[#BA34B7] font-bold">
                      Latency:
                    </span>{" "}
                    {usage.latencyMs} ms
                  </>
                )}
                {usage.estimatedCostUsd !== undefined && (
                  <>
                    <br />
                    <span className="text-[#BA34B7] font-bold">Cost:</span>{" "}
                    {fmtCost(usage.estimatedCostUsd)}
                  </>
                )}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
