// src/components/chat/UsageStats.tsx
import { motion, AnimatePresence } from "framer-motion";
import { useHydrated } from "@/hooks/useHydrated";

interface Props {
  isOpen: boolean;
  usage: {
    messagesSent: number;
    estimatedTokens: number;
  };
}

export function UsageStats({ isOpen, usage }: Props) {
  const isHydrated = useHydrated();
  // Free Tier limiti
  const LIMITS = {
    daily: 1500,
    minute: 15,
  };

  if (!isHydrated) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute bottom-full mb-4 w-64 bg-gray-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-white/10"
        >
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            System Usage (Free Tier)
          </h3>

          <div className="space-y-4">
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
                    width: `${(usage.messagesSent / LIMITS.minute) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <span className="text-[#BA34B7] font-bold">Model:</span> Gemini
                2.0 Flash
                <br />
                <span className="text-[#BA34B7] font-bold">Tokens:</span> ~
                {usage.estimatedTokens} used
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
