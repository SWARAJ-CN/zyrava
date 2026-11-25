import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = {
  title: "Sign in · ZYRAVA",
  description: "Sign in to your ZYRAVA account with email or phone.",
};

// The form renders immediately; optional artwork loads independently on the client.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
