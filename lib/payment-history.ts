import type { CustomizationPerson } from "./customization";
export interface PaymentHistoryItem {
  id: string;
  title: string;
  purpose: "customization_self" | "customization_gift";
  recipient: CustomizationPerson | null;
  amount: number;
  currency: string;
  amountRefunded: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  orderId: string | null;
  paymentId: string | null;
  durationMinutes: number | null;
  createdAt: string;
  fulfilledAt: string | null;
  lastCheckedAt: string | null;
}
export interface PaymentHistory {
  items: PaymentHistoryItem[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
export const PAYMENT_LABELS: Record<string, { label: string; tone: string }> = {
  created: { label: "Awaiting payment", tone: "pending" },
  authorized: { label: "Confirming payment", tone: "pending" },
  captured: { label: "Paid", tone: "paid" },
  failed: { label: "Failed", tone: "failed" },
  order_failed: { label: "Checkout unavailable", tone: "failed" },
  refunded: { label: "Refunded", tone: "refund" },
  partially_refunded: { label: "Partially refunded", tone: "refund" },
};
