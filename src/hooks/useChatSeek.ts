// hooks/useChatSeek.ts
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  chatEvents,
  isAgentCompleteEvent,
  isAgentResponseEvent,
} from "@/lib/ai/events/chatEvents";
import {
  AgentCallMetadata,
  AgentCallEvent,
  AgentType,
} from "@/types/ai/deepseek/agent-call";
import {
  StoredSession,
  StoredMessage,
  Message,
  ChatSession,
} from "@/types/ai/deepseek";
import { UsageStats } from "@/types/ai/deepseek/usage";
import { DeepSeekChunk, DeepSeekError } from "@/types/ai/deepseek/api";

interface UseChatWithAIOptions {
  sessionId?: string;
  onError?: (error: Error) => void;
  onSuccess?: (message: Message, usage?: UsageStats) => void;
}

interface MutationResult {
  message: Message;
  usage: UsageStats;
  agentCall: AgentCallMetadata | null;
}

interface UseChatWithAIReturn {
  // Stanje
  messages: Message[];
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoading: boolean;
  isSending: boolean;
  error: Error | null;
  isStreaming: boolean;
  isEmpty: boolean;
  usage: UsageStats | null;
  showUsage: boolean;
  setShowUsage: (show: boolean) => void;

  // Akcije
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  retryLastMessage: () => Promise<void>;
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  getSessionTitle: (messages: Message[]) => string;
  createNewChat: () => void;
}

const CHAT_SESSIONS_KEY = "chat_sessions";
const MAX_SESSIONS = 10;

