// Canonical site origin for absolute SEO URLs (sitemap, canonical, OG).
// Mirrors NEXT_PUBLIC_SITE_URL from .env, with a production fallback.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://booking.marysoll.com";
