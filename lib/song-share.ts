import type { Song } from "@/lib/saavn";

export const SHARE_SITE_URL = "https://zyrava.vercel.app";

export function songShareUrl(song: Pick<Song, "id">): string {
  return `${SHARE_SITE_URL}/song/${encodeURIComponent(song.id)}`;
}

export function songShareText(song: Pick<Song, "id" | "title" | "artist">): string {
  return `${song.title}${song.artist ? ` — ${song.artist}` : ""}\nListen on ZYRAVA\n${songShareUrl(song)}`;
}

/** Only catalogue image hosts may be fetched by the artwork endpoint. */
export function allowedShareArtwork(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (/^(?:[a-z0-9-]+\.)*saavncdn\.com$/.test(url.hostname) ||
       /^(?:[a-z0-9-]+\.)*scdn\.co$/.test(url.hostname));
  } catch {
    return false;
  }
}

export async function createSongShareImage(song: Song): Promise<Blob> {
  const artwork = song.imageLarge || song.image;
  if (!artwork) throw new Error("This song has no artwork. You can still share its name and link.");
  const response = await fetch(`/api/music/share-artwork?url=${encodeURIComponent(artwork)}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Couldn't load the artwork. Retry it or share the song link.");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image sharing is unavailable in this browser.");
    ctx.fillStyle = "#121619";
    ctx.fillRect(0, 0, 1000, 1280);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 40, 40, 920, 920);
    ctx.fillStyle = "#ffffff";
    let fontSize = 50;
    do {
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      if (ctx.measureText(song.title).width <= 920) break;
      fontSize -= 2;
    } while (fontSize > 28);
    ctx.fillText(song.title, 40, 1030, 920);
    ctx.fillStyle = "#bfc7c3";
    ctx.font = "30px system-ui, sans-serif";
    ctx.fillText(song.artist, 40, 1080, 920);
    ctx.fillStyle = "#7ce4ad";
    ctx.font = "700 28px system-ui, sans-serif";
    ctx.fillText("LISTEN ON ZYRAVA", 40, 1170);
    ctx.fillStyle = "#ffffff";
    ctx.font = "32px system-ui, sans-serif";
    ctx.fillText(songShareUrl(song).replace("https://", ""), 40, 1220, 920);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Couldn't prepare the image.")), "image/png"
    ));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Call directly from the click, before awaiting any work (browser activation). */
export function shareSongWithApps(
  song: Pick<Song, "id" | "title" | "artist">,
  file: File | undefined,
  api: Pick<Navigator, "share" | "canShare"> = navigator,
): Promise<void> | null {
  if (typeof api.share !== "function") return null;
  if (file && api.canShare?.({ files: [file] })) {
    return api.share({ title: song.title, text: songShareText(song), files: [file] });
  }
  return api.share({ title: song.title, text: `${song.title} — ${song.artist}`, url: songShareUrl(song) });
}

// Visible cards prepare in the background, never in the share click's activation
// window. Limit concurrent image work and retain only a small recent cache.
const preparedImages = new Map<string, Promise<File | undefined>>();
let preparationTail: Promise<unknown> = Promise.resolve();
export function prepareSongShareFile(song: Song): Promise<File | undefined> {
  const key = JSON.stringify([song.id, song.title, song.artist, song.imageLarge || song.image]);
  const cached = preparedImages.get(key);
  if (cached) return cached;
  const pending = preparationTail.then(async () => {
    try {
      const blob = await createSongShareImage(song);
      return new File([blob], "zyrava-song.png", { type: "image/png" });
    } catch {
      preparedImages.delete(key);
      return undefined;
    }
  });
  preparationTail = pending;
  preparedImages.set(key, pending);
  if (preparedImages.size > 24) preparedImages.delete(preparedImages.keys().next().value!);
  return pending;
}
