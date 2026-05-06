"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import {
  XMarkIcon,
  CheckIcon,
  PaperAirplaneIcon,
  BoltIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { ThreadItem } from "@/types/ai/chat-thread";
import { ChatSession } from "@/types/ai/deepseek";
import { BaseBlock } from "@/types/landing-block";
import { HistoryDropdown } from "@/components/chat/HistoryDropdown";
import { UsageStats } from "@/components/chat/UsageStats";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useAIContext } from "@/context/landing/AIContext";

type Agent = "maria" | "claudia";

const AGENT_INFO: Record<Agent, { name: string; avatar: string }> = {
  maria: { name: "Maria Deep", avatar: "/avatars/maria.png" },
  claudia: {
    name: "Claudia Makelele",
    avatar: "/avatars/claudia-makelele.png",
  },
};

const detectAgent = (id: string): Agent =>
  id.startsWith("maria-") ? "maria" : "claudia";

type DisplayItem =
  | { kind: "msg"; id: string; from: "me"; text: string }
  | {
      kind: "msg";
      id: string;
      from: Agent;
      text: string;
      suggest?: boolean;
      showLabel?: boolean;
    }
  | { kind: "block"; id: string; block: BaseBlock }
  | { kind: "handoff"; id: string; toAgent: Agent };

type Message = { from: "maria" | "me"; text: string; kind?: "suggest" };

const INITIAL: Message[] = [
  {
    from: "maria",
    text: "Zdravo! Ja sam Maria. Mogu da pronađem slobodan termin, popunim formu ili da te prijavim. Šta želiš?",
  },
];

const CHIPS = [
  { label: "Najbliži salon", value: "Koji je meni najbliži salon?" },
  { label: "Moji termini", value: "Šta sam zakazala?" },
  { label: "Cenovnik", value: "Mogu da pogle dam cenovnik?" },
  { label: "Otkaži termin", value: "Otkaži termin sutra" },
  { label: "Kako zakazati termin", value: "Kako da zakažem termin?" },
];

