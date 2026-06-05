import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Block crawling of faceted/filter variants (?after=, ?date=, ?resumeWatch=…).
      // The base path stays indexable; filtered states are noindex + canonical anyway.
      disallow: ["/*?"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
