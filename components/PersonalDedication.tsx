import { cn } from "@/lib/cn";

export function PersonalDedication({ className }: { className?: string }) {
  return (
    <p className={cn("personal-dedication whitespace-nowrap text-center leading-relaxed text-muted", className)}>
      Crafted with love for <span className="font-semibold text-brand">Vimitha</span>
      {" — my "}<span className="font-semibold text-brand">Baava</span>
      {"."}
    </p>
  );
}
