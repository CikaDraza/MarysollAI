"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@heroicons/react/24/outline";
import LandingHeader from "./LandingHeader";
import Hero from "./Hero";
import TrustRow from "./TrustRow";
import QuickAccess from "./QuickAccess";
import AIPrompt from "./AIPrompt";
import BookingWidget from "./BookingWidget";
import BookingModal from "./BookingModal";
import NotifyMeWidget from "./NotifyMeWidget";
import StickyOffer from "./StickyOffer";
import AIDrawer from "./AIDrawer";
import { useAIQuery } from "@/hooks/useAIQuery";
import { useChatSeek } from "@/hooks/useChatSeek";
import { ThreadItem } from "@/types/ai/chat-thread";
import { useSalons } from "@/hooks/useSalons";
import { useSlotWindow } from "@/hooks/useSlotWindow";
import { useCitySelector } from "@/hooks/useCitySelector";
import { SERBIAN_CITIES } from "@/lib/cities";

const todayStr = () => new Date().toISOString().slice(0, 10);

interface Props {
  initialCity?: string;
  initialCategory?: string;
}

export default function LandingPage({ initialCity = "", initialCategory = "" }: Props) {
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [modalSlot, setModalSlot] = useState<import("@/types/slots").FlatSlot | null>(null);

  // City selection — geo + localStorage, falls back to Novi Sad
  const { city: selectedCity, setCity } = useCitySelector(initialCity || undefined);
  const cityName = selectedCity.name;

  const [category, setCategory] = useState(initialCategory);
  const [_date, setDate] = useState(todayStr());

  // Salons — for QuickAccess category grid (city-filtered)
  const { data: salons = [], isLoading: salonsLoading } = useSalons(cityName.toLowerCase());

  // Slot window — fetches all salons, groups by 2 nearest cities
  const { slotsByCity, bestSlot, isLoading: slotsLoading } = useSlotWindow({
    selectedCity: cityName,
    category: category || undefined,
  });

  // Maria Deep — frontline conversational agent (DeepSeek)
  const maria = useChatSeek();
  // Claudia Makelele — specialist for blocks (askAgent → useChatHistory thread)
  const claudia = useAIQuery(null);

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

    let lastTs = Date.now();
    const claudiaItems: Array<ThreadItem & { _ts: number }> = [];
    claudia.thread.forEach((item) => {
      if (item.type === "message") {
        if (item.data.role === "user") return;
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

  const handleLoginRequest = useCallback(() => {
    setModalSlot(null);
    setDrawerOpen(true);
    void maria.sendMessage("Prijavi se");
  }, [maria]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const scrollToBooking = () => {
    document
      .getElementById("booking-widget")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Category chip click — slug-based routing, no encoding needed
  const handleCategoryPick = useCallback(
    (slug: string) => {
      const next = category === slug ? "" : slug;
      setCategory(next);
      if (cityName && next) {
        router.push(
          `/${encodeURIComponent(cityName.toLowerCase())}/${next}`,
          { scroll: false },
        );
      }
    },
    [category, cityName, router],
  );

  return (
    <div style={{ fontFamily: "var(--main-font)", minHeight: "100vh", position: "relative" }}>
      {/* Page gradient */}
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

      {/* Fixed floating header */}
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
            onLogin={handleLoginRequest}
            city={cityName}
            onCityChange={(name) => {
              const found = SERBIAN_CITIES.find((c) => c.name === name);
              if (found) setCity(found);
            }}
          />
        </div>
      </div>
      <div style={{ height: 72 }} aria-hidden="true" />

      <Hero
        onSearch={({ city: c, category: cat, date: d }) => {
          const found = SERBIAN_CITIES.find(
            (x) => x.name.toLowerCase() === c.toLowerCase(),
          );
          if (found) setCity(found);
          setCategory(cat);
          setDate(d);
        }}
        onOpenAI={() => setDrawerOpen(true)}
      />

      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 24px 120px",
        }}
      >
        <TrustRow />
        <QuickAccess
          salons={salons}
          loading={salonsLoading}
          category={category}
          onPick={scrollToBooking}
          onCategoryPick={handleCategoryPick}
        />
        <AIPrompt onOpenAI={() => setDrawerOpen(true)} />
        <BookingWidget
          slotsByCity={slotsByCity}
          loading={slotsLoading}
          onBook={setModalSlot}
        />
        <NotifyMeWidget
          onOpenAI={() => setDrawerOpen(true)}
          city={cityName}
          category={category}
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
          Termin potvrđen za {bestSlot ? new Date(bestSlot.startTime).toLocaleTimeString("sr-Latn", { hour: "2-digit", minute: "2-digit" }) : ""}
        </div>
      )}

      <StickyOffer
        visible={!drawerOpen && !modalSlot}
        slot={bestSlot}
        onBook={setModalSlot}
      />

      <BookingModal
        slot={modalSlot}
        onClose={() => setModalSlot(null)}
        onConfirm={() => { setModalSlot(null); setConfirmed(true); }}
        onLoginRequest={handleLoginRequest}
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
