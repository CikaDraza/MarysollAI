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

export default function CampaignPage() {
  const params = useParams<{ slug: string[] }>();
  const { slugId } = normalizeCampaignSlug(params.slug);
  const { user } = useAuthActions();

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

  if (isLoading || !data) return null;

  return (
    <div className="relative isolate px-6 lg:px-8 pb-44">
      <CampaignLayoutEngine blocks={data?.landingPage?.layout ?? []} />
      <TimelineRenderer
        thread={thread}
        onAction={askAI}
        streamingText={streamingText}
        isStreaming={isStreaming}
      />
      {error && (
        <div className="max-w-2xl mx-auto mb-4 animate-in slide-in-from-bottom-2">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col items-center gap-3">
            <p className="text-sm text-red-800 font-medium text-center">
              MarysollAI Assistant was unable to finish replying.
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
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      <AIAgentPanel
        onSubmit={askAI}
        isLoading={isTextLoading}
        thread={thread}
        clearChat={clearChat}
      />
    </div>
  );
}
