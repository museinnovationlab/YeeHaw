import type { Metadata } from "next";
import NotFoundScreen from "@/components/NotFoundScreen";

export const metadata: Metadata = {
  title: "Issue not found · YeeHaw",
  robots: { index: false },
};

// Shown when a post link is dead — most often an issue that was deleted or
// unpublished after its email already went out.
export default function PostNotFound() {
  return (
    <NotFoundScreen
      title="This tape's not in the rack"
      message="That issue isn't here anymore — it may have been pulled or never made it out of the drafts. The rest of the mixtape collection is still waiting for you."
    />
  );
}
