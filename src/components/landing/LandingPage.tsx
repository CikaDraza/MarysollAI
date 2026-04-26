"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { useChatSeek } from "@/hooks/useChatSeek";
import { ThreadItem } from "@/types/ai/chat-thread";

export default function LandingPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Maria Deep — frontline conversational agent (DeepSeek)
  const maria = useChatSeek();
  // Claudia Makelele — specialist for blocks (askAgent → useChatHistory thread)
  // AgentBridge (in LayoutWithSidebar) listens to Maria's CALL_AGENT events and calls askAI
  const claudia = useAIQuery(null);

  // Merge Maria's session messages with Claudia's thread items (messages + blocks)
  // Maria messages → ThreadItems with timestamp from createdAt
  // Claudia thread already in ThreadItem form; blocks inherit timestamp from preceding message
  const unifiedThread = useMemo<ThreadItem[]>(() => {
    const mariaItems: ThreadItem[] = maria.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        id: `maria-${m.id}`,
        type: "message",
        data: {
          id: `maria-${m.id}`,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content.replace(/\[CALL_AGENT:\w+\]/g, "").trim(),
          timestamp: m.createdAt.getTime(),
        },
      }));

    // Claudia: drop user-message echoes (Maria already shows the user's query)
    let lastTs = Date.now();
    const claudiaItems: Array<ThreadItem & { _ts: number }> = [];
    claudia.thread.forEach((item) => {
      if (item.type === "message") {
        if (item.data.role === "user") return; // dedup
        lastTs = item.data.timestamp;
        claudiaItems.push({ ...item, _ts: lastTs });
      } else {
        claudiaItems.push({ ...item, _ts: lastTs + 1 });
      }
    });

    const all: Array<ThreadItem & { _ts: number }> = [
      ...mariaItems.map((i) => ({
        ...i,
        _ts: i.type === "message" ? i.data.timestamp : Date.now(),
      })),
      ...claudiaItems,
    ];
    all.sort((a, b) => a._ts - b._ts);
    return all.map(({ _ts, ...rest }) => rest as ThreadItem);
  }, [maria.messages, claudia.thread]);

  const handleAsk = useCallback(
    (q: string) => {
      void maria.sendMessage(q);
    },
    [maria],
  );

  const handleClear = useCallback(() => {
    maria.clearChat();
    claudia.clearChat();
  }, [maria, claudia]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
        visible={!drawerOpen}
        onBook={scrollToBooking}
        category="Masaža"
        time="14:00"
        city="Novi Sad"
        salonName="Studio Lavanda"
      />

      <AIDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAsk={handleAsk}
        aiThread={unifiedThread}
        streamingText={claudia.streamingText}
        isStreaming={maria.isStreaming || claudia.isStreaming}
        streamingAgent={claudia.isStreaming ? "claudia" : "maria"}
        onClearChat={handleClear}
      />
    </div>
  );
}
