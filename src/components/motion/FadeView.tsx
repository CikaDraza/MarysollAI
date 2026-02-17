// src/components/motion/FadeView.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface FadeViewProps {
  children: ReactNode;
  isVisible: boolean;
  duration?: number;
}

export const FadeView = ({
  children,
  isVisible,
  duration = 0.2,
}: FadeViewProps) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
