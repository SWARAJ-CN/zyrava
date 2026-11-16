"use client";

export interface RazorpayProof {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
export interface CustomizationPayment {
  id: string;
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
  status: "pending" | "fulfilled";
  title: string;
  recipientId: string;
  createdAt: string;
}
interface CheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme: { color: string };
  handler: (proof: RazorpayProof) => void;
  modal: { ondismiss: () => void; confirm_close: boolean; escape: boolean };
}
export interface RazorpayCheckout {
  open(): void;
  close(): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => RazorpayCheckout;
  }
}
let loading: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const timer = window.setTimeout(() => fail(), 20000);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(
        new Error(
          "Razorpay checkout could not load. Check your connection and try again.",
        ),
      );
    };
    script.onload = () => {
      clearTimeout(timer);
      if (window.Razorpay) resolve();
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export function formatPaymentAmount(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
