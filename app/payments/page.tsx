"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { PaymentHistory } from "@/components/features/payments/PaymentHistory";
import { cn } from "@/lib/cn";
export default function PaymentsPage() {
  const { user, personalExperience } = useAuth();
  const { sidebarWide, setMobileNavOpen, current } = useMusicPlayer();
  const router = useRouter();
  useEffect(() => {
    if (personalExperience) router.replace("/");
  }, [personalExperience, router]);
  if (personalExperience) return null;
  return (
    <main
      data-playing={current ? "true" : undefined}
      className={cn(
        "customize-page dock-offset",
        !sidebarWide && "dock-offset--rail",
      )}
    >
      <button
        className="customize-mobile-menu"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
      >
        Menu
      </button>
      {user ? (
        <PaymentHistory key={user.id} />
      ) : (
        <section className="payment-history-empty">
          <h1>Payments</h1>
          <p>Sign in to see your own payment history.</p>
          <Link href="/login?next=/payments">Sign in</Link>
        </section>
      )}
    </main>
  );
}
