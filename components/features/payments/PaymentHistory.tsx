"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { durationLabel } from "@/lib/customization";
import { formatPaymentAmount } from "@/lib/razorpay";
import {
  PAYMENT_LABELS,
  type PaymentHistory as History,
} from "@/lib/payment-history";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function PaymentHistory() {
  const [page, setPage] = useState(1),
    [version, setVersion] = useState(0);
  const [data, setData] = useState<History | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const checkLock = useRef(false);
  async function checkPayment(id: string) {
    if (checkLock.current) return;
    checkLock.current = true;
    setChecking(id);
    setNotice("");
    try {
      const result = await apiFetch<{ fulfilled: boolean }>(
        "/api/customization/payments/check",
        {
          method: "POST",
          body: { purchaseId: id },
        },
      );
      setNotice(
        result.fulfilled
          ? "Payment confirmed. Your history is updated."
          : "No completed payment yet. If money was debited, wait and check again before paying.",
      );
      setVersion((value) => value + 1);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not check payment. Please try again.",
      );
    } finally {
      checkLock.current = false;
      setChecking(null);
    }
  }
  useEffect(() => {
    let active = true,
      request = 0;
    async function load() {
      const revision = ++request;
      setLoading(true);
      setError(null);
      try {
        const next = await apiFetch<History>(
          `/api/customization/payments/history?page=${page}&limit=10`,
        );
        if (active && revision === request) setData(next);
      } catch (e) {
        if (active && revision === request)
          setError(
            e instanceof Error ? e.message : "Could not load your payments.",
          );
      } finally {
        if (active && revision === request) setLoading(false);
      }
    }
    queueMicrotask(() => {
      if (active) void load();
    });
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [page, version]);
  return (
    <section aria-labelledby="payments-title" className="payment-history">
      <header className="customize-console-header">
        <div>
          <p className="customize-eyebrow">YOUR ACCOUNT</p>
          <h1 id="payments-title">Payments</h1>
          <p>Your payment history, and what every payment was for.</p>
        </div>
        <Link href="/" className="customize-back">
          <Icon name="music" />
          <span>Back to music</span>
        </Link>
      </header>
      <nav
        className="customize-navigation"
        aria-label="Account payment navigation"
      >
        <Link href="/payments" aria-current="page">
          Payments
        </Link>
        <Link href="/customize">Customize</Link>
        <Link href="/support">Buy A Mug</Link>
      </nav>
      {notice ? (
        <p role="status" className="customize-notice">
          {notice}
        </p>
      ) : null}
      <div className="payment-history-toolbar">
        <p>
          {data
            ? `${data.total} checkout${data.total === 1 ? "" : "s"}`
            : "Your checkouts"}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => setVersion((v) => v + 1)}
        >
          <Icon name="refresh" className="size-4" />
          Refresh
        </Button>
      </div>
      <p className="payment-history-note">
        Only your own payments appear here. Pending and failed checkout attempts
        are included; they are not confirmed payments.
      </p>
      {error ? (
        <div role="alert" className="customize-notice">
          {error}{" "}
          <button onClick={() => setVersion((v) => v + 1)}>Try again</button>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="payment-history-empty">
          Loading payment history…
        </p>
      ) : !error && !data?.items.length ? (
        <div className="payment-history-empty">
          <Icon name="list" className="mx-auto mb-3 size-7" />
          <h2>No payments yet</h2>
          <p>
            Your support contributions and past purchases appear here with the
            amount, status, and reason.
          </p>
          <Link href="/customize">Explore Customize</Link>
        </div>
      ) : null}
      {!loading && !error && data?.items.length ? (
        <div className="payment-history-list">
          {data.items.map((p) => {
            const status = PAYMENT_LABELS[p.paymentStatus] ?? {
              label: "Awaiting confirmation",
              tone: "pending",
            };
            const donation = p.purpose === "donation";
            const gift = p.purpose === "customization_gift";
            const recipient = gift
              ? p.recipient?.name || "another listener"
              : "you";
            return (
              <article key={p.id} className="payment-history-card">
                <div className="payment-history-card-top">
                  <div>
                    <span className="payment-history-kind">
                      {donation
                        ? "Support for Zyrava"
                        : gift
                          ? "Customization gift"
                          : "Personal customization"}
                    </span>
                    <h2>{p.title}</h2>
                    <time dateTime={p.createdAt}>{date(p.createdAt)}</time>
                  </div>
                  <div className="payment-history-amount">
                    <strong>{formatPaymentAmount(p.amount, p.currency)}</strong>
                    <span className="payment-status" data-tone={status.tone}>
                      {status.label}
                    </span>
                  </div>
                </div>
                <div className="payment-history-reason">
                  <span>What it’s for</span>
                  <p>
                    {donation
                      ? "A voluntary contribution to help build and run Zyrava."
                      : gift
                        ? `Save and send a custom look to ${recipient}.`
                        : "Save and apply a custom look to your account."}
                  </p>
                  {gift && p.recipient ? (
                    <small>
                      {[p.recipient.email, p.recipient.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  ) : gift && !p.recipient ? (
                    <small>The recipient account is no longer available.</small>
                  ) : null}
                </div>
                <div className="payment-history-outcome">
                  {!donation ? (
                    <span>{durationLabel(p.durationMinutes)}</span>
                  ) : null}
                  <span>
                    {donation
                      ? p.fulfillmentStatus === "fulfilled"
                        ? "Support received"
                        : "Support not confirmed"
                      : p.fulfillmentStatus === "fulfilled"
                        ? gift
                          ? "Customization sent"
                          : "Customization saved"
                        : "Customization not saved"}
                  </span>
                </div>
                {p.amountRefunded > 0 ? (
                  <p className="payment-history-refund">
                    {formatPaymentAmount(p.amountRefunded, p.currency)} refunded
                  </p>
                ) : null}
                <details>
                  <summary>Payment details</summary>
                  <dl>
                    <div>
                      <dt>Order ID</dt>
                      <dd>{p.orderId ?? "No order created"}</dd>
                    </div>
                    <div>
                      <dt>Payment ID</dt>
                      <dd>{p.paymentId ?? "No payment confirmed"}</dd>
                    </div>
                    {p.fulfilledAt ? (
                      <div>
                        <dt>
                          {donation ? "Received" : gift ? "Sent" : "Saved"}
                        </dt>
                        <dd>{date(p.fulfilledAt)}</dd>
                      </div>
                    ) : null}
                    {p.lastCheckedAt ? (
                      <div>
                        <dt>Last checked</dt>
                        <dd>{date(p.lastCheckedAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </details>
                {p.fulfillmentStatus !== "fulfilled" &&
                p.orderId &&
                !p.amountRefunded ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={checking !== null}
                    loading={checking === p.id}
                    onClick={() => void checkPayment(p.id)}
                  >
                    Check payment
                  </Button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
      {data && data.pages > 1 ? (
        <nav
          className="payment-history-pagination"
          aria-label="Payment history pages"
        >
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {data.page} of {data.pages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
