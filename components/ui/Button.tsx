"use client";

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import type { LinkProps } from "next/link";
import { Loader2 } from "lucide-react";
import { Button as HeroButton, buttonVariants, type ButtonProps as HeroButtonProps } from "@heroui/react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const HERO_VARIANT: Record<
  ButtonVariant,
  "primary" | "secondary" | "outline" | "ghost" | "danger"
> = {
  primary: "primary",
  secondary: "secondary",
  outline: "outline",
  ghost: "ghost",
  danger: "danger",
};

const HERO_SIZE: Record<ButtonSize, "sm" | "md" | "lg"> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  icon: "md",
};

/** Shared classes so links and buttons look identical. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string
) {
  return cn(
    buttonVariants({
      variant: HERO_VARIANT[variant],
      size: HERO_SIZE[size],
      isIconOnly: size === "icon",
    }),
    className
  );
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "onClick"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    children,
    onClick,
    title,
    ...props
  },
  ref
) {
  const element = useRef<HTMLButtonElement | null>(null);

  /**
   * React Aria filters DOM props and drops `title`, so a `title` passed to a
   * button would silently never reach the DOM and no tooltip would appear.
   * Setting it on the node restores the hover hint on every icon button.
   */
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    if (title) node.setAttribute("title", title);
    else node.removeAttribute("title");
  }, [title]);

  return (
    <HeroButton
      ref={(node: HTMLButtonElement | null) => {
        element.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
      }}
      variant={HERO_VARIANT[variant]}
      size={HERO_SIZE[size]}
      isIconOnly={size === "icon"}
      isDisabled={disabled || loading}
      isPending={loading}
      onPress={onClick ? (event) => onClick(event as unknown as MouseEvent<HTMLButtonElement>) : undefined}
      className={className}
      {...(props as unknown as HeroButtonProps)}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </HeroButton>
  );
});

export interface ButtonLinkProps extends Omit<LinkProps, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
