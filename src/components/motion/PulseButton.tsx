// src/components/motion/PulseButton.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface PulseButtonProps {
  children: ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
}

export const PulseButton = ({
  children,
  onClick,
  isActive = false,
  className = "",
}: PulseButtonProps) => {
  return (
    <motion.button
      onClick={onClick}
      className={className}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={
        isActive
          ? {
              scale: [1, 1.1, 1],
              transition: {
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }
          : {}
      }
    >
      {children}
      {isActive && (
        <motion.span
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: [
              "0 0 0 0px rgba(186, 52, 183, 0.3)",
              "0 0 0 4px rgba(186, 52, 183, 0)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </motion.button>
  );
};
