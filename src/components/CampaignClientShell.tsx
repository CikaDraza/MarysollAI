"use client";

import { AuthProvider } from "@/hooks/context/AuthContext";
import { useCampaign } from "@/hooks/useCampaign";
import { CampaignLayoutEngine } from "@/components/layout/CampaignLayoutEngine";
import MiniLoader from "@/components/MiniLoader";
import { Campaign } from "@/types";

export default function CampaignClientShell({
  initialData,
  token,
  id,
}: {
  initialData: Campaign;
  token: string | null;
  id: string;
}) {
  return (
    <AuthProvider token={token}>
      <Inner id={id} initialData={initialData} />
    </AuthProvider>
  );
}

function Inner({ id, initialData }: { id: string; initialData: Campaign }) {
  const { data, isLoading } = useCampaign(id, initialData);

  if (isLoading || !data)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <MiniLoader />
      </div>
    );

  return (
    <div className="relative isolate px-6 lg:px-8">
      <CampaignLayoutEngine blocks={data.landingPage?.layout || []} />
    </div>
  );
}
