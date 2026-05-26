import { findEditorialTeaserByBlogPath } from "@/lib/editorial/getEditorialTeasers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const teaser = findEditorialTeaserByBlogPath(`blog/${slugPath}`);

  return {
    title: teaser?.title ?? "Marysoll Booking editorial",
    description:
      teaser?.excerpt ??
      "Marysoll Booking prikazuje samo teaser kartice i preusmerava pune tekstove na kanonske URL-ove.",
    robots: "noindex, follow",
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const teaser = findEditorialTeaserByBlogPath(`blog/${slugPath}`);

  // Booking Discovery must not render duplicate full tenant/platform articles.
  // Known editorial cards go to their canonical URL; unknown legacy slugs fall
  // back to the teaser index. Existing platform /newsletter/[slug] routes should
  // remain untouched until they can be migrated to /blog/[slug] intentionally.
  if (teaser) {
    redirect(teaser.href);
  }

  redirect("/blog");
}
