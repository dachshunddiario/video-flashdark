import { Instagram, History, Plus, Trash2, Calendar, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { formatFollowers, formatGrowth, formatDateBR, type PageMetrics } from "@/lib/metrics";
import { type SocialPage } from "@/lib/types";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface CompetitorCardProps {
  page: SocialPage;
  metrics: PageMetrics;
  onRecordSnapshot: (pageId: string) => void;
  onViewHistory: (page: SocialPage) => void;
  onDelete: (pageId: string) => void;
}

export function CompetitorCard({
  page,
  metrics,
  onRecordSnapshot,
  onViewHistory,
  onDelete,
}: CompetitorCardProps) {
  const isInstagram = page.platform === "instagram";

  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-md">
      {/* Topo do Card: Nome, Plataforma e Ações */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {page.avatarUrl ? (
              <img
                src={page.avatarUrl}
                alt={page.name}
                className="size-9 rounded-full object-cover border border-amber-500/30 shrink-0 shadow-sm"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="size-9 rounded-full bg-gradient-to-br from-amber-500/20 to-purple-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-xs text-amber-300 shrink-0">
                {page.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h4 className="truncate font-semibold text-sm text-foreground" title={page.name}>
                {page.name}
              </h4>
              <a
                href={isInstagram ? `https://instagram.com/${page.handle}` : `https://facebook.com/${page.handle}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary transition-colors"
                title="Abrir perfil no Instagram"
              >
                <span>@{page.handle}</span>
                <ExternalLink className="size-2.5 opacity-60" />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isInstagram
                  ? "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              }`}
            >
              {isInstagram ? <Instagram className="size-2.5" /> : <FacebookIcon className="size-2.5" />}
              {isInstagram ? "Instagram" : "Facebook"}
            </span>

            <button
              onClick={() => onDelete(page.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive rounded"
              title="Remover concorrente"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Número Atual de Seguidores & Posts */}
        <div className="mt-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold tracking-tight text-foreground">
              {formatFollowers(page.followersCount ?? (metrics.currentFollowers > 0 ? metrics.currentFollowers : 0))}
            </span>
            <span className="text-xs text-muted-foreground">seguidores</span>
          </div>
          {page.postsCount ? (
            <span className="text-[11px] font-mono text-muted-foreground">
              {page.postsCount} posts
            </span>
          ) : null}
        </div>

          {/* Variação 30 dias */}
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <span
              className={`inline-flex items-center gap-0.5 font-medium ${
                metrics.growth30d >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {metrics.growth30d >= 0 ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {formatGrowth(metrics.growth30d)}
            </span>
            <span className="text-muted-foreground text-[11px]">nos últimos 30 dias</span>
          </div>
        </div>

      {/* Rodapé: Data e Botões de Ação */}
      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 truncate" title={`Atualizado em ${formatDateBR(metrics.lastUpdateDate)}`}>
          <Calendar className="size-3" />
          {formatDateBR(metrics.lastUpdateDate)}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewHistory(page)}
            className="rounded px-2 py-1 hover:bg-secondary/60 text-foreground transition-colors flex items-center gap-1"
            title="Ver histórico de medições"
          >
            <History className="size-3 text-muted-foreground" />
            <span>Histórico</span>
          </button>
          <button
            onClick={() => onRecordSnapshot(page.id)}
            className="rounded bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 font-medium transition-colors flex items-center gap-1"
            title="Registrar nova contagem"
          >
            <Plus className="size-3" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
