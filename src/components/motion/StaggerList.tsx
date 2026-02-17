// src/components/motion/StaggerList.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export const StaggerList = ({
  children,
  className = "",
  staggerDelay = 0.05,
}: StaggerListProps) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {Array.isArray(children) ? (
        children.map((child, index) => (
          <motion.div key={index} variants={itemVariants}>
            {child}
          </motion.div>
        ))
      ) : (
        <motion.div variants={itemVariants}>{children}</motion.div>
      )}
    </motion.div>
  );
};
