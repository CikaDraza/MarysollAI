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
import { Reveal } from "@/components/motion/Reveal";
import { useLayoutEffect, useRef } from "react";

export default function CampaignPage() {
  const params = useParams<{ slug: string[] }>();
  const bottomRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, runtimeBlocks]);

  if (error)
    return (
      <div className="bg-transparent py-24 sm:py-44">
        <Reveal>
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <p className="text-center text-lg/8 text-red-600">Error: {error}</p>
          </div>
        </Reveal>
      </div>
    );
  if (isLoading || !data) return null;

  return (
    <div className="relative isolate px-6 lg:px-8 pb-44">
      <CampaignLayoutEngine blocks={data?.landingPage?.layout ?? []} />
      {(!runtimeBlocks || runtimeBlocks.length === 0) && (
        <TextEngine messages={grouped.global ?? []} />
      )}
      {runtimeBlocks && runtimeBlocks.length > 0 && (
        <LayoutEngine
          blocks={runtimeBlocks}
          onMessageAction={askAI}
          renderBeforeBlock={(blockType) => (
            <>
              {/* Global tekst ide SAMO pre prvog bloka */}
              {blockType === runtimeBlocks[0].type && (
                <TextEngine messages={grouped.global ?? []} />
              )}
              <TextEngine messages={grouped[blockType] ?? []} />
            </>
          )}
        />
      )}
      <div ref={bottomRef} />

      <AIAgentPanel
        onSubmit={askAI}
        isLoading={isTextLoading || isLayoutLoading}
      />
    </div>
  );
}
