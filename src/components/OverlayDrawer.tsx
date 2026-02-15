"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  TransitionChild,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useYandexGPT } from "@/hooks/useYandexGPT";
import AIYandexPanel from "./AIYandexPanel";
import ChatMessages from "./ChatMessages";
import { useDrawer } from "@/hooks/useDrawer";
import { UsageYandexStats } from "./chat/UsageYandexStats";

export default function OverlayDrawer() {
  const { isOpen, closeDrawer, prompt, setDrawerPrompt } = useDrawer();
  const { data: response, isLoading, error, refetch } = useYandexGPT(prompt);
  const [showStats, setShowStats] = useState(false);

  const messages = useMemo(() => {
    if (!prompt) return [];

    // Prva poruka je uvek korisnik
    const msgs: { role: "user" | "assistant"; text: string }[] = [
      { role: "user" as const, text: prompt },
    ];

    const aiText = response?.result?.alternatives?.[0]?.message?.text;

    if (aiText) {
      // Dodajemo AI odgovor SAMO ako postoji
      msgs.push({ role: "assistant" as const, text: aiText });
    }

    return msgs;
  }, [prompt, response]);

  // Usage podaci za panel
  const usage = response?.result?.usage;

  return (
    <Dialog open={isOpen} onClose={closeDrawer} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity duration-500 ease-in-out data-closed:opacity-0"
      />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            <DialogPanel
              transition
              className="pointer-events-auto relative w-screen max-w-md transform transition duration-500 ease-in-out data-closed:translate-x-full sm:duration-700"
            >
              <TransitionChild>
                <div className="absolute top-0 left-0 -ml-8 flex pt-4 pr-2 duration-500 ease-in-out data-closed:opacity-0 sm:-ml-10 sm:pr-4">
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="relative rounded-md text-gray-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    <span className="absolute -inset-2.5" />
                    <span className="sr-only">Marysoll</span>
                    <XMarkIcon aria-hidden="true" className="size-6" />
                  </button>
                </div>
              </TransitionChild>
              <div className="relative flex h-full flex-col overflow-y-auto bg-white pt-6 shadow-xl">
                <div className="px-4 sm:px-6">
                  <DialogTitle className="text-base font-semibold text-gray-900">
                    Marysoll
                  </DialogTitle>
                </div>
                <div className="relative mt-6 flex-1 pb-40 px-4 sm:px-6">
                  <UsageYandexStats isOpen={showStats} usage={usage} />

                  <ChatMessages messages={messages} />
                  <AIYandexPanel
                    onSubmit={setDrawerPrompt}
                    error={error}
                    refetch={refetch}
                    isLoading={isLoading}
                    showStats={showStats}
                    setShowStats={setShowStats}
                  />
                </div>
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
