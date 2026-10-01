import { useMemo } from "react";
import { Trash2, Calendar, TrendingUp, TrendingDown, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatFollowers, formatGrowth, formatDateBR } from "@/lib/metrics";
import { type FollowerSnapshot, type SocialPage } from "@/lib/types";

interface PageHistoryModalProps {
  page: SocialPage | null;
  history: FollowerSnapshot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
}

export function PageHistoryModal({
  page,
  history,
  open,
  onOpenChange,
  onDeleteSnapshot,
}: PageHistoryModalProps) {
  const pageSnapshots = useMemo(() => {
    if (!page) return [];
    return history
      .filter((h) => h.pageId === page.id)
      .sort((a, b) => b.date.localeCompare(a.date)); // Mais recente primeiro
  }, [history, page]);

  if (!page) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            <DialogTitle>Histórico de Medições</DialogTitle>
          </div>
          <DialogDescription>
            {page.name} (@{page.handle}) · {pageSnapshots.length} medições salvas
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-[380px] overflow-y-auto scrollbar-slim border rounded-lg border-border">
          {pageSnapshots.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhuma medição registrada ainda para esta página.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/40 border-b border-border text-muted-foreground sticky top-0">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Data</th>
                  <th className="py-2.5 px-3 font-medium">Seguidores</th>
                  <th className="py-2.5 px-3 font-medium">Variação</th>
                  <th className="py-2.5 px-3 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pageSnapshots.map((snap, idx) => {
                  const nextSnap = pageSnapshots[idx + 1];
                  const diff = nextSnap ? snap.followers - nextSnap.followers : null;

                  return (
                    <tr key={snap.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-2.5 px-3 flex items-center gap-1.5 font-medium">
                        <Calendar className="size-3 text-muted-foreground" />
                        {formatDateBR(snap.date)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold">
                        {formatFollowers(snap.followers)}
                      </td>
                      <td className="py-2.5 px-3">
                        {diff !== null ? (
                          <span
                            className={`inline-flex items-center gap-0.5 font-medium ${
                              diff >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {diff >= 0 ? (
                              <TrendingUp className="size-3" />
                            ) : (
                              <TrendingDown className="size-3" />
                            )}
                            {formatGrowth(diff)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Primeira medição</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onDeleteSnapshot(snap.id)}
                          title="Remover esta medição"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
