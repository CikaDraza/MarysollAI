// src/components/chat/UsageStats.tsx
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  isOpen: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelVersion?: string;
    completionTokensDetails?: {
      reasoningTokens: number;
    };
  } | null;
}

export function UsageStatsSeek({ isOpen, usage }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute bottom-24 right-0 mb-4 w-64 bg-gray-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-white/10 z-50"
        >
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            System Usage
          </h3>

          <div className="space-y-4">
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <span className="text-[#BA34B7] font-bold">Model:</span>{" "}
                DeepSeek{" "}
                {usage?.modelVersion?.replace("deepseek-", "") || "Chat"}
                <br />
                <span className="text-[#BA34B7] font-bold">
                  Input Tokens:
                </span>{" "}
                {usage?.inputTokens.toLocaleString()} used
                <br />
                <span className="text-[#BA34B7] font-bold">
                  Output Tokens:
                </span>{" "}
                {usage?.outputTokens.toLocaleString()} used
                <br />
                <span className="text-[#BA34B7] font-bold">
                  Total Tokens:
                </span>{" "}
                {usage?.totalTokens.toLocaleString()} used
                {usage?.completionTokensDetails?.reasoningTokens && (
                  <>
                    <br />
                    <span className="text-[#BA34B7] font-bold">
                      Reasoning:
                    </span>{" "}
                    {usage.completionTokensDetails.reasoningTokens.toLocaleString()}
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
