// src/app/[...slug]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useCampaign } from "@/hooks/useCampaign";
import { AIAgentPanel } from "@/components/AIAgentPanel";
import { CampaignLayoutEngine } from "@/components/layout/CampaignLayoutEngine";
import { normalizeCampaignSlug } from "@/helpers/slugNormalizer";
import { TextEngine } from "@/components/layout/TextEngine";
import { LayoutEngine } from "@/components/layout/LayoutEngine";
import { groupMessagesByBlock } from "@/helpers/groupTextMessages";
import { useAIQuery } from "@/hooks/useAIQuery";

export default function CampaignPage() {
  const params = useParams<{ slug: string[] }>();

  const { slugId } = normalizeCampaignSlug(params.slug);

  const { data, isLoading } = useCampaign(slugId);
  const {
    askAI,
    messages,
    runtimeBlocks,
    isTextLoading,
    isLayoutLoading,
    error,
  } = useAIQuery();

  const grouped = groupMessagesByBlock(messages);

  if (error) return <p>Error</p>;
  if (isLoading || !data) return null;
  console.log(messages, runtimeBlocks);

  return (
    <div className="relative isolate px-6 lg:px-8 pb-44">
      <CampaignLayoutEngine blocks={data?.landingPage?.layout ?? []} />
      <TextEngine messages={grouped.global ?? []} />
      <LayoutEngine
        blocks={runtimeBlocks}
        renderBeforeBlock={(blockType) => (
          <TextEngine messages={grouped[blockType] ?? []} />
        )}
      />
      <AIAgentPanel
        onSubmit={askAI}
        isLoading={isTextLoading || isLayoutLoading}
      />
    </div>
  );
}
