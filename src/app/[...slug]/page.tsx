// src/app/[...slug]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useCampaign } from "@/hooks/useCampaign";
import { CampaignLayoutEngine } from "@/components/layout/CampaignLayoutEngine";
import { normalizeCampaignSlug } from "@/helpers/slugNormalizer";
import { useAuthActions } from "@/hooks/useAuthActions";
import { AuthProvider } from "@/hooks/context/AuthContext";
import MiniLoader from "@/components/MiniLoader";

export default function CampaignPage() {
  const params = useParams<{ slug: string[] }>();
  const { slugId } = normalizeCampaignSlug(params.slug);
  const { token } = useAuthActions();

  const { data, isLoading } = useCampaign(slugId);

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
      </div>
    </AuthProvider>
  );
}
