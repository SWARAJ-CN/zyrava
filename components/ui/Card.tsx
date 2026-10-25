import type { HTMLAttributes, ReactNode } from "react";
import { Card as HeroCard } from "@heroui/react";
import { cn } from "@/lib/cn";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <HeroCard className={cn("gap-0 p-0", className)} {...props}>
      {children ?? null}
    </HeroCard>
  );
}

interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <HeroCard.Header
      className={cn(
        // `flex-wrap` lets the actions drop to their own line instead of
        // squeezing the title or pushing the card (and the page) wider than
        // the screen.
        "flex-row flex-wrap items-start justify-between gap-3 border-b border-separator px-5 py-4",
        className
      )}
      {...props}
    >
      {children ?? (
        <div className="min-w-0">
          {title ? (
            <HeroCard.Title className="text-sm font-semibold text-foreground">
              {title}
            </HeroCard.Title>
          ) : null}
          {description ? (
            <HeroCard.Description className="mt-0.5 text-xs text-muted">
              {description}
            </HeroCard.Description>
          ) : null}
        </div>
      )}
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </HeroCard.Header>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-separator px-5 py-3.5",
        className
      )}
      {...props}
    />
  );
}
