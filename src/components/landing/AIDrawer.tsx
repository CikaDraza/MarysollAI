"use client";

import Image from "next/image";
import { useState, useRef, useEffect, useMemo } from "react";
import { XMarkIcon, CheckIcon, PaperAirplaneIcon, BoltIcon } from "@heroicons/react/24/outline";
import { ThreadItem } from "@/types/ai/chat-thread";
import { ChatSession } from "@/types/ai/deepseek";
import { HistoryDropdown } from "@/components/chat/HistoryDropdown";
import { UsageStats } from "@/components/chat/UsageStats";

type Message = { from: "maria" | "me"; text: string; kind?: "suggest" };

const INITIAL: Message[] = [
  {
    from: "maria",
    text: "Zdravo! Ja sam Maria. Mogu da pronađem slobodan termin, popunim formu ili da te prijavim. Šta želiš?",
  },
];

const CHIPS = [
  { label: "Najbliži salon", value: "Najbliži salon za masažu" },
  { label: "Moji termini", value: "Šta sam zakazala?" },
  { label: "Otkaži termin", value: "Otkaži termin sutra" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onAsk?: (q: string) => void;
  aiThread?: ThreadItem[];
  streamingText?: string;
  isStreaming?: boolean;
  onClearChat?: () => void;
}

export default function AIDrawer({
  open,
  onClose,
  onAsk,
  aiThread,
  streamingText,
  isStreaming,
  onClearChat,
}: Props) {
  const [localThread, setLocalThread] = useState<Message[]>(INITIAL);
  const [input, setInput] = useState("");
  const [showStats, setShowStats] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const syntheticSessions = useMemo<ChatSession[]>(() => {
    if (!aiThread || aiThread.length === 0) return [];
    const msgItems = aiThread.filter(
      (i): i is Extract<ThreadItem, { type: "message" }> => i.type === "message",
    );
    if (msgItems.length === 0) return [];
    const firstUser = msgItems.find((i) => i.data.role === "user");
    return [
      {
        id: "landing-session",
        title: firstUser
          ? firstUser.data.content.slice(0, 50) +
            (firstUser.data.content.length > 50 ? "..." : "")
          : "Konverzacija",
        messages: msgItems.map((i) => ({
          id: i.data.id,
          role: i.data.role as "user" | "assistant",
          content: i.data.content,
          createdAt: new Date(i.data.timestamp),
        })),
        createdAt: new Date(msgItems[0].data.timestamp),
        updatedAt: new Date(msgItems[msgItems.length - 1].data.timestamp),
      },
    ];
  }, [aiThread]);

  const usage = useMemo(() => {
    const msgItems =
      aiThread?.filter(
        (i): i is Extract<ThreadItem, { type: "message" }> => i.type === "message",
      ) || [];
    const messagesSent = msgItems.filter((i) => i.data.role === "user").length;
    const estimatedTokens = msgItems.reduce(
      (acc, i) => acc + Math.ceil(i.data.content.length / 4),
      0,
    );
    return { messagesSent, estimatedTokens };
  }, [aiThread]);

  const displayMessages = useMemo<Message[]>(() => {
    if (!aiThread) return localThread;
    const mapped = aiThread
      .filter((item): item is ThreadItem & { type: "message" } => item.type === "message")
      .map((item) => ({
        from: item.data.role === "user" ? ("me" as const) : ("maria" as const),
        text: item.data.content,
      }));
    return mapped.length === 0 ? INITIAL : mapped;
  }, [aiThread, localThread]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [displayMessages, streamingText, isStreaming]);

  const send = () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    setInput("");

    if (onAsk) {
      onAsk(msg);
    } else {
      setLocalThread((t) => [...t, { from: "me", text: msg }]);
      setTimeout(() => {
        setLocalThread((t) => [
          ...t,
          {
            from: "maria",
            kind: "suggest" as const,
            text: "Imam slobodan termin za masažu leđa danas u 14:00 u Studio Lavanda. Da popunim formu i potvrdim?",
          },
        ]);
      }, 600);
    }
  };

  const isSendEnabled = !!input.trim() && !isStreaming;

  return (
    <>
      <style>{`
        @keyframes maria-dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%           { transform: scale(1);   opacity: 1;   }
        }
      `}</style>

      <aside
        aria-hidden={!open}
        aria-label="AI asistent"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(420px, 92vw)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms var(--ease-out)",
          zIndex: 60,
          borderLeft: "1px solid var(--border-1)",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 18px",
            borderBottom: "1px solid var(--border-1)",
            background: "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "999px",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <Image
                src="/avatars/maria.png"
                alt="Maria"
                width={36}
                height={36}
                style={{ objectFit: "cover" }}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--main-font)",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "var(--fg-1)",
                }}
              >
                Maria Deep
              </div>
              <div
                style={{
                  fontFamily: "var(--main-font)",
                  fontWeight: 500,
                  fontSize: 11,
                  color: isStreaming ? "var(--secondary-color)" : "var(--success)",
                  transition: "color 200ms",
                }}
              >
                AI asistent · {isStreaming ? "kuca..." : "online"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <HistoryDropdown
              sessions={syntheticSessions}
              currentSessionId={syntheticSessions.length > 0 ? "landing-session" : null}
              onSelectSession={() => {}}
              onDeleteSession={() => onClearChat?.()}
              onNewChat={() => onClearChat?.()}
            />
            <button
              onClick={onClose}
              aria-label="Zatvori"
              style={{
                width: 38,
                height: 38,
                borderRadius: "999px",
                border: "none",
                background: "var(--surface-2)",
                color: "var(--fg-2)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-100)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
              }}
            >
              <XMarkIcon style={{ width: 18, height: 18 }} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Chat body */}
        <div
          ref={bodyRef}
          className="scrollbar-custom"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {displayMessages.map((m, i) =>
            m.from === "maria" ? (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  maxWidth: "85%",
                  alignSelf: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "999px",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <Image
                    src="/avatars/maria.png"
                    alt=""
                    width={28}
                    height={28}
                    style={{ objectFit: "cover" }}
                  />
                </div>
                <div
                  style={{
                    background: "var(--surface-2)",
                    padding: "10px 14px",
                    borderRadius: "16px 16px 16px 4px",
                    fontFamily: "var(--main-font)",
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: "var(--fg-1)",
                  }}
                >
                  {m.text}
                  {m.kind === "suggest" && (
                    <button
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 8,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "var(--main-font)",
                        fontWeight: 700,
                        fontSize: 12,
                        padding: "9px 14px",
                        borderRadius: 10,
                        background: "var(--secondary-color)",
                        color: "#fff",
                      }}
                    >
                      <CheckIcon style={{ width: 14, height: 14 }} strokeWidth={2} />
                      Potvrdi termin
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div key={i} style={{ maxWidth: "85%", alignSelf: "flex-end" }}>
                <div
                  style={{
                    background: "var(--secondary-color)",
                    padding: "10px 14px",
                    borderRadius: "16px 16px 4px 16px",
                    fontFamily: "var(--main-font)",
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: "#fff",
                  }}
                >
                  {m.text}
                </div>
              </div>
            )
          )}

          {/* Streaming text bubble */}
          {isStreaming && streamingText && (
            <div
              style={{
                display: "flex",
                gap: 8,
                maxWidth: "85%",
                alignSelf: "flex-start",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "999px",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Image
                  src="/avatars/maria.png"
                  alt=""
                  width={28}
                  height={28}
                  style={{ objectFit: "cover" }}
                />
              </div>
              <div
                style={{
                  background: "var(--surface-2)",
                  padding: "10px 14px",
                  borderRadius: "16px 16px 16px 4px",
                  fontFamily: "var(--main-font)",
                  fontWeight: 400,
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: "var(--fg-1)",
                }}
              >
                {streamingText}
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 14,
                    marginLeft: 4,
                    background: "var(--secondary-color)",
                    verticalAlign: "middle",
                    animation: "maria-dot-bounce 1s 0s infinite",
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          )}

          {/* Typing dots */}
          {isStreaming && !streamingText && (
            <div
              style={{
                display: "flex",
                gap: 8,
                maxWidth: "85%",
                alignSelf: "flex-start",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "999px",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Image
                  src="/avatars/maria.png"
                  alt=""
                  width={28}
                  height={28}
                  style={{ objectFit: "cover" }}
                />
              </div>
              <div
                style={{
                  background: "var(--surface-2)",
                  padding: "14px 18px",
                  borderRadius: "16px 16px 16px 4px",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "999px",
                      background: "var(--secondary-color)",
                      display: "inline-block",
                      animation: `maria-dot-bounce 1.1s ${i * 0.18}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick-action chips */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "0 16px 8px",
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          {CHIPS.map((c) => (
            <button
              key={c.label}
              onClick={() => setInput(c.value)}
              style={{
                background: "var(--surface-2)",
                color: "var(--secondary-color)",
                border: "1px solid var(--brand-100)",
                borderRadius: 999,
                padding: "6px 12px",
                fontFamily: "var(--main-font)",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                transition: "background var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-100)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div
          style={{
            padding: "0 12px 12px",
            borderTop: "1px solid var(--border-1)",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <UsageStats isOpen={showStats} usage={usage} />
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              paddingTop: 12,
            }}
          >
          <textarea
            rows={1}
            placeholder="Pitaj Mariju…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              background: "var(--surface-2)",
              borderRadius: 14,
              padding: "12px 14px",
              fontFamily: "var(--main-font)",
              fontWeight: 400,
              fontSize: 14,
              color: "var(--fg-1)",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid var(--secondary-color)";
              e.currentTarget.style.background = "var(--surface)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
              e.currentTarget.style.background = "var(--surface-2)";
            }}
          />
          <button
            onClick={() => setShowStats((s) => !s)}
            aria-label="Statistika korišćenja"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              background: showStats ? "var(--brand-100)" : "var(--surface-2)",
              color: showStats ? "var(--secondary-color)" : "var(--fg-2)",
              flexShrink: 0,
              transition: "background 150ms, color 150ms",
            }}
          >
            <BoltIcon style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          </button>
          <button
            onClick={send}
            disabled={!isSendEnabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: isSendEnabled ? "pointer" : "default",
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 12,
              padding: "9px 14px",
              borderRadius: 10,
              background: isSendEnabled ? "var(--secondary-color)" : "var(--surface-2)",
              color: isSendEnabled ? "#fff" : "var(--fg-3)",
              transition: "background var(--dur-fast) var(--ease-out)",
            }}
          >
            <PaperAirplaneIcon style={{ width: 14, height: 14 }} strokeWidth={1.5} />
          </button>
          </div>
        </div>
      </aside>
    </>
  );
}
