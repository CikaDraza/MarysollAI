"use client";

import { useState, useEffect } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import LandingHeader from "./LandingHeader";
import Hero from "./Hero";
import TrustRow from "./TrustRow";
import QuickAccess from "./QuickAccess";
import AIPrompt from "./AIPrompt";
import BookingWidget from "./BookingWidget";
import StickyOffer from "./StickyOffer";
import AIDrawer from "./AIDrawer";
import { useAIQuery } from "@/hooks/useAIQuery";

const STICKY_KEY = "marysoll_sticky_dismissed";

export default function LandingPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { askAI, thread, streamingText, isStreaming, clearChat } = useAIQuery(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem(STICKY_KEY);
      if (!dismissed) setStickyVisible(true);
    }
  }, []);

  const dismissSticky = () => {
    localStorage.setItem(STICKY_KEY, "1");
    setStickyVisible(false);
  };

  const scrollToBooking = () => {
    document
      .getElementById("booking-widget")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div style={{ fontFamily: "var(--main-font)", minHeight: "100vh", position: "relative" }}>
      {/* Page-level gradient — starts at very top, fades out before QuickAccess */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "110vh",
          pointerEvents: "none",
          zIndex: 0,
          background: [
            "radial-gradient(ellipse 60% 55% at 8% 38%, rgba(255,128,181,0.26) 0%, transparent 60%)",
            "radial-gradient(ellipse 55% 50% at 92% 28%, rgba(93,1,86,0.22) 0%, transparent 58%)",
            "radial-gradient(ellipse 40% 35% at 50% 55%, rgba(186,52,183,0.10) 0%, transparent 65%)",
          ].join(", "),
          maskImage: "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
        }}
      />

      {/* Fixed floating header — avoids mobile browser chrome reflow */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: "12px 24px",
        }}
      >
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <LandingHeader
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            onOpenAI={() => setDrawerOpen(true)}
          />
        </div>
      </div>
      {/* Spacer so content starts below the fixed header (12px top pad + ~48px header + 12px bottom pad) */}
      <div style={{ height: 72 }} aria-hidden="true" />

      {/* Hero — full viewport width, gradient bleeds to edges */}
      <Hero onSearch={scrollToBooking} onOpenAI={() => setDrawerOpen(true)} />

      {/* Remaining sections — contained */}
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 24px 120px",
        }}
      >
        <TrustRow />
        <QuickAccess onPick={scrollToBooking} />
        <AIPrompt onOpenAI={() => setDrawerOpen(true)} />
        <BookingWidget
          onConfirm={() => setConfirmed(true)}
          onOpenAI={() => setDrawerOpen(true)}
        />
      </div>

      {confirmed && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            top: 22,
            transform: "translateX(-50%)",
            background: "#111114",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: 14,
            boxShadow: "var(--shadow-lg)",
            zIndex: 80,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--main-font)",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          <CheckIcon style={{ width: 16, height: 16 }} strokeWidth={2} />
          Termin potvrđen za 14:00
        </div>
      )}

      <StickyOffer
        visible={stickyVisible && !drawerOpen}
        onDismiss={dismissSticky}
        onBook={scrollToBooking}
      />

      <AIDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAsk={askAI}
        aiThread={thread}
        streamingText={streamingText}
        isStreaming={isStreaming}
        onClearChat={clearChat}
      />
    </div>
  );
}
