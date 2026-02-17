// components/motion/GridLayout.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface GridLayoutProps {
  children: ReactNode;
  isSidebarOpen: boolean;
  className?: string;
}

export const GridLayout = ({
  children,
  isSidebarOpen,
  className = "",
}: GridLayoutProps) => {
  return (
    <motion.div
      animate={{
        gridTemplateColumns: isSidebarOpen ? "1fr 400px" : "1fr 0fr",
      }}
      transition={{
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={className}
      style={{
        display: "grid",
      }}
    >
      {children}
    </motion.div>
  );
};
