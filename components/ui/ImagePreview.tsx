"use client";

import Image from "next/image";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Modal } from "@heroui/react";
import { ImageOff, Loader2 } from "lucide-react";
import { UNSAFE_PortalProvider } from "react-aria";
import { cn } from "@/lib/cn";

function PreviewImage({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className="relative grid min-h-40 place-items-center overflow-hidden rounded-xl bg-black/10">
    {!loaded && !failed ? <span role="status" className="absolute inset-0 grid place-items-center"><Loader2 aria-hidden className="size-6 animate-spin text-muted" /><span className="sr-only">Loading image…</span></span> : null}
    {failed ? <p role="alert" className="flex items-center gap-2 p-6 text-center text-sm text-muted"><ImageOff aria-hidden className="size-5 shrink-0" />This photo couldn’t be loaded.</p> : <Image
      unoptimized loading="eager" src={src} alt={alt} width={width} height={height}
      className={cn("max-h-[calc(100dvh-10rem)] w-full object-contain", !loaded && "opacity-0")}
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
    />}
  </div>;
}

/** Keep signed image URLs inside the app, including above the native chat dialog. */
export function ImagePreview({ src, alt, children, className, label, title = "Image preview", width = 1200, height = 900 }: {
  src: string; alt: string; children: ReactNode; className?: string; label?: string; title?: string; width?: number; height?: number;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const getContainer = useCallback(() => trigger.current?.closest<HTMLDialogElement>("dialog") ?? document.body, []);
  return <UNSAFE_PortalProvider getContainer={getContainer}>
    <Modal.Root isOpen={open} onOpenChange={setOpen}>
      <Button ref={trigger} variant="ghost" aria-label={label || `View image: ${alt}`} className={cn("min-w-0 shrink-0 cursor-zoom-in p-0", className)}>{children}</Button>
      <Modal.Backdrop isDismissable variant="blur" onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
        <Modal.Container placement="center" scroll="inside" className="w-full p-3 sm:w-full sm:p-6">
          <Modal.Dialog className="w-full max-w-5xl gap-3 rounded-2xl p-3 sm:gap-4 sm:p-4">
            <Modal.Header className="min-h-10 items-center gap-3">
              <Modal.Heading className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</Modal.Heading>
              <Modal.CloseTrigger aria-label="Close image preview" className="size-10 shrink-0" />
            </Modal.Header>
            <Modal.Body className="min-h-0 p-0">
              <PreviewImage key={src} src={src} alt={alt} width={width} height={height} />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  </UNSAFE_PortalProvider>;
}