export function useChatSeek(
  options: UseChatWithAIOptions = {},
): UseChatWithAIReturn {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(CHAT_SESSIONS_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as StoredSession[];
          return parsed.map(
            (session: StoredSession): ChatSession => ({
              ...session,
              createdAt: new Date(session.createdAt),
              updatedAt: new Date(session.updatedAt),
              messages: session.messages.map(
                (message: StoredMessage): Message => ({
                  ...message,
                  createdAt: new Date(message.createdAt),
                }),
              ),
            }),
          );
        } catch (error) {
          console.error("Failed to parse sessions:", error);
        }
      }
    }
    return [];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    options.sessionId || null,
  );
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const currentSession = currentSessionId
    ? sessions.find(
        (session: ChatSession) => session.id === currentSessionId,
      ) || null
    : sessions[0] || null;

  const messages = useMemo(
    () => currentSession?.messages || [],
    [currentSession],
  );

  // Čuvaj sesije u localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  // Generiši naslov iz poruka
  const getSessionTitle = useCallback((messages: Message[]): string => {
    if (messages.length === 0) return "Nova konverzacija";
    const firstUserMessage = messages.find(
      (message: Message) => message.role === "user",
    );
    if (!firstUserMessage) return "Nova konverzacija";
    return (
      firstUserMessage.content.slice(0, 50) +
      (firstUserMessage.content.length > 50 ? "..." : "")
    );
  }, []);

  const generateId = () => {
    if (typeof window !== "undefined") {
      return crypto.randomUUID();
    }
    return `server-${Math.random().toString(36).substring(7)}`;
  };

  // Kreiraj novu sesiju
  const createNewSession = useCallback((): ChatSession => {
    const newSession: ChatSession = {
      id: generateId(),
      title: "Nova konverzacija",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setSessions((prev: ChatSession[]) => {
      const updated = [newSession, ...prev].slice(0, MAX_SESSIONS);
      return updated;
    });

    setCurrentSessionId(newSession.id);
    return newSession;
  }, []);

  // Ažuriraj sesiju
  const updateSession = useCallback(
    (sessionId: string, updates: Partial<ChatSession>): void => {
      setSessions((prev: ChatSession[]) =>
        prev.map((session: ChatSession) =>
          session.id === sessionId
            ? { ...session, ...updates, updatedAt: new Date() }
            : session,
        ),
      );
    },
    [],
  );

  // Učitaj sesiju
  const loadSession = useCallback((sessionId: string): void => {
    setCurrentSessionId(sessionId);
    setUsage(null);
    setStreamingContent("");
  }, []);

  // Obriši sesiju
  const deleteSession = useCallback(
    (sessionId: string): void => {
      setSessions((prev: ChatSession[]) => {
        const filtered = prev.filter(
          (session: ChatSession) => session.id !== sessionId,
        );
        if (currentSessionId === sessionId) {
          const nextSession = filtered[0] || null;
          setCurrentSessionId(nextSession?.id || null);
        }
        return filtered;
      });
    },
    [currentSessionId],
  );

  const getAgentTypeName = useCallback((type: AgentType | string): string => {
    const names: Record<AgentType, string> = {
      booking: "zakazivanje",
      auth: "prijavu/registraciju",
      prices: "cenovnik",
      appointments: "pregled termina",
      testimonials: "utiske",
    };
    return names[type as AgentType] || type;
  }, []);

  // Slanje poruke sa streaming-om
  const sendMessageMutation = useMutation({
    mutationFn: async (newMessage: string): Promise<MutationResult> => {
      // Prekini prethodni zahtev
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Kreiraj ili koristi postojeću sesiju
        let session = currentSession;
        if (!session) {
          session = createNewSession();
        }

        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: "user",
          content: newMessage,
          createdAt: new Date(),
        };

        // Optimistički update
        const updatedMessages = [...session.messages, userMessage];
        updateSession(session.id, {
          messages: updatedMessages,
          title: getSessionTitle(updatedMessages),
        });

        setStreamingContent("");

        const response = await fetch("/api/ai/deepseek-conversation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: updatedMessages.map(({ role, content }: Message) => ({
              role,
              content,
            })),
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData: DeepSeekError = await response.json();
          throw new Error(errorData.error?.message || "Failed to send message");
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        let usageData: UsageStats | null = null;
        let agentCallData: AgentCallMetadata | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data) as DeepSeekChunk;

                // Ako imamo usage podatke
                if (parsed.usage) {
                  usageData = {
                    inputTokens: parsed.usage.prompt_tokens || 0,
                    outputTokens: parsed.usage.completion_tokens || 0,
                    totalTokens: parsed.usage.total_tokens || 0,
                    modelVersion: parsed.model,
                    completionTokensDetails: parsed.usage
                      .completion_tokens_details
                      ? {
                          reasoningTokens:
                            parsed.usage.completion_tokens_details
                              .reasoning_tokens,
                        }
                      : undefined,
                  };
                  setUsage(usageData);
                }

                // Ako imamo content
                if (parsed.choices?.[0]?.delta?.content) {
                  assistantContent += parsed.choices[0].delta.content;
                  setStreamingContent(assistantContent);
                }
              } catch (error) {
                console.error("Failed to parse chunk:", error);
              }
            }
          }
        }

        // Nakon što je streaming završen, proveri da li postoji agent call marker
        const agentCallMatch = assistantContent.match(/\[CALL_AGENT:(\w+)\]/);

        if (agentCallMatch) {
          // Ukloni marker iz poruke
          const cleanContent = assistantContent
            .replace(/\[CALL_AGENT:\w+\]/, "")
            .trim();

          assistantContent = cleanContent;

          agentCallData = {
            type: agentCallMatch[1] as AgentType,
            originalMessage: cleanContent,
            userIntent: agentCallMatch[1],
            timestamp: Date.now(),
          };
        }

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantContent,
          createdAt: new Date(),
        };

        return {
          message: assistantMessage,
          usage: usageData || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
          agentCall: agentCallData,
        };
      } finally {
        abortControllerRef.current = null;
        setStreamingContent("");
      }
    },
    onSuccess: ({ message, usage, agentCall }: MutationResult) => {
      if (currentSession) {
        const updatedMessages = [...currentSession.messages, message];
        updateSession(currentSession.id, {
          messages: updatedMessages,
          title: getSessionTitle(updatedMessages),
        });
      }

      if (agentCall) {
        // Emituj CALL_AGENT event
        const callEvent: AgentCallEvent = {
          type: "CALL_AGENT",
          payload: {
            agentType: agentCall.type,
            userMessage: agentCall.originalMessage,
            history: messages.map(({ id, role, content, createdAt }) => ({
              id,
              role,
              content,
              createdAt,
            })),
            sessionId: currentSession?.id,
          },
          timestamp: Date.now(),
        };

        chatEvents.emit(callEvent);

        if (agentCall.type === "booking" || agentCall.type === "auth") {
          setTimeout(() => {
            if (currentSession) {
              const systemMessage: Message = {
                id: crypto.randomUUID(),
                role: "system",
                content: `Prebacujem te na specijalizovanog asistenta za ${getAgentTypeName(agentCall.type)}. Pogledaj dole na dnu stranice.`,
                createdAt: new Date(),
              };

              updateSession(currentSession.id, {
                messages: [...currentSession.messages, systemMessage],
              });
            }
          }, 100);
        }
      }

      options.onSuccess?.(message, usage);
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: (error: Error) => {
      // Ukloni poslednju korisničku poruku ako je došlo do greške
      if (currentSession) {
        const messagesWithoutLast = currentSession.messages.slice(0, -1);
        updateSession(currentSession.id, { messages: messagesWithoutLast });
      }
      options.onError?.(
        error instanceof Error ? error : new Error("Unknown error"),
      );
    },
  });

  useEffect(() => {
    const unsubscribeResponse = chatEvents.subscribe(
      "AGENT_RESPONSE",
      (event) => {
        if (!isAgentResponseEvent(event)) return;
        if (currentSession && event.payload) {
          // Gemini agent je preuzeo - dodajemo poruku da je preuzimanje uspešno
          const handoffMessage: Message = {
            id: crypto.randomUUID(),
            role: "system",
            content: `✅ Specijalizovani asistent je preuzeo tvoj zahtev za ${getAgentTypeName(event.payload.agentType)}. 
                   \nNastavi razgovor u donjem chatu gde će ti pomoći sa konkretnim akcijama.`,
            createdAt: new Date(),
          };

          updateSession(currentSession.id, {
            messages: [...currentSession.messages, handoffMessage],
          });

          // Dodajemo prvu poruku od Gemini agenta
          if (event.payload.content) {
            const agentNotification: Message = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `✨ ${event.payload.content}`,
              createdAt: new Date(),
            };

            updateSession(currentSession.id, {
              messages: [...currentSession.messages, agentNotification],
            });
          }
        }
      },
    );

    const unsubscribeComplete = chatEvents.subscribe(
      "AGENT_COMPLETE",
      (event) => {
        if (!isAgentCompleteEvent(event)) return;
        if (currentSession) {
          const completeMessage: Message = {
            id: crypto.randomUUID(),
            role: "system",
            content: `✅ Specijalizovani asistent je završio obradu tvog zahteva. 
                   \n${event.payload.summary || "Uspešno smo obavili traženu akciju."}`,
            createdAt: new Date(),
          };

          updateSession(currentSession.id, {
            messages: [...currentSession.messages, completeMessage],
          });

          // Ako je akcija uspešno završena, dodajemo čestitku
          if (event.payload.success) {
            const successMessage: Message = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "🎉 Super! Ako ti treba još nešto, tu sam da pomognem.",
              createdAt: new Date(),
            };

            setTimeout(() => {
              if (currentSession) {
                updateSession(currentSession.id, {
                  messages: [...currentSession.messages, successMessage],
                });
              }
            }, 1000);
          }
        }
      },
    );

    return () => {
      unsubscribeResponse();
      unsubscribeComplete();
    };
  }, [currentSession, updateSession, getAgentTypeName]);

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      if (!content.trim() || sendMessageMutation.isPending) return;
      await sendMessageMutation.mutateAsync(content);
    },
    [sendMessageMutation],
  );

  const clearChat = useCallback((): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (currentSession) {
      updateSession(currentSession.id, { messages: [] });
    }
    setUsage(null);
    setStreamingContent("");
  }, [currentSession, updateSession]);

  const retryLastMessage = useCallback(async (): Promise<void> => {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message: Message) => message.role === "user");

    if (lastUserMessage && currentSession) {
      // Ukloni poslednju asistent poruku ako postoji
      if (messages[messages.length - 1]?.role === "assistant") {
        updateSession(currentSession.id, {
          messages: messages.slice(0, -1),
        });
      }
      await sendMessage(lastUserMessage.content);
    }
  }, [messages, currentSession, updateSession, sendMessage]);

  const createNewChat = useCallback((): void => {
    // Prekini tekući stream ako postoji
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Kreiraj novu sesiju (već imaš createNewSession)
    const newSession = createNewSession();

    // Postavi je kao trenutnu
    setCurrentSessionId(newSession.id);

    // Očisti usage i streaming
    setUsage(null);
    setStreamingContent("");
  }, [createNewSession]);

  // Cleanup na unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const isStreaming = streamingContent.length > 0;

  return {
    messages: isStreaming
      ? [
          ...messages,
          {
            id: "streaming",
            role: "assistant",
            content: streamingContent,
            createdAt: new Date(),
          },
        ]
      : messages,
    sessions,
    currentSession,
    isLoading: false,
    isSending: sendMessageMutation.isPending,
    error: sendMessageMutation.error,
    isStreaming,
    isEmpty: messages.length === 0,
    usage,
    showUsage,
    setShowUsage,
    sendMessage,
    clearChat,
    retryLastMessage,
    loadSession,
    deleteSession,
    getSessionTitle,
    createNewChat,
  };
}
