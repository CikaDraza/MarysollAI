// src/components/motion/SlideFade.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface SlideFadeProps {
  children: ReactNode;
  isVisible: boolean;
  direction?: "up" | "down" | "left" | "right";
  distance?: number;
  duration?: number;
}

export const SlideFade = ({
  children,
  isVisible,
  direction = "up",
  distance = 20,
  duration = 0.3,
}: SlideFadeProps) => {
  const getDirectionOffset = () => {
    switch (direction) {
      case "up":
        return { y: distance };
      case "down":
        return { y: -distance };
      case "left":
        return { x: distance };
      case "right":
        return { x: -distance };
      default:
        return { y: distance };
    }
  };

  const offset = getDirectionOffset();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{
            opacity: 0,
            ...offset,
          }}
          animate={{
            opacity: 1,
            x: 0,
            y: 0,
          }}
          exit={{
            opacity: 0,
            ...offset,
          }}
          transition={{
            duration,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
