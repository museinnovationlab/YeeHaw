import SubscribersManager from "@/components/admin/SubscribersManager";
import { getAllSubscribers, getSubscriberCounts } from "@/lib/repo/subscribers";

export const dynamic = "force-dynamic";

export default async function SubscribersPage() {
  const [subscribers, counts] = await Promise.all([
    getAllSubscribers(),
    getSubscriberCounts(),
  ]);

  return (
    <div>
      <h1 className="font-heading mb-1 text-2xl text-ink">Subscribers</h1>
      <p className="font-mono mb-6 text-sm text-ink/50">
        {counts.subscribed} subscribed · {counts.unsubscribed} unsubscribed · {counts.total} total
      </p>
      <SubscribersManager subscribers={subscribers} counts={counts} />
    </div>
  );
}
