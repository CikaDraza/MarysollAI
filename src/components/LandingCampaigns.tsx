"use client";
import { useLandingCampaigns } from "@/hooks/useLandingCampaigns";
import Link from "next/link";

export default function LandingCampaigns() {
  const { data: campaigns, isLoading } = useLandingCampaigns();

  if (isLoading || !campaigns) return null;

  return (
    <div id="blog" className="mx-auto max-w-7xl px-6 lg:px-8 pb-44">
      <div className="mx-auto max-w-2xl lg:mx-0">
        <h2 className="text-4xl font-semibold tracking-tight text-pretty text-gray-900 sm:text-5xl">
          From the Blog & Newsletter
        </h2>
        <p className="mt-2 text-lg/8 text-gray-600">
          Content you can explore with Marysoll help. Your AI assistant.
        </p>
      </div>
      <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-16 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <article
            key={campaign._id}
            className="flex max-w-xl flex-col items-start justify-between"
          >
            <div className="flex items-center gap-x-4 text-xs">
              <time dateTime={campaign.updatedAt} className="text-gray-500">
                {campaign.updatedAt}
              </time>
              <span className="relative z-10 rounded-full bg-gray-50 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100">
                {campaign?.landingPage!.semanticType}
              </span>
            </div>
            <div className="group relative grow">
              <h3 className="mt-3 text-lg/6 font-semibold text-gray-900 group-hover:text-gray-600">
                <Link href={`${campaign.landingPage!.slug}`}>
                  <span className="absolute inset-0" />
                  {campaign.name}
                </Link>
              </h3>
              <p className="mt-5 line-clamp-3 text-sm/6 text-gray-600">
                {campaign.subject}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
