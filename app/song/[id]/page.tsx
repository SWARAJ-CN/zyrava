import { cache } from "react";
import type { Metadata } from "next";
import { getSongDetail } from "@/lib/saavn";
import { songShareUrl } from "@/lib/song-share";
import { SharedSongPage } from "@/components/features/music/SharedSongPage";

const resolveSong = cache(getSongDetail);
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const song = await resolveSong(id);
  if (!song) return { title: "Shared song", robots: { index: false } };
  const title = `${song.title} — ${song.artist}`;
  const description = `Listen to ${song.title} by ${song.artist} on ZYRAVA.`;
  const image = song.imageLarge || song.image;
  return {
    title, description, alternates: { canonical: songShareUrl(song) },
    openGraph: {
      title, description, url: songShareUrl(song), siteName: "ZYRAVA", type: "music.song",
      images: image ? [{ url: image, alt: title }] : [],
    },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
  };
}

export default async function SongPage({ params }: Props) {
  const { id } = await params;
  return <SharedSongPage song={await resolveSong(id)} />;
}
