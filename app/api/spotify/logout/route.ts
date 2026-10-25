/** Disconnects the Spotify session by clearing both cookies. */
import { NextResponse, type NextRequest } from "next/server";
import { clearSpotifyCookies } from "@/lib/spotify/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await clearSpotifyCookies();
  return NextResponse.redirect(new URL("/?spotify=disconnected", request.nextUrl.origin));
}
