"use client";

import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { LayoutEngine } from "@/components/layout/LayoutEngine";
import { useWorkspace } from "@/context/landing/WorkspaceContext";
import { useAIContext } from "@/context/landing/AIContext";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { getBlockLabel } from "@/lib/ai/block-registry";
import { useEffect, useRef } from "react";

const enterTransition = {
  duration: 0.42,
  ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number],
};

export default function AIWorkspace() {
  const { activeBlock, dismissWorkspace } = useWorkspace();
  const { sendMessage, sendToOrchestrator } = useAIContext();
  const { setDrawerOpen } = useLandingUI();
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll workspace into view whenever a new block appears
  useEffect(() => {
    if (!activeBlock) return;
    const timer = setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300); // wait for enter animation to start
    return () => clearTimeout(timer);
  }, [activeBlock?.id]);

  return (
    <div ref={containerRef} className="scroll-mt-4">
    <AnimatePresence mode="wait">
      {activeBlock && (
        <motion.div
          key={activeBlock.id}
          initial={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          animate={{
            opacity: 1,
            height: "auto",
            marginTop: 56,
            marginBottom: 0,
          }}
          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={enterTransition}
          className="overflow-hidden rounded-xl"
        >
          {/* Inner card */}
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.32, ease: "easeOut", delay: 0.06 }}
            style={{
              background: "var(--surface)",
              borderRadius: 28,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Workspace header bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 20px 12px",
                borderBottom: "1px solid var(--border-1)",
                background:
                  "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "999px",
                  background: "var(--secondary-color)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <SparklesIcon
                  style={{ width: 13, height: 13, color: "#fff" }}
                  strokeWidth={1.5}
                />
              </div>
              <span
                style={{
                  fontFamily: "var(--main-font)",
                  fontWeight: 700,
                  fontSize: 13,
                  color: "var(--fg-1)",
                  flex: 1,
                }}
              >
                {getBlockLabel(activeBlock.type)}
              </span>
              <button
                onClick={dismissWorkspace}
                aria-label="Zatvori workspace"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "999px",
                  border: "none",
                  background: "var(--surface-2)",
                  color: "var(--fg-3)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 150ms, color 150ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--brand-100)";
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--secondary-color)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--surface-2)";
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--fg-3)";
                }}
              >
                <XMarkIcon
                  style={{ width: 15, height: 15 }}
                  strokeWidth={1.5}
                />
              </button>
            </div>

            {/* Block content */}
            <div style={{ padding: "20px 20px 24px" }}>
              <LayoutEngine
                blocks={activeBlock}
                onMessageAction={sendMessage}
                onBlockAction={sendToOrchestrator}
                onAskAssistant={() => setDrawerOpen(true)}
                isLanding
                disableGlobalDedupe
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
