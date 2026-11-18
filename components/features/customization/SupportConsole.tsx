"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Coffee,
  Heart,
  Music2,
  Server,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPaymentAmount } from "@/lib/razorpay";
import { SUPPORT_AMOUNTS, supportAmountPaise } from "@/lib/support";
import { useCustomizationCheckout } from "./useCustomizationCheckout";

export function SupportConsole() {
  const payment = useCustomizationCheckout("donation");
  const [selected, setSelected] = useState<number | "custom">(50);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const reduced = useReducedMotion();
  const amount =
    selected === "custom" ? supportAmountPaise(custom) : selected * 100;
  const thanks =
    "Thank you for the mug! Your support helps keep Zyrava growing.";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amount === null || payment.busy) return;
    setMessage("");
    if (await payment.donate(amount)) setMessage(thanks);
  }
  return (
    <section className="support-page" aria-labelledby="support-title">
      <nav className="support-nav" aria-label="Account navigation">
        <Link href="/customize">Customize</Link>
        <Link href="/support" aria-current="page">
          Buy A Mug
        </Link>
        <Link href="/payments">Payments</Link>
        <Link href="/" className="support-back">
          <Music2 size={16} /> Back to music
        </Link>
      </nav>
      <motion.div
        className="support-layout"
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="support-story">
          <div className="support-mug" aria-hidden="true">
            <Coffee size={88} strokeWidth={1.25} />
            <span>
              <Heart size={18} />
            </span>
          </div>
          <p className="support-eyebrow">A little support, a lot of music</p>
          <h1 id="support-title">
            Buy A Mug<span>Keep the music going.</span>
          </h1>
          <p className="support-intro">
            I’m building Zyrava with care. If it makes your day a little better,
            a virtual mug helps me keep building something you love.
          </p>
          <div className="support-reasons">
            <div>
              <Server size={19} />
              <p>
                <strong>Keep it running</strong>
                <span>Help with servers and the everyday costs of Zyrava.</span>
              </p>
            </div>
            <div>
              <Sparkles size={19} />
              <p>
                <strong>Make it better</strong>
                <span>
                  More time for thoughtful features, fixes, and smoother
                  listening.
                </span>
              </p>
            </div>
          </div>
          <p className="support-signoff">
            <Heart size={15} /> Every listen matters. Supporting is always
            optional.
          </p>
        </div>
        <div className="support-checkout-column">
          <form className="support-card" onSubmit={submit}>
            <div className="support-card-heading">
              <span className="support-eyebrow">A one-time thank-you</span>
              <Coffee size={22} />
            </div>
            <h2>Choose your support</h2>
            <p>A virtual mug, at an amount that feels right for you.</p>
            <fieldset className="support-amounts" disabled={payment.busy}>
              <legend className="sr-only">Support amount in rupees</legend>
              {[...SUPPORT_AMOUNTS, "custom" as const].map((value) => (
                <label key={value} data-selected={selected === value}>
                  <input
                    type="radio"
                    name="support-amount"
                    value={value}
                    checked={selected === value}
                    onChange={() => {
                      setSelected(value);
                      setMessage("");
                    }}
                  />
                  <span>
                    {value === "custom"
                      ? "Custom"
                      : `₹${value.toLocaleString("en-IN")}`}
                  </span>
                  <small>
                    {value === "custom"
                      ? "Your choice"
                      : value === 50
                        ? "A little boost"
                        : "With love"}
                  </small>
                </label>
              ))}
            </fieldset>
            {selected === "custom" ? (
              <div className="support-custom">
                <label htmlFor="custom-support">Your amount in rupees</label>
                <div>
                  <span aria-hidden="true">₹</span>
                  <input
                    id="custom-support"
                    inputMode="decimal"
                    placeholder="250"
                    value={custom}
                    maxLength={9}
                    disabled={payment.busy}
                    onChange={(e) => setCustom(e.target.value)}
                    aria-describedby="support-amount-help"
                  />
                </div>
                <small id="support-amount-help">
                  ₹1–₹10,000 · up to two decimal places
                </small>
              </div>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="support-submit"
              loading={payment.busy}
              disabled={
                amount === null || payment.busy || !payment.pricing?.configured
              }
            >
              {amount === null
                ? "Enter an amount"
                : `Buy A Mug · ${formatPaymentAmount(amount)}`}
              <ArrowUpRight size={18} />
            </Button>
            <p className="support-checkout-note">
              Secure checkout with Razorpay. Customization stays free.
            </p>
            {!payment.pricing ? (
              <p role="status" className="support-status">
                Loading checkout…
              </p>
            ) : !payment.pricing.configured ? (
              <p role="status" className="support-status">
                Support payments are unavailable right now. Thank you for being
                here.
              </p>
            ) : null}
            {payment.error ? (
              <p role="alert" className="support-status support-error">
                {payment.error}
              </p>
            ) : null}
            {message ? (
              <p role="status" className="support-status support-thanks">
                {message}
              </p>
            ) : null}
          </form>
          {payment.pending.length > 0 ? (
            <section
              className="support-pending"
              aria-label="Pending support payments"
            >
              <h2>Already started a checkout?</h2>
              <p>If you paid, check its status before paying again.</p>
              {payment.pending.map((p) => (
                <div key={p.id}>
                  <strong>{formatPaymentAmount(p.amount, p.currency)}</strong>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={payment.busy}
                    onClick={() =>
                      void payment.check(p).then((done) => {
                        if (done) setMessage(thanks);
                      })
                    }
                  >
                    Check payment
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={payment.busy}
                    onClick={() =>
                      void payment.resume(p).then((done) => {
                        if (done) setMessage(thanks);
                      })
                    }
                  >
                    Resume
                  </Button>
                </div>
              ))}
            </section>
          ) : null}
          <Link href="/payments" className="support-history">
            View payment history <ArrowUpRight size={14} />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
