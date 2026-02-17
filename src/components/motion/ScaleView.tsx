// src/components/motion/ScaleView.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface ScaleViewProps {
  children: ReactNode;
  isVisible: boolean;
  scale?: number;
  duration?: number;
}

export const ScaleView = ({
  children,
  isVisible,
  scale = 0.95,
  duration = 0.2,
}: ScaleViewProps) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{
            opacity: 0,
            scale: scale,
          }}
          animate={{
            opacity: 1,
            scale: 1,
          }}
          exit={{
            opacity: 0,
            scale: scale,
          }}
          transition={{ duration }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
