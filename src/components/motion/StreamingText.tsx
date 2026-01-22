// src/components/conversational/motion/StreamingText.tsx
"use client";

import { useEffect, useState } from "react";

interface StreamingTextProps {
  text: string | null;
  speed?: number; // ms per character
}

export function StreamingText({ text, speed = 10 }: StreamingTextProps) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!text) return;
    let index = 0;
    if (!text) {
      return;
    }
    const interval = setInterval(() => {
      setDisplayed((prev) => prev + text[index]);
      index += 1;
      if (index >= text.length) {
        clearInterval(interval);
        return;
      }
    }, speed);

    return () => {
      clearInterval(interval);
    };
  }, [text, speed]);

  return <span>{displayed}</span>;
}
