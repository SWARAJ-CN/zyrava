"use client";

import { Button, type ButtonProps } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * A HeroUI button with a short press animation. Pagination and the auth forms
 * use it so a tap is acknowledged before the next screen paints; the scale is
 * tiny (0.94) and skipped entirely when motion is reduced.
 */
export function ClickButton({ square, className, ...props }: ButtonProps & { square?: boolean }) {
  return (
    <Button
      {...props}
      className={cn(
        "transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-(--ease-out)",
        "active:scale-[0.94] active:duration-75 motion-reduce:transition-none motion-reduce:active:scale-100",
        square && "rounded-none",
        className
      )}
    />
  );
}
