import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import UnsubscribeConfirm from "@/components/UnsubscribeConfirm";
import { verifyUnsub } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe · YeeHaw", robots: { index: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e = "", t = "" } = await searchParams;
  const email = e.trim().toLowerCase();
  const valid = verifyUnsub(email, t);

  return (
    <div className="overflow-x-clip">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-20">
        <h1 className="font-heading mb-6 text-3xl text-ink">Unsubscribe</h1>
        {valid ? (
          <UnsubscribeConfirm email={email} token={t} />
        ) : (
          <p className="font-mono text-ink/60">
            This unsubscribe link is invalid or expired. If you keep getting YeeHaw and didn&apos;t
            mean to, reply to any email and we&apos;ll sort it out.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
