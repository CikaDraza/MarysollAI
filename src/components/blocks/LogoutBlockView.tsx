// src/components/blocks/LogoutBlockView.tsx
"use client";
import { useAuthActions } from "@/hooks/useAuthActions";
import { Toaster } from "react-hot-toast";
import { HandRaisedIcon } from "@heroicons/react/24/outline";
import { LockOpenIcon } from "@heroicons/react/24/outline";
import { Reveal } from "../motion/Reveal";
import { motion } from "framer-motion";
import { CollapseView } from "../motion/CollapseView";
import { useEffect, useRef } from "react";

interface Props {
  onActionComplete?: (msg: string) => void;
}

export function LogoutBlockView({ onActionComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuthActions();
  const showButton = !user || false;

  // FUNKCIJA ZA SKROL KOJA CILJA GLAVNI KONTEJNER
  const triggerGlobalScroll = () => {
    const mainContent = document.getElementById("main-content");
    if (mainContent && containerRef.current) {
      // Skrolujemo tako da ovaj blok dođe u vidno polje
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start", // "start" je bolje za velike blokove kao cenovnik
      });
    }
  };

  // 1. Skroluj čim podaci prestanu da se učitavaju
  useEffect(() => {
    // Mali delay da dozvolimo React-u da renderuje listu
    const timer = setTimeout(triggerGlobalScroll, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={containerRef} className="scroll-mt-20">
      <Reveal>
        <div className="isolate relative bg-gray-900 rounded-2xl">
          <Toaster position="top-right" />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 -top-44 -z-10 transform-gpu overflow-hidden blur-3xl lg:-top-96"
          >
            <div
              style={{
                clipPath:
                  "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
              }}
              className="relative left-1/2 -z-10 aspect-1155/678 w-144.5 max-w-none -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-40rem)] sm:w-288.75"
            />
          </div>
          <div className="flex flex-col justify-center px-6 py-12 lg:px-8">
            <div className="header sm:mx-auto sm:w-full sm:max-w-xl">
              <motion.div
                initial={false}
                animate={{ rotate: user ? 360 : 0, scale: user ? 1.2 : 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
              >
                {user ? (
                  <LockOpenIcon className="size-10 mx-auto text-teal-400" />
                ) : (
                  <HandRaisedIcon className="size-10 mx-auto text-(--secondary-color)" />
                )}
              </motion.div>
              <h3 className="mt-10 mb-4 text-center text-xl/9 font-bold tracking-tight text-white">
                {user
                  ? `Želiš da se izloguješ, ${user.name || ""}?`
                  : `Vratite nam se uskoro. Uvek ste dobrodošli!`}
              </h3>
              <CollapseView isExpanded={!showButton}>
                <button
                  onClick={() => {
                    logout();
                    if (onActionComplete) {
                      onActionComplete("USPEŠNA ODJAVA.");
                    }
                  }}
                  className="cursor-pointer block w-full border-t border-gray-200 text-left px-4 py-2 text-sm text-gray-900 bg-gray-50 hover:bg-gray-100"
                >
                  Odjavi se
                </button>
              </CollapseView>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
