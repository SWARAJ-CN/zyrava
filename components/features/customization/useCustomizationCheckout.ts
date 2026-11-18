"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { CustomizationConfig } from "@/lib/customization";
import {
  loadRazorpay,
  type CustomizationPayment,
  type RazorpayCheckout,
  type RazorpayProof,
} from "@/lib/razorpay";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCustomization } from "@/components/providers/CustomizationProvider";

export function useCustomizationCheckout(
  mode: "customization" | "donation" = "customization",
) {
  const { user } = useAuth();
  const { refresh } = useCustomization();
  const [pricing, setPricing] = useState<{
    amount: number;
    currency: string;
    configured: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CustomizationPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const checkout = useRef<RazorpayCheckout | null>(null);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(
    null,
  );
  const reload = useCallback(async () => {
    const [response, price] = await Promise.all([
      apiFetch<{ payments: CustomizationPayment[] }>(
        "/api/customization/payments",
      ),
      apiFetch<{ amount: number; currency: string; configured: boolean }>(
        "/api/customization/payments/config",
      ),
    ]);
    if (alive.current) {
      setPending(
        response.payments.filter((p) =>
          mode === "donation"
            ? p.purpose === "donation"
            : p.purpose !== "donation",
        ),
      );
      setPricing(price);
    }
  }, [mode]);
  useEffect(() => {
    alive.current = true;
    queueMicrotask(() => {
      if (alive.current)
        void reload().catch(() => {
          if (alive.current)
            setError(
              "Could not load pending payments. Refresh before paying again if you already paid.",
            );
        });
    });
    return () => {
      alive.current = false;
      checkout.current?.close();
    };
  }, [reload]);
  const confirm = async (
    payment: CustomizationPayment,
    proof?: RazorpayProof,
  ) => {
    const result = await apiFetch<{ fulfilled: boolean }>(
      `/api/customization/payments/${proof ? "verify" : "check"}`,
      {
        method: "POST",
        body: { purchaseId: payment.id, ...proof },
      },
    );
    if (result.fulfilled) {
      attempt.current = null;
      if (payment.purpose !== "donation") await refresh();
      await reload();
    }
    return result.fulfilled;
  };
  const open = async (payment: CustomizationPayment) => {
    // A previous success may have lost its browser callback. Check before opening checkout again.
    if (await confirm(payment)) return true;
    await loadRazorpay();
    if (!alive.current) return false;
    const Razorpay = window.Razorpay!;
    const proof = await new Promise<RazorpayProof | null>((resolve) => {
      checkout.current = new Razorpay({
        key: payment.keyId,
        order_id: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        name: "ZYRAVA",
        description:
          payment.purpose === "donation"
            ? "Buy A Mug · Support Zyrava"
            : `Customization · ${payment.title}`,
        prefill: {
          name: user?.name ?? undefined,
          email: user?.email ?? undefined,
          contact: user?.phone ?? undefined,
        },
        theme: { color: "#37c9a4" },
        handler: resolve,
        modal: {
          ondismiss: () => resolve(null),
          confirm_close: true,
          escape: true,
        },
      });
      checkout.current.open();
    });
    checkout.current = null;
    if (!proof || !alive.current) return false;
    // Verification can lag slightly behind bank/UPI confirmation. Retry safely without a second payment.
    for (let i = 0; i < 3; i++) {
      if (await confirm(payment, proof)) return true;
      if (i < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(
      "Payment is still being confirmed. Use Check payment below; do not pay again.",
    );
  };
  const run = async (action: () => Promise<boolean>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Payment could not be confirmed. Check its status before paying again.",
        );
      return false;
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        void reload().catch(() => undefined);
      }
    }
  };
  const pay = (recipientId: string, config: CustomizationConfig) =>
    run(async () => {
      if (!pricing?.configured)
        throw new Error(
          "Payments are not available yet. Please try again later.",
        );
      await loadRazorpay(); // Do not create an order if the checkout script is blocked.
      const fingerprint = JSON.stringify({
        recipientId,
        config,
        amount: pricing.amount,
      });
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, requestId: crypto.randomUUID() };
      let payment: CustomizationPayment;
      try {
        payment = await apiFetch<CustomizationPayment>(
          "/api/customization/payments/order",
          {
            method: "POST",
            body: {
              recipientId,
              config,
              requestId: attempt.current.requestId,
              expectedAmount: pricing.amount,
            },
          },
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) attempt.current = null;
        throw e;
      }
      if (alive.current)
        setPending((previous) => [
          payment,
          ...previous.filter((p) => p.id !== payment.id),
        ]);
      return open(payment);
    });
  const donate = (amount: number) =>
    run(async () => {
      if (!pricing?.configured)
        throw new Error("Support payments are unavailable right now.");
      if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000)
        throw new Error("Choose an amount between ₹1 and ₹10,000.");
      await loadRazorpay();
      const fingerprint = JSON.stringify({ purpose: "donation", amount });
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, requestId: crypto.randomUUID() };
      const payment = await apiFetch<CustomizationPayment>(
        "/api/customization/donations/order",
        {
          method: "POST",
          body: { amount, requestId: attempt.current.requestId },
        },
      );
      if (alive.current)
        setPending((previous) => [
          payment,
          ...previous.filter((p) => p.id !== payment.id),
        ]);
      return open(payment);
    });
  return {
    pricing,
    busy,
    error,
    pending,
    pay,
    donate,
    resume: (payment: CustomizationPayment) => run(() => open(payment)),
    check: (payment: CustomizationPayment) =>
      run(async () => {
        const done = await confirm(payment);
        if (!done)
          throw new Error(
            "No completed payment yet. If money was debited, wait and check again. Otherwise you can resume this checkout.",
          );
        return done;
      }),
  };
}
