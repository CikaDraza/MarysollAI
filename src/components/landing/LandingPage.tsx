// src/components/landing/LandingPage
"use client";

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import LandingHeader from "./LandingHeader";
import Hero from "./Hero";
import QuickAccess from "./QuickAccess";
import BookingWidget from "./BookingWidget";
import BookingModal from "./BookingModal";
import NotifyMeWidget from "./NotifyMeWidget";
import StickyOffer from "./StickyOffer";
import AIDrawer from "./AIDrawer";
import AIWorkspace from "./AIWorkspace";
import HomepagePreloader from "./HomepagePreloader";
import SearchDebugPanel from "./SearchDebugPanel";
import {
  LandingUIProvider,
  useLandingUI,
} from "@/context/landing/LandingUIContext";
import { CityProvider } from "@/context/landing/CityContext";
import { FiltersProvider } from "@/context/landing/FiltersContext";
import { BookingModalProvider } from "@/context/landing/BookingModalContext";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import {
  SearchProvider,
  useSearchContext,
} from "@/context/landing/SearchContext";
import { AIProvider, useAIContext } from "@/context/landing/AIContext";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/context/landing/WorkspaceContext";
import { AgentBridge } from "@/components/chat-bus/AgentBridge";
import type { SearchResult } from "@/types/slots";
import { useAuthActions } from "@/hooks/useAuthActions";

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
                <LandingAgentBridge>
                  <WorkspaceProvider>
                    <LandingPageContent />
                  </WorkspaceProvider>
                </LandingAgentBridge>
              </AIProvider>
            </BookingModalProvider>
          </SearchProvider>
        </FiltersProvider>
      </CityProvider>
    </LandingUIProvider>
  );
}

function LandingAgentBridge({ children }: { children: React.ReactNode }) {
  const { invokeClaudia } = useAIContext();
  return <AgentBridge claudiaAskAI={invokeClaudia}>{children}</AgentBridge>;
}

function LandingPageContent() {
  const { drawerOpen, setDrawerOpen } = useLandingUI();
  const { activeBlock } = useWorkspace();
  const lastAutoClosedBlockId = useRef<string | null>(null);

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
  const activeBlockId = activeBlock?.id ?? null;

  useEffect(() => {
    if (!activeBlockId) return;
    if (lastAutoClosedBlockId.current === activeBlockId) return;

    lastAutoClosedBlockId.current = activeBlockId;

    const isDesktopViewport = window.matchMedia("(min-width: 1025px)").matches;
    if (!isDesktopViewport && drawerOpen) {
      setDrawerOpen(false);
    }
  }, [activeBlockId, drawerOpen, setDrawerOpen]);

  return (
    <div
      className="relative min-h-screen"
      style={{
        fontFamily: "var(--main-font)",
        marginRight: pushContent ? SIDEBAR_W : 0,
        transition: `margin-right 280ms var(--ease-out)`,
      }}
    >
      {/* Phase 2.5B — silent homepage preload. Renders nothing; warms
          TanStack's cache so QuickAccess/BookingWidget mount with data. */}
      <HomepagePreloader />
      <Suspense fallback={null}>
        <ResumeWatchOpener />
      </Suspense>

      {/* Phase 2.5D — dev-only ranking observability. Renders nothing in
          production. */}
      <SearchDebugPanel />

      {/* Page gradient */}
      <div
        aria-hidden="true"
        className="page-gradient absolute top-0 left-0 right-0 h-[110vh] pointer-events-none z-0"
      />

      {/* Fixed floating header — shrinks with sidebar on desktop only */}
      <div
        className="fixed top-0 left-0 z-50 px-6 pt-3 bg-white/5 backdrop-blur"
        style={{
          right: pushContent ? SIDEBAR_W : 0,
          transition: `right 280ms var(--ease-out)`,
        }}
      >
        <div className="max-w-7xl mx-auto">
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
        {/* AI Workspace replaces QuickAccess when a block is active */}
        <WorkspaceSection />

        <BookingWidget />
        <NotifyMeWidget />
      </main>
      <div className="max-w-7xl mx-auto">
        <LandingFooter />
      </div>

      <ConfirmedToast />
      <StickyOffer />
      <BookingModal />
      <AIDrawer />
    </div>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[var(--border-1)] py-8">
      <div className="flex flex-col gap-4 text-[13px] font-semibold text-[var(--fg-3)] sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0">
          © {new Date().getFullYear()}. Powered by Marysoll - Marysoll Booking -
          conversational booking za moderne beauty salone.
        </p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/terms"
            className="transition-colors hover:text-[var(--secondary-color)]"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-[var(--secondary-color)]"
          >
            Privacy
          </Link>
          <Link
            href="https://marysoll.com"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--secondary-color)]"
          >
            marysoll.com
          </Link>
        </nav>
      </div>
    </footer>
  );
}

function ResumeWatchOpener() {
  const searchParams = useSearchParams();
  const { openModal } = useBookingModal();
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    const watchId = searchParams.get("resumeWatch");
    if (!watchId || openedRef.current === watchId) return;
    openedRef.current = watchId;
    const activeWatchId = watchId;

    let cancelled = false;
    async function openMatchedSlot() {
      const res = await fetch(
        `/api/waitlist?id=${encodeURIComponent(activeWatchId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        matchedSlot?: Partial<SearchResult> | null;
      };
      if (!cancelled && data.matchedSlot) {
        openModal(data.matchedSlot);
      }
    }

    void openMatchedSlot();
    return () => {
      cancelled = true;
    };
  }, [openModal, searchParams]);

  return null;
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
  const { confirmed, confirmedTime, setConfirmed } = useLandingUI();
  const { bestSlot } = useSearchContext();
  const { user } = useAuthActions();

  if (!confirmed) return null;

  const time =
    confirmedTime ||
    (bestSlot
      ? new Date(bestSlot.startTime).toLocaleTimeString("sr-Latn", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "");

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-[22px] z-80 flex max-w-[min(92vw,520px)] -translate-x-1/2 items-start gap-3 rounded-[14px] bg-[#111114] px-[18px] py-3 pr-10 text-[13px] font-semibold text-white shadow-[var(--shadow-lg)]"
      style={{ fontFamily: "var(--main-font)" }}
    >
      <CheckIcon
        style={{ width: 18, height: 18, flexShrink: 0 }}
        strokeWidth={2}
      />
      <span>
        Zahtev za termin{time ? ` u ${time}` : ""} je poslat salonu i čeka
        potvrdu.{" "}
        {user
          ? "Status možeš da pratiš u Moji termini, a potvrda stiže na email/kontakt sa naloga."
          : "Potvrdu ćeš dobiti preko kontakta koji si ostavio."}
      </span>
      <button
        type="button"
        aria-label="Zatvori"
        onClick={() => setConfirmed(false)}
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border-0 bg-white/10 text-white hover:bg-white/20"
      >
        <XMarkIcon style={{ width: 14, height: 14 }} strokeWidth={2} />
      </button>
    </div>
  );
}
