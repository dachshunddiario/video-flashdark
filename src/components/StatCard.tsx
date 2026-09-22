import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "up" | "down";
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary/80" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && (
        <p
          className={cn(
            "mt-1 text-xs",
            tone === "up" && "text-success",
            tone === "down" && "text-destructive",
            tone === "default" && "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
