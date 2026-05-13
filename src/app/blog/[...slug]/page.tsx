// app/blog/[...slug]/page.tsx
import CampaignClientShell from "@/components/CampaignClientShell";
import { normalizeCampaignSlug } from "@/helpers/slugNormalizer";
import { getCampaign } from "@/lib/server/getCampaign";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { slugId } = normalizeCampaignSlug(slug);
  const data = await getCampaign(slugId);

  const seo = data?.landingPage?.seo;

  return {
    title: seo?.title ?? "Marysoll Assistant AI",
    description: seo?.description ?? "AI Generation web app",
    keywords: seo?.keywords,
    openGraph: {
      title: seo?.ogTitle ?? seo?.title ?? "Marysoll Assistant AI",
      description: seo?.ogDescription ?? seo?.description ?? "AI Generation web app",
      images: data?.landingPage?.seo?.ogImage
        ? [data.landingPage.seo.ogImage]
        : undefined,
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const { slugId } = normalizeCampaignSlug(slug);

  const [data, cookieStore] = await Promise.all([
    getCampaign(slugId),
    cookies(),
  ]);

  const token = cookieStore.get("token")?.value ?? null;

  if (!data) notFound();

  return <CampaignClientShell initialData={data} token={token} id={slugId} />;
}
