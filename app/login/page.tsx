import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { getTrendingSlides } from "@/lib/trending";

export const metadata: Metadata = {
  title: "Sign in · ZYRAVA",
  description: "Sign in to your ZYRAVA account with email or phone.",
};

// The carousel is filled from the catalogue at request time (cached for 5 min).
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const slides = await getTrendingSlides();
  return <AuthScreen mode="login" initialSlides={slides} />;
}
