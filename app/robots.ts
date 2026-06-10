import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Allow everyone — including AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.)
// which fall under "*". Only the admin panel and API are kept out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/admin/", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
