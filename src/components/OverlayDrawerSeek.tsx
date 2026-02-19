// components/OverlayDrawer.tsx
"use client";

import { useRef, useEffect, useState } from "react";
import {
  BoltIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useDrawerSeek } from "@/hooks/useDrawerSeek";
import { HistoryDropdown } from "@/components/chat/HistoryDropdown";
import toast from "react-hot-toast";
import { Message } from "@/types/ai/deepseek";
import { useChatSeek } from "@/hooks/useChatSeek";
import { UsageStatsSeek } from "./chat/UsageStatsSeek";
import { Button } from "@headlessui/react";

export default function OverlayDrawerSeek() {
  const { isOpen, type, closeDrawer } = useDrawerSeek();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showStats, setShowStats] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    sessions,
    currentSession,
    sendMessage,
    isSending,
    isStreaming,
    error,
    isEmpty,
    clearChat,
    usage,
    loadSession,
    deleteSession,
    createNewChat,
  } = useChatSeek({
    onError: (error: unknown) => {
      console.error("Chat error:", error);
      toast.error(`Greška: ${error instanceof Error && error.message}`);
    },
    onSuccess: (message: Message) => {
      if (message.role === "assistant") {
        toast.success("Odgovor primljen");
      }
    },
  });

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fokusiraj input kad se otvori drawer
  useEffect(() => {
    if (isOpen && type === "chat") {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, type]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Sačuvaj referencu pre nego što se desi async operacija
    const form = e.currentTarget;
    const message = new FormData(form).get("message") as string;

    if (message?.trim()) {
      try {
        await sendMessage(message);
        // Resetuj formu samo ako još uvek postoji u DOM-u
        if (form && document.body.contains(form)) {
          form.reset();
        }
        // Vrati fokus na input
        inputRef.current?.focus();
      } catch (error) {
        console.error("Error sending message:", error);
        toast.error("Greška pri slanju poruke");
      }
    }
  };

  const handleNewChat = () => {
    createNewChat();
    setShowStats(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  if (type !== "chat") return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 shadow-xl relative z-50">
      <header className="p-4 border-b border-gray-200 flex-none bg-white">
        <div className="flex items-center justify-between">
          <Button
            onClick={() => closeDrawer()}
            className="cursor-pointer relative -mr-2 flex size-10 items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
          >
            <span className="absolute -inset-0.5" />
            <span className="sr-only">Close menu</span>
            <XMarkIcon aria-hidden="true" className="size-6" />
          </Button>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Marysoll AI Asistent
          </h2>
          <div className="flex items-center gap-2 overflow-visible relative">
            <HistoryDropdown
              sessions={sessions}
              currentSessionId={currentSession?.id || null}
              onSelectSession={loadSession}
              onDeleteSession={deleteSession}
              onNewChat={handleNewChat}
            />
            {!isEmpty && (
              <button
                type="button"
                onClick={clearChat}
                className="rounded-md p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Očisti trenutnu konverzaciju"
              >
                <span className="sr-only">Očisti chat</span>
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-gray-50/50">
        <div className="space-y-4">
          {messages.map((message: Message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.role === "user"
                    ? "bg-(--secondary-color) text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap wrap-break-word">
                  {message.content}
                </p>
                <p className="text-xs mt-1 opacity-70">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {isStreaming &&
            !messages.some((m: Message) => m.id === "streaming") && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3">
                  <div className="flex space-x-1">
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400">
                Greška: {error.message}
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <footer className="p-4 border-t border-gray-200 flex-none bg-white">
        <div className="relative">
          <UsageStatsSeek isOpen={showStats} usage={usage} />

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="flex gap-2 flex-col md:flex-row"
          >
            <input
              ref={inputRef}
              type="text"
              name="message"
              placeholder="Poruči nešto..."
              disabled={isSending}
              className="flex-1 rounded-md border-0 px-3.5 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm  placeholder:text-gray-400 sm:text-sm sm:leading-6 disabled:opacity-50"
              autoComplete="off"
            />

            <button
              type="button"
              onClick={() => setShowStats(!showStats)}
              className={`cursor-pointer p-2 size-9 rounded-full hover:text-[#BA34B7] transition-colors ${
                showStats
                  ? "text-[#BA34B7] bg-pink-100 shadow-lg"
                  : "text-gray-400"
              }`}
            >
              <BoltIcon className="size-5" />
            </button>

            <button
              type="submit"
              disabled={isSending}
              className="cursor-pointer rounded-full bg-(--secondary-color)/90 p-2.5 text-sm font-semibold text-white shadow-sm hover:bg-(--secondary-color) focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-(--secondary-color) disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                "Šaljem..."
              ) : (
                <div className="flex items-center">
                  <PaperAirplaneIcon className="size-5 -rotate-45" />
                  <span className="flex-1 md:hidden">Posalji</span>
                </div>
              )}
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
