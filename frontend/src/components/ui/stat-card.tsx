import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, trend, icon: Icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        className
      )}
    >
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
      )}
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{value}</span>
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trend.direction === "up" ? "text-emerald-600" : "text-red-600"
              )}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {trend.value}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
