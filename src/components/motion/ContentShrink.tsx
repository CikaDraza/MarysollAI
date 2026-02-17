// components/motion/ContentShrink.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface ContentShrinkProps {
  children: ReactNode;
  isExpanded: boolean;
  className?: string;
}

export const ContentShrink = ({
  children,
  isExpanded,
  className = "",
}: ContentShrinkProps) => {
  return (
    <motion.div
      animate={{
        gridColumn: isExpanded ? "span 3" : "span 4",
      }}
      transition={{
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
