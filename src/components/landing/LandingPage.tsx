// src/components/landing/LandingPage
"use client";

import { CheckIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import LandingHeader from "./LandingHeader";
import Hero from "./Hero";
import TrustRow from "./TrustRow";
import QuickAccess from "./QuickAccess";
import BookingWidget from "./BookingWidget";
import BookingModal from "./BookingModal";
import NotifyMeWidget from "./NotifyMeWidget";
import StickyOffer from "./StickyOffer";
import AIDrawer from "./AIDrawer";
import AIWorkspace from "./AIWorkspace";
import {
  LandingUIProvider,
  useLandingUI,
} from "@/context/landing/LandingUIContext";
import { CityProvider } from "@/context/landing/CityContext";
import { FiltersProvider } from "@/context/landing/FiltersContext";
import { BookingModalProvider } from "@/context/landing/BookingModalContext";
import {
  SearchProvider,
  useSearchContext,
} from "@/context/landing/SearchContext";
import { AIProvider } from "@/context/landing/AIContext";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/context/landing/WorkspaceContext";

const SIDEBAR_W = 500;

interface Props {
  initialCity?: string;
  initialCategory?: string;
}

export default function LandingPage({
  initialCity = "",
  initialCategory = "",
}: Props) {
  return (
    <LandingUIProvider>
      <CityProvider initialCity={initialCity}>
        <FiltersProvider initialCategory={initialCategory}>
          <SearchProvider>
            <BookingModalProvider>
              <AIProvider>
                <WorkspaceProvider>
                  <LandingPageContent />
                </WorkspaceProvider>
              </AIProvider>
            </BookingModalProvider>
          </SearchProvider>
        </FiltersProvider>
      </CityProvider>
    </LandingUIProvider>
  );
}

function LandingPageContent() {
  const { drawerOpen } = useLandingUI();

  // On mobile (<= 1024px) the sidebar stays as a fixed overlay — no content shift.
  // On desktop it pushes the page content to the left.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1025px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const pushContent = isDesktop && drawerOpen;

  return (
    <div
      className="relative min-h-screen"
      style={{
        fontFamily: "var(--main-font)",
        marginRight: pushContent ? SIDEBAR_W : 0,
        transition: `margin-right 280ms var(--ease-out)`,
      }}
    >
      {/* Page gradient */}
      <div
        aria-hidden="true"
        className="page-gradient absolute top-0 left-0 right-0 h-[110vh] pointer-events-none z-0"
      />

      {/* Fixed floating header — shrinks with sidebar on desktop only */}
      <div
        className="fixed top-0 left-0 z-50 px-6 py-3 bg-white/5 backdrop-blur"
        style={{
          right: pushContent ? SIDEBAR_W : 0,
          transition: `right 280ms var(--ease-out)`,
        }}
      >
        <div className="max-w-[1240px] mx-auto">
          <LandingHeader />
        </div>
      </div>

      <div className="h-[72px]" aria-hidden="true" />

      <Hero />

      <main
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 24px 120px",
        }}
      >
        <TrustRow />

        {/* AI Workspace replaces QuickAccess when a block is active */}
        <WorkspaceSection />

        <BookingWidget />
        <NotifyMeWidget />
      </main>

      <ConfirmedToast />
      <StickyOffer />
      <BookingModal />
      <AIDrawer />
    </div>
  );
}

/** Shows the AI workspace block when active, QuickAccess when idle. */
function WorkspaceSection() {
  const { activeBlock } = useWorkspace();

  return (
    <>
      {/* AI Workspace (enters when block arrives) */}
      <AIWorkspace />

      {/* QuickAccess (exits when block arrives) */}
      <AnimatePresence>
        {!activeBlock && (
          <motion.div
            key="quickaccess"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.38, ease: [0.04, 0.62, 0.23, 0.98] }}
            style={{ overflow: "hidden" }}
          >
            <QuickAccess />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ConfirmedToast() {
  const { confirmed } = useLandingUI();
  const { bestSlot } = useSearchContext();

  if (!confirmed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-[22px] -translate-x-1/2 z-80 inline-flex items-center gap-2 rounded-[14px] bg-[#111114] px-[18px] py-3 text-[13px] font-semibold text-white shadow-[var(--shadow-lg)]"
      style={{ fontFamily: "var(--main-font)" }}
    >
      <CheckIcon style={{ width: 16, height: 16 }} strokeWidth={2} />
      Termin potvrđen za{" "}
      {bestSlot
        ? new Date(bestSlot.startTime).toLocaleTimeString("sr-Latn", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : ""}
    </div>
  );
}