export default function AIDrawer() {
  const { drawerOpen: open, setDrawerOpen } = useLandingUI();
  const {
    unifiedThread: aiThread,
    sendMessage: onAsk,
    clearChat: onClearChat,
    streamingText,
    isStreaming,
    streamingAgent,
  } = useAIContext();

  const onClose = () => setDrawerOpen(false);
  const streamingInfo = AGENT_INFO[streamingAgent];
  // Keep SSR and initial client render in sync (always "maria") to avoid hydration mismatch.
  // useEffect updates the displayed agent after mount when thread state is available.
  const [activeAgent, setActiveAgent] = useState<Agent>("maria");
  useEffect(() => {
    if (isStreaming) {
      setActiveAgent(streamingAgent);
      return;
    }
    if (!aiThread) {
      setActiveAgent("maria");
      return;
    }
    for (let i = aiThread.length - 1; i >= 0; i--) {
      const it = aiThread[i];
      if (it.type === "block") {
        setActiveAgent("claudia");
        return;
      }
      if (it.type === "message" && it.data.role !== "user") {
        setActiveAgent(detectAgent(it.id));
        return;
      }
    }
    setActiveAgent("maria");
  }, [aiThread, isStreaming, streamingAgent]);
  const activeInfo = AGENT_INFO[activeAgent];
  const [localThread, setLocalThread] = useState<Message[]>(INITIAL);
  const [input, setInput] = useState("");
  const [showStats, setShowStats] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [syntheticSessions, setSyntheticSessions] = useState<ChatSession[]>([]);
  const [usage, setUsage] = useState({ messagesSent: 0, estimatedTokens: 0 });
  useEffect(() => {
    if (!aiThread || aiThread.length === 0) {
      setSyntheticSessions([]);
      return;
    }
    const msgItems = aiThread.filter(
      (i): i is Extract<ThreadItem, { type: "message" }> =>
        i.type === "message",
    );
    if (msgItems.length === 0) {
      setSyntheticSessions([]);
      return;
    }
    const firstUser = msgItems.find((i) => i.data.role === "user");
    setSyntheticSessions([
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
    ]);
    const messagesSent = msgItems.filter((i) => i.data.role === "user").length;
    const estimatedTokens = msgItems.reduce(
      (acc, i) => acc + Math.ceil(i.data.content.length / 4),
      0,
    );
    setUsage({ messagesSent, estimatedTokens });
  }, [aiThread]);

  const [displayItems, setDisplayItems] = useState<DisplayItem[]>(() =>
    INITIAL.map((m, i) => ({
      kind: "msg" as const,
      id: `init-${i}`,
      from: "maria" as const,
      text: m.text,
    })),
  );
  useEffect(() => {
    if (!aiThread) {
      setDisplayItems(
        localThread.map((m, i) => ({
          kind: "msg" as const,
          id: `local-${i}`,
          from: m.from === "me" ? ("me" as const) : ("maria" as const),
          text: m.text,
          suggest: m.kind === "suggest",
        })),
      );
      return;
    }
    if (aiThread.length === 0) {
      setDisplayItems(
        INITIAL.map((m, i) => ({
          kind: "msg" as const,
          id: `init-${i}`,
          from: "maria" as const,
          text: m.text,
        })),
      );
      return;
    }
    const out: DisplayItem[] = [];
    let prevAgent: Agent | null = null;
    let lastAgentForLabel: Agent | null = null;
    for (const item of aiThread) {
      if (item.type === "message") {
        if (item.data.role === "user") {
          if (item.data.content) {
            out.push({
              kind: "msg",
              id: item.id,
              from: "me",
              text: item.data.content,
            });
          }
          prevAgent = null;
          lastAgentForLabel = null;
        } else {
          const agent = detectAgent(item.id);
          if (prevAgent && prevAgent !== agent) {
            out.push({
              kind: "handoff",
              id: `handoff-${item.id}`,
              toAgent: agent,
            });
          }
          const showLabel = agent !== lastAgentForLabel;
          out.push({
            kind: "msg",
            id: item.id,
            from: agent,
            text: item.data.content,
            showLabel,
          });
          prevAgent = agent;
          lastAgentForLabel = agent;
        }
      } else {
        out.push({ kind: "block", id: item.id, block: item.data });
        lastAgentForLabel = "claudia";
      }
    }
    setDisplayItems(out);
  }, [aiThread, localThread]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [displayItems, streamingText, isStreaming]);

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
      <aside
        className={`
      fixed right-0 top-0 bottom-0 z-[70] flex flex-col
      ${open ? "translate-x-0" : "translate-x-full"}
      transition-transform duration-280 ease-out
      border-l border-[var(--border-1)]
      shadow-lg
      ai-drawer-aside
      lg:w-[500px] w-full
    `}
        aria-hidden={!open}
        aria-label="AI asistent"
        style={{ background: "var(--surface)" }}
      >
        {/* Header */}
        <header
          className="flex items-center gap-2.5 px-4 py-4 border-b border-[var(--border-1)] flex-shrink-0"
          style={{
            background:
              "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
          }}
        >
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
              <Image
                src={activeInfo.avatar}
                alt={activeInfo.name}
                width={36}
                height={36}
                className="object-cover"
              />
            </div>
            <div>
              <div className="font-bold text-sm text-[var(--fg-1)] transition-colors duration-200">
                {activeInfo.name}
              </div>
              <div
                className="font-medium text-xs transition-colors duration-200"
                style={{
                  color: isStreaming
                    ? "var(--secondary-color)"
                    : "var(--success)",
                }}
              >
                {activeAgent === "claudia"
                  ? "Specijalista za zakazivanje"
                  : "AI asistent"}
                {" · "}
                {isStreaming ? "kuca..." : "online"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <HistoryDropdown
              sessions={syntheticSessions}
              currentSessionId={
                syntheticSessions.length > 0 ? "landing-session" : null
              }
              onSelectSession={() => {}}
              onDeleteSession={() => onClearChat?.()}
              onNewChat={() => onClearChat?.()}
            />
            <button
              onClick={onClose}
              aria-label="Zatvori"
              className="w-[38px] h-[38px] rounded-full border-none bg-[var(--surface-2)] text-[var(--fg-2)] cursor-pointer inline-flex items-center justify-center hover:bg-[var(--brand-100)] transition-colors"
            >
              <XMarkIcon className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Chat body */}
        <div
          ref={bodyRef}
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-custom"
        >
          {displayItems.map((item) => {
            if (item.kind === "block") return null;

            if (item.kind === "handoff") {
              const info = AGENT_INFO[item.toAgent];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 my-1 text-[var(--fg-3)] font-semibold text-xs uppercase tracking-wide"
                >
                  <div className="flex-1 h-px bg-[var(--border-1)]" />
                  <SparklesIcon className="w-3 h-3 text-[var(--secondary-color)]" />
                  <span>Prebačeno na {info.name}</span>
                  <div className="flex-1 h-px bg-[var(--border-1)]" />
                </div>
              );
            }
            if (item.from === "me") {
              return (
                <div key={item.id} className="max-w-[85%] self-end">
                  <div
                    className="text-white text-sm font-normal leading-relaxed whitespace-pre-wrap px-3.5 py-2.5"
                    style={{
                      background: "var(--secondary-color)",
                      borderRadius: "16px 16px 4px 16px",
                    }}
                  >
                    {item.text}
                  </div>
                </div>
              );
            }
            const info = AGENT_INFO[item.from];
            return (
              <div
                key={item.id}
                className="flex flex-col gap-1 max-w-[85%] self-start"
              >
                {item.showLabel && (
                  <div
                    className="font-bold text-xs pl-9"
                    style={{
                      color:
                        item.from === "claudia"
                          ? "var(--secondary-color)"
                          : "var(--fg-3)",
                    }}
                  >
                    {info.name}
                  </div>
                )}
                <div className="flex gap-2">
                  <div
                    className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0"
                    style={{
                      border:
                        item.from === "claudia"
                          ? "2px solid var(--secondary-color)"
                          : "none",
                    }}
                  >
                    <Image
                      src={info.avatar}
                      alt=""
                      width={28}
                      height={28}
                      className="object-cover"
                    />
                  </div>
                  <div
                    className="text-sm font-normal leading-relaxed text-[var(--fg-1)] whitespace-pre-wrap px-3.5 py-2.5 bg-[var(--surface-2)]"
                    style={{ borderRadius: "16px 16px 16px 4px" }}
                  >
                    {item.text}
                    {item.suggest && (
                      <button className="flex items-center gap-1.5 mt-2 border-none cursor-pointer font-bold text-xs px-3.5 py-2 rounded-[10px] bg-[var(--secondary-color)] text-white">
                        <CheckIcon className="w-3.5 h-3.5" strokeWidth={2} />
                        Potvrdi termin
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Streaming text bubble */}
          {isStreaming && streamingText && (
            <div className="flex gap-2 max-w-[85%] self-start">
              <div
                className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0"
                style={{
                  border:
                    streamingAgent === "claudia"
                      ? "2px solid var(--secondary-color)"
                      : "none",
                }}
              >
                <Image
                  src={streamingInfo.avatar}
                  alt=""
                  width={28}
                  height={28}
                  className="object-cover"
                />
              </div>
              <div
                className="text-sm font-normal leading-relaxed text-[var(--fg-1)] px-3.5 py-2.5 bg-[var(--surface-2)]"
                style={{ borderRadius: "16px 16px 16px 4px" }}
              >
                {streamingText}
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-[var(--secondary-color)] align-middle rounded-sm animate-maria-bounce" />
              </div>
            </div>
          )}

          {/* Typing dots */}
          {isStreaming && !streamingText && (
            <div className="flex gap-2 max-w-[85%] self-start">
              <div
                className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0"
                style={{
                  border:
                    streamingAgent === "claudia"
                      ? "2px solid var(--secondary-color)"
                      : "none",
                }}
              >
                <Image
                  src={streamingInfo.avatar}
                  alt=""
                  width={28}
                  height={28}
                  className="object-cover"
                />
              </div>
              <div
                className="flex gap-1.5 items-center px-4 py-3.5 bg-[var(--surface-2)]"
                style={{ borderRadius: "16px 16px 16px 4px" }}
              >
                <span className="w-[7px] h-[7px] rounded-full bg-[var(--secondary-color)] inline-block animate-maria-bounce-1" />
                <span className="w-[7px] h-[7px] rounded-full bg-[var(--secondary-color)] inline-block animate-maria-bounce-2" />
                <span className="w-[7px] h-[7px] rounded-full bg-[var(--secondary-color)] inline-block animate-maria-bounce-3" />
              </div>
            </div>
          )}
        </div>

        {/* Quick-action chips */}
        <div className="flex gap-1.5 py-2 px-4 flex-wrap flex-shrink-0">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              onClick={() => setInput(c.value)}
              className="bg-[var(--surface-2)] text-[var(--secondary-color)] border border-[var(--brand-100)] rounded-full px-3 py-1.5 font-semibold text-xs cursor-pointer hover:bg-[var(--brand-100)] transition-colors"
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="px-3 pb-3 border-t border-[var(--border-1)] flex-shrink-0 relative">
          <UsageStats isOpen={showStats} usage={usage} />
          <div className="flex items-end gap-2 pt-3">
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
              className="flex-1 resize-none border-none bg-[var(--surface-2)] rounded-[14px] px-3.5 py-3 font-normal text-sm text-[var(--fg-1)] outline-none focus:outline-2 focus:outline-[var(--secondary-color)] focus:bg-[var(--surface)] transition-colors"
            />
            <button
              onClick={() => setShowStats((s) => !s)}
              aria-label="Statistika korišćenja"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border-none cursor-pointer flex-shrink-0 transition-colors duration-150"
              style={{
                background: showStats ? "var(--brand-100)" : "var(--surface-2)",
                color: showStats ? "var(--secondary-color)" : "var(--fg-2)",
              }}
            >
              <BoltIcon className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={send}
              disabled={!isSendEnabled}
              className="inline-flex items-center justify-center border-none font-bold text-xs px-3.5 py-2 rounded-[10px] transition-colors"
              style={{
                cursor: isSendEnabled ? "pointer" : "default",
                background: isSendEnabled
                  ? "var(--secondary-color)"
                  : "var(--surface-2)",
                color: isSendEnabled ? "#fff" : "var(--fg-3)",
              }}
            >
              <PaperAirplaneIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
