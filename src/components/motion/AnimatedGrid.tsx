// components/motion/AnimatedGrid.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedGridProps {
  children: [ReactNode, ReactNode]; // [glavni sadrzaj, sidebar]
  isSidebarOpen: boolean;
  className?: string;
}

export const AnimatedGrid = ({
  children,
  isSidebarOpen,
  className = "",
}: AnimatedGridProps) => {
  return (
    <motion.div
      layout
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: isSidebarOpen
          ? "minmax(0, 3fr) 400px" // 3fr : 400px kada je otvoren
          : "minmax(0, 4fr) 0fr", // 4fr : 0fr kada je zatvoren
        transition: "grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {children[0]}
      <motion.div
        layout
        style={{
          overflow: "hidden",
          width: isSidebarOpen ? "400px" : "0px",
          transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {children[1]}
      </motion.div>
    </motion.div>
  );
};
