import type { Metadata } from "next";
import NotFoundScreen from "@/components/NotFoundScreen";

export const metadata: Metadata = {
  title: "Page not found · YeeHaw",
  robots: { index: false },
};

// Site-wide catch-all: typos, and old inbound links from the Squarespace era.
export default function NotFound() {
  return (
    <NotFoundScreen
      title="Be kind, rewind"
      message="We couldn't find that page. Tracking's a little fuzzy — try the archive or head back to the front page."
    />
  );
}
