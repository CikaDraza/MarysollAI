// components/motion/SidebarSlide.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface SidebarSlideProps {
  children: ReactNode;
  isOpen: boolean;
  direction?: "left" | "right";
  width?: number;
}

export const SidebarSlide = ({
  children,
  isOpen,
  direction = "right",
  width = 400,
}: SidebarSlideProps) => {
  const xOffset = direction === "right" ? width : -width;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{
            opacity: 0,
            x: xOffset,
            width: 0,
          }}
          animate={{
            opacity: 1,
            x: 0,
            width: "auto",
          }}
          exit={{
            opacity: 0,
            x: xOffset,
            width: 0,
          }}
          transition={{
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1],
          }}
          className="overflow-hidden relative"
          style={{
            minWidth: isOpen ? `${width}px` : 0,
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
