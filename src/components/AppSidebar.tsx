import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Clapperboard, HardDrive, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/editor", label: "Video Flash", icon: Clapperboard },
  { to: "/imagem-flash", label: "Imagem Flash", icon: ImageIcon },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex w-[13.5rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <Clapperboard className="size-4 text-primary" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">Studio Local</p>
          <p className="text-[11px] text-muted-foreground">offline · privado</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-secondary/60 hover:text-sidebar-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <item.icon className={cn("size-4", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4 pb-5">
        <div className="rounded-lg border border-border bg-secondary/40 p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <HardDrive className="size-3.5" />
            Dados salvos apenas neste computador
          </div>
        </div>
      </div>
    </aside>
  );
}
