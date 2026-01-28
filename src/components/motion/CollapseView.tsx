// src/components/conversational/motion/CollapseView.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

export const CollapseView = ({
  children,
  isExpanded,
}: {
  children: ReactNode;
  isExpanded: boolean;
}) => {
  return (
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
