/**
 * Connection status + profile. Returns `connected: false` (not an error)
 * when no session exists, so the UI can render the login button.
 */
import { NextResponse } from "next/server";
import { spotifyApiFetch } from "@/lib/spotify/session";

export const runtime = "nodejs";

type Profile = {
  connected: boolean;
  profile?: {
    id: string;
    name: string;
    avatar: string | null;
    profileUrl: string;
  };
  error?: string;
};

export async function GET() {
  const response = await spotifyApiFetch("/me");
  if (response.status === 401) {
    // No session or a refresh that failed — the UI shows the login button.
    return NextResponse.json({ connected: false } satisfies Profile);
  }
  if (!response.ok) {
    return NextResponse.json({ connected: false, error: "profile_unavailable" } satisfies Profile);
  }
  const raw = (await response.json()) as {
    id?: string;
    display_name?: string;
    images?: Array<{ url?: string }>;
    external_urls?: { spotify?: string };
  };
  return NextResponse.json({
    connected: true,
    profile: {
      id: raw.id ?? "",
      name: raw.display_name || "Spotify user",
      avatar: raw.images?.[0]?.url ?? null,
      profileUrl: raw.external_urls?.spotify ?? "",
    },
  } satisfies Profile);
}
