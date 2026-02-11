// src/components/chat/TimelineRenderer.tsx
"use client";
import { useEffect, useRef } from "react";
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
  const initialThreadLength = useRef(thread.length);

  const performScroll = (behavior: ScrollBehavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior,
        block: "end",
      });
    }
  };

  // Automatski scroll na dole
  useEffect(() => {
    // 1. Ako je prvo učitavanje stranice, ne mrdaj nigde (da korisnik vidi blog)
    if (initialThreadLength.current === thread.length && !isStreaming) {
      return;
    }

    requestAnimationFrame(() => {
      performScroll("smooth");
    });
  }, [thread, streamingText, isStreaming]);

  useEffect(() => {
    if (isStreaming && streamingText) {
      performScroll("smooth");
    }
  }, [streamingText, isStreaming]);

  useEffect(() => {
    if (
      !containerRef.current ||
      (initialThreadLength.current === thread.length && !isStreaming)
    )
      return;

    const resizeObserver = new ResizeObserver(() => {
      if (!isStreaming) {
        performScroll("smooth");
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [thread.length, isStreaming]);

  useEffect(() => {
    if (error) {
      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }, [error]);

  const scrollToItem = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const lastItem = thread[thread.length - 1];
  const isLastItemAssistantMessage =
    lastItem?.type === "message" && lastItem.data.role === "assistant";
  const shouldShowStreaming =
    isStreaming && streamingText && !isLastItemAssistantMessage;

  return (
    <div className="relative flex w-full lg:max-w-5xl mx-auto">
      {/* GLAVNI CHAT NIZ */}
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
                  className={`max-w-[80%] p-4 rounded-lg ${
                    item.data.role === "user"
                      ? "bg-gray-100"
                      : "border-l-6 border-(--secondary-color) bg-gray-50"
                  }`}
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
        {/* 2. ŽIVA PORUKA KOJA SE KUCA (Samo dok AI odgovara) */}
        {shouldShowStreaming && (
          <div className="flex justify-start animate-in fade-in duration-300 pb-32">
            <div className="max-w-[80%] p-4 rounded-2xl border-l-6 border-(--secondary-color) bg-gray-50">
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                {streamingText}
                {/* Marysoll AI kursor/blink */}
                <span className="inline-block w-1.5 h-4 ml-1 bg-pink-400 animate-pulse align-middle" />
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto pb-32 animate-in slide-in-from-bottom-2">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col items-center gap-3">
              <p className="text-sm text-red-800 font-medium text-center">
                MarysollAI asistent nije mogao da završi odgovor.
                <br />
                <span className="text-xs text-red-900/70 font-medium text-center">
                  {"(MarysollAI Assistant was unable to finish replying.)"}
                </span>
                <br />
                <span className="text-xs font-normal opacity-70">
                  Error: {error}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="text-xs bg-white border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Refresh Page
                </button>
                <button
                  onClick={resetError}
                  className="text-xs bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Reset Error
                </button>
                <button
                  onClick={onRetry}
                  className="text-xs bg-(--secondary-color) text-white px-4 py-2 rounded-lg hover:bg-(--secondary-color)/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-30 w-full clear-both" />
      </div>

      {/* DESNI VERTIKALNI TIMELINE (Grok Style) */}

      <div className="fixed right-2 md:right-8 top-[40%] md:top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 group">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="cursor-pointer md:opacity-0 md:group-hover:opacity-100 transition-all p-2 md:hover:bg-white bg-white rounded-full"
        >
          <ChevronUpIcon className="size-4" />
        </button>

        <div className="flex flex-col gap-3 items-end">
          {thread
            .filter((i) => i.type === "message" && i.data.role === "user")
            .map((userMsg) => {
              if (userMsg.type !== "message") return null;
              return (
                <button
                  key={userMsg.id}
                  onClick={() => scrollToItem(userMsg.id)}
                  className="cursor-pointer h-1 w-4 bg-gray-300 rounded-full hover:w-8 hover:bg-pink-500 transition-all relative group/tick"
                >
                  <span className="absolute right-10 top-1/2 -translate-y-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/tick:opacity-100 whitespace-nowrap">
                    {userMsg.data.content.substring(0, 20)}...
                  </span>
                </button>
              );
            })}
        </div>

        <button
          onClick={() =>
            bottomRef.current?.scrollIntoView({ behavior: "smooth" })
          }
          className="cursor-pointer md:opacity-0 md:group-hover:opacity-100 transition-all p-2 md:hover:bg-white bg-white rounded-full"
        >
          <ChevronDownIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
