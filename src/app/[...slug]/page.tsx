// src/app/[...slug]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useCampaign } from "@/hooks/useCampaign";
import { AIAgentPanel } from "@/components/AIAgentPanel";
import { CampaignLayoutEngine } from "@/components/layout/CampaignLayoutEngine";
import { normalizeCampaignSlug } from "@/helpers/slugNormalizer";
import { useAIQuery } from "@/hooks/useAIQuery";
import { useAuthActions } from "@/hooks/useAuthActions";
import TimelineRenderer from "@/components/chat/TimelineRenderer";
import { AuthProvider } from "@/hooks/context/AuthContext";
import MiniLoader from "@/components/MiniLoader";

export default function CampaignPage() {
  const params = useParams<{ slug: string[] }>();
  const { slugId } = normalizeCampaignSlug(params.slug);
  const { user, token } = useAuthActions();

  const { data, isLoading } = useCampaign(slugId);
  const {
    askAI,
    thread,
    streamingText,
    isStreaming,
    isTextLoading,
    error,
    resetError,
    clearChat,
  } = useAIQuery(user);

  if (isLoading || !data)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <MiniLoader />
      </div>
    );

  return (
    <AuthProvider token={token || null}>
      <div className="relative isolate px-6 lg:px-8">
        <CampaignLayoutEngine blocks={data?.landingPage?.layout ?? []} />
        <TimelineRenderer
          thread={thread}
          onAction={askAI}
          streamingText={streamingText}
          isStreaming={isStreaming}
          error={error}
          resetError={resetError}
        />

        <AIAgentPanel
          onSubmit={askAI}
          isLoading={isTextLoading}
          thread={thread}
          clearChat={clearChat}
        />
      </div>
    </AuthProvider>
  );
}
