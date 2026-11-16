"use client";

import { useCustomization } from "@/components/providers/CustomizationProvider";
import { CustomizationAnimation } from "@/components/features/customization/CustomizationAnimation";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Controls";
import { BeatWordmark } from "./BeatWordmark";

const PersonalHeaderAnimation = dynamic(
  () => import("./PersonalHeaderAnimation").then((module) => module.PersonalHeaderAnimation),
  { ssr: false, loading: () => null },
);

export function HomeHeader({ personal, search, getAnalyser, playing, hueSeed, onOpenDock }: {
  personal: boolean;
  search: ReactNode;
  getAnalyser: () => AnalyserNode | null;
  playing: boolean;
  hueSeed: number;
  onOpenDock: () => void;
}) {
  const {active}=useCustomization();
  const menu = (
    <button type="button" onClick={onOpenDock} aria-label="Open the dock"
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-separator bg-surface text-foreground shadow-field transition-colors hover:text-brand md:hidden">
      <Icon name="menu" className="size-5" />
    </button>
  );
  if (!personal && active) return (
    <header className="home-glass-header customized-home-header">
      <div aria-hidden="true" className="home-personal-watermark"><span>ZYRAVA</span></div>
      <div className="home-header-bottom">
        <div className="home-header-identity">
          <CustomizationAnimation id={active.config.headerAnimation} className="home-header-animation"/>
          <div className="min-w-0"><h1 className="break-words text-lg font-semibold text-foreground">{active.config.title}</h1><p className="mt-1 break-words text-xs text-muted">Created by {active.creator.name||"ZYRAVA listener"}</p>{active.creator.email?<p className="mt-1 break-words text-xs text-muted">{active.creator.email}</p>:null}</div>
        </div>
        {menu}
        <div className="home-header-search">{search}</div>
      </div>
    </header>
  );
  if (!personal) return (
    <div className="home-header-standard">
      <div aria-hidden className="home-wordmark-backdrop">
        <BeatWordmark getAnalyser={getAnalyser} playing={playing} hueSeed={hueSeed} className="home-wordmark font-black leading-none tracking-tighter">ZYRAVA</BeatWordmark>
      </div>
      <PageHeader title="ZYRAVA" leading={menu} actions={search} />
    </div>
  );
  return (
    <header className="home-glass-header">
      <div aria-hidden="true" className="home-personal-watermark">
        <span>ZYRAVA</span>
      </div>
      <div className="home-header-bottom">
        <div className="home-header-identity">
          <div aria-hidden="true" className="home-header-animation motion-reduce:hidden">
            <PersonalHeaderAnimation />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              Vimitha’s listening room
            </h1>
            <p className="mt-1 text-xs text-muted">Made for you, Baava</p>
          </div>
        </div>
        {menu}
        <div className="home-header-search">{search}</div>
      </div>
    </header>
  );
}
