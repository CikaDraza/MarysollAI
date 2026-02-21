"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useCallback,
} from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { ThreadItem } from "@/types/ai/chat-thread";
import { TextEngine } from "../layout/TextEngine";
import { LayoutEngine } from "../layout/LayoutEngine";

interface Props {
  thread: ThreadItem[];
  onAction?: (type: string) => void;
  streamingText?: string;
  isStreaming?: boolean;
  error?: string | null;
  resetError?: () => void;
  onRetry?: () => void;
}

const clientStore = {
  isClient: typeof window !== "undefined",
  subscribe: () => () => {},
  getSnapshot: () => typeof window !== "undefined",
  getServerSnapshot: () => false,
};

export default function TimelineRenderer({
  thread,
  streamingText,
  isStreaming,
  error,
  resetError,
  onRetry,
  onAction,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const lastThreadLength = useRef(thread.length);

  const isClient = useSyncExternalStore(
    clientStore.subscribe,
    clientStore.getSnapshot,
    clientStore.getServerSnapshot,
  );

  // Stabilna funkcija za skrol
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }, []);

  // Stabilna funkcija za proveru pozicije (bez izazivanja cascading renders)
  const checkScrollPosition = useCallback(() => {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    const distanceToBottom =
      mainContent.scrollHeight -
      (mainContent.scrollTop + mainContent.clientHeight);

    // Koristimo funkcionalni update da izbegnemo nepotrebne rendere ako je stanje isto
    setShowScrollDown(() => (distanceToBottom > 200 ? true : false));
  }, []);

  // 1. Pratimo fizički scroll događaj
  useEffect(() => {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    mainContent.addEventListener("scroll", checkScrollPosition);
    return () => mainContent.removeEventListener("scroll", checkScrollPosition);
  }, [checkScrollPosition]);

  // 2. Glavni efekat za skrolovanje i dugme
  useEffect(() => {
    if (!isClient) return;
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    const isNewMessage = thread.length > lastThreadLength.current;
    const isAtBottom =
      mainContent.scrollHeight -
        (mainContent.scrollTop + mainContent.clientHeight) <
      150;

    if (isNewMessage || (isStreaming && isAtBottom)) {
      // Skrolujemo u sledećem frame-u da dozvolimo DOM-u da se ažurira
      requestAnimationFrame(() => {
        scrollToBottom(isNewMessage ? "smooth" : "auto");
      });
    }

    // Umesto direktnog setState, pozivamo proveru nakon što se završi render
    const timeoutId = setTimeout(checkScrollPosition, 100);

    lastThreadLength.current = thread.length;
    return () => clearTimeout(timeoutId);
  }, [
    thread.length,
    isStreaming,
    streamingText,
    isClient,
    scrollToBottom,
    checkScrollPosition,
  ]);

  const performScroll = (behavior: ScrollBehavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior,
        block: "end",
      });
    }
  };

  useEffect(() => {
    if (!isClient) return;
    if (lastThreadLength.current === thread.length && !isStreaming) {
      return;
    }

    requestAnimationFrame(() => {
      performScroll("smooth");
    });
  }, [thread, streamingText, isStreaming, isClient]);

  // 3. ResizeObserver za dinamičke blokove (Cenovnik itd.)
  useEffect(() => {
    if (!isClient || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      const mainContent = document.getElementById("main-content");
      if (!mainContent) return;

      const isAtBottom =
        mainContent.scrollHeight -
          (mainContent.scrollTop + mainContent.clientHeight) <
        150;

      if (isStreaming && isAtBottom) {
        scrollToBottom("auto");
      }
      checkScrollPosition();
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [isStreaming, isClient, scrollToBottom, checkScrollPosition]);

  const scrollToTop = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  };

  const scrollToItem = (id: string) => {
    if (!isClient) return;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!isClient) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex w-full lg:max-w-5xl mx-auto"
    >
      <div className="max-w-full flex-1 space-y-8 pb-32 md:pb-8">
        {thread.map((item) => (
          <div
            key={item.id}
            id={item.id}
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            {item.type === "message" ? (
              <div
                className={`flex ${item.data.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] p-4 rounded-lg ${item.data.role === "user" ? "bg-gray-100" : "border-l-6 border-(--secondary-color) bg-gray-50"}`}
                >
                  <TextEngine messages={item.data} />
                </div>
              </div>
            ) : (
              <div className="my-4">
                <LayoutEngine blocks={item.data} onMessageAction={onAction} />
              </div>
            )}
          </div>
        ))}

        {isStreaming && streamingText && (
          <div className="flex justify-start animate-in fade-in duration-300 pb-32">
            <div className="max-w-[80%] p-4 rounded-2xl border-l-6 border-(--secondary-color) bg-gray-50 text-gray-800">
              {streamingText}
              <span className="inline-block w-1.5 h-4 ml-1 bg-(--secondary-color) animate-pulse align-middle" />
            </div>
          </div>
        )}
        {error && (
          <div className="max-w-2xl mx-auto pb-32 animate-in slide-in-from-bottom-2 text-center">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-sm text-red-800 font-medium">
                MarysollAI asistent nije mogao da završi odgovor.
              </p>
              <div className="flex gap-2 justify-center mt-3">
                <button
                  onClick={resetError}
                  className="text-xs bg-red-600 text-white px-4 py-2 rounded-lg"
                >
                  Reset
                </button>
                <button
                  onClick={onRetry}
                  className="text-xs bg-(--secondary-color) text-white px-4 py-2 rounded-lg"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-20 w-full clear-both" />
      </div>

      {showScrollDown && (
        <div className="fixed bottom-30 left-16 z-50 flex flex-col items-center gap-2">
          {isStreaming && (
            <span className="absolute w-28 bg-white/90 -top-8 text-[10px] px-2 py-1 rounded shadow-sm border border-purple-100 animate-pulse text-purple-600 font-bold">
              Assistant typing...
            </span>
          )}
          <button
            onClick={() => scrollToBottom("smooth")}
            className="cursor-pointer bg-purple-600 hover:bg-(--secondary-color) text-white p-1.5 rounded-full shadow-2xl relative transition-all"
          >
            <ChevronDownIcon className="size-6" />
            {isStreaming && (
              <div className="absolute -inset-1 border-2 border-purple-400 rounded-full animate-ping opacity-75" />
            )}
          </button>
        </div>
      )}
      {/* Grok Style Sidebar Timeline */}
      {
        <div className="fixed right-2 md:right-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 group">
          <button
            onClick={() => scrollToTop("top")}
            className="cursor-pointer mb-2 p-2 bg-white rounded-full shadow-sm md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            <ChevronUpIcon className="size-4" />
          </button>
          <div className="flex flex-col gap-3">
            {thread
              .filter((i) => i.type === "message" && i.data.role === "user")
              .map((msg) => {
                if (msg.type !== "message") return null;
                return (
                  <button
                    key={msg.id}
                    onClick={() => scrollToItem(msg.id)}
                    className="cursor-pointer h-1 w-4 bg-gray-300 rounded-full hover:h-1.25 hover:w-8 hover:bg-pink-500 transition-all relative group/tick"
                  >
                    <span className="absolute right-10 top-1/2 -translate-y-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/tick:opacity-100 whitespace-nowrap">
                      {msg.data.content.substring(0, 20)}...
                    </span>
                  </button>
                );
              })}
          </div>
          <button
            onClick={() => scrollToBottom()}
            className="cursor-pointer mt-2 md:opacity-0 md:group-hover:opacity-100 transition-all p-2 md:hover:bg-white bg-white rounded-full"
          >
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
      }
    </div>
  );
}
