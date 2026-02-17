// src/components/layout/LayoutWithSidebar.tsx
"use client";

import { useDrawerSeek } from "@/hooks/useDrawerSeek";
import Header from "../Header";
import OverlayDrawerSeek from "../OverlayDrawerSeek";
import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { AuthProvider } from "@/hooks/context/AuthContext";
import { AIAgentPanel } from "../AIAgentPanel";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useAIQuery } from "@/hooks/useAIQuery";

const TimelineRendererNoSSR = dynamic(
  () => import("@/components/chat/TimelineRenderer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-(--secondary-color)" />
      </div>
    ),
  },
);

export default function LayoutWithSidebar({
  children,
}: {
  children: ReactNode;
}) {
  const { user, token } = useAuthActions();
  const { isOpen } = useDrawerSeek();
  const {
    askAI,
    thread,
    streamingText,
    isStreaming,
    isTextLoading,
    error,
    resetError,
    retry,
    clearChat,
  } = useAIQuery(user);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Leva kolona main kontent */}
      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden min-w-0 transition-all duration-300 ease-in-out">
        <div className="flex-none">
          <Header />
        </div>
        <div id="top" />
        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 pt-6">{children}</div>
          <AuthProvider token={token || null}>
            <div className="relative isolate px-6 lg:px-8">
              <TimelineRendererNoSSR
                thread={thread}
                onAction={askAI}
                streamingText={streamingText}
                isStreaming={isStreaming}
                error={error}
                resetError={resetError}
                onRetry={retry}
              />
              <div className="sticky bottom-0 left-0 right-0 z-40">
                <AIAgentPanel
                  onSubmit={askAI}
                  isLoading={isTextLoading}
                  thread={thread}
                  clearChat={clearChat}
                />
              </div>
            </div>
          </AuthProvider>
        </main>
      </div>

      {/* DESNA KOLONA: Sidebar (Chat) */}
      <aside
        className={`
          relative h-screen border-l border-gray-200 bg-white transition-all duration-300 ease-in-out flex-none
          ${isOpen ? "visible w-full lg:w-100" : "w-0 invisible overflow-hidden border-none"}
        `}
      >
        <div className="h-full">
          <OverlayDrawerSeek />
        </div>
      </aside>
    </div>
  );
}
