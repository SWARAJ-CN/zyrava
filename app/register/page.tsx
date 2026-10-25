import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { getTrendingSlides } from "@/lib/trending";

export const metadata: Metadata = {
  title: "Create account · ZYRAVA",
  description: "Create a ZYRAVA account with your email address or phone number.",
};

// The carousel is filled from the catalogue at request time (cached for 5 min).
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const slides = await getTrendingSlides();
  return <AuthScreen mode="register" initialSlides={slides} />;
}
