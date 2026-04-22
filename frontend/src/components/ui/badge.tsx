import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-800 text-slate-200",
  success: "bg-emerald-950/60 text-emerald-400 ring-1 ring-emerald-800/60",
  warning: "bg-amber-950/60 text-amber-400 ring-1 ring-amber-800/60",
  danger: "bg-red-950/60 text-red-400 ring-1 ring-red-800/60",
  info: "bg-blue-950/60 text-blue-400 ring-1 ring-blue-800/60",
};

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
