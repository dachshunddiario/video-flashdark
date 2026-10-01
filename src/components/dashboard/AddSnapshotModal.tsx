import { useState, useMemo } from "react";
import { Plus, TrendingUp, TrendingDown, Calendar, Hash, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uid } from "@/lib/local-store";
import { formatFollowers, formatGrowth, formatPercent, previewUpdate } from "@/lib/metrics";
import { type FollowerSnapshot, type SocialPage } from "@/lib/types";

interface AddSnapshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: SocialPage[];
  history: FollowerSnapshot[];
  defaultPageId?: string | null;
  onSave: (snapshot: FollowerSnapshot) => void;
}

export function AddSnapshotModal({
  open,
  onOpenChange,
  pages,
  history,
  defaultPageId,
  onSave,
}: AddSnapshotModalProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>(
    defaultPageId || pages[0]?.id || "",
  );
  const [followers, setFollowers] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Sincroniza página padrão se mudar
  const activePageId = selectedPageId || defaultPageId || pages[0]?.id || "";
  const selectedPage = pages.find((p) => p.id === activePageId);

  // Última medição registrada para esta página
  const lastSnapshot = useMemo(() => {
    if (!activePageId) return null;
    return history
      .filter((h) => h.pageId === activePageId)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  }, [history, activePageId]);

  // Cálculo prévio em tempo real
  const preview = useMemo(() => {
    const num = parseInt(followers.replace(/\D/g, ""), 10);
    if (isNaN(num) || !lastSnapshot) return null;
    const isPast = date < lastSnapshot.date;
    if (isPast) {
      const diff = lastSnapshot.followers - num;
      const pct = num > 0 ? (diff / num) * 100 : 0;
      const d1 = new Date(date).getTime();
      const d2 = new Date(lastSnapshot.date).getTime();
      const days = Math.max(1, Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
      const avgPerDay = Math.round((diff / days) * 10) / 10;
      return {
        diff,
        pct,
        avgPerDay,
        days,
        isPast: true,
      };
    }
    return {
      ...previewUpdate(lastSnapshot.followers, num, lastSnapshot.date, date),
      isPast: false,
    };
  }, [followers, lastSnapshot, date]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const followersNum = parseInt(followers.replace(/\D/g, ""), 10);
    if (!activePageId || isNaN(followersNum)) return;

    const snap: FollowerSnapshot = {
      id: uid(),
      pageId: activePageId,
      date,
      followers: followersNum,
    };

    onSave(snap);
    setFollowers("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Registrar Atualização de Seguidores</DialogTitle>
            <DialogDescription>
              Insira a nova contagem de seguidores. O sistema calcula automaticamente o crescimento absoluto,
              percentual e diário.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Seleção de Página */}
            <div className="space-y-1.5">
              <Label htmlFor="target-page" className="text-xs">
                Selecione a Página
              </Label>
              <select
                id="target-page"
                className="w-full rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-ring"
                value={activePageId}
                onChange={(e) => setSelectedPageId(e.target.value)}
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (@{p.handle}) {p.isCompetitor ? "— Concorrente" : "— Minha Página"}
                  </option>
                ))}
              </select>
            </div>

            {/* Data e Seguidores */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="snap-date" className="text-xs flex items-center gap-1.5">
                  <Calendar className="size-3.5" /> Data da Medição
                </Label>
                <Input
                  id="snap-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {/* Atalhos rápidos de data para marcos históricos */}
                <div className="flex flex-wrap gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                    className="rounded bg-secondary/60 hover:bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-border/50 transition cursor-pointer"
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setDate(d.toISOString().slice(0, 10));
                    }}
                    className="rounded bg-secondary/60 hover:bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-border/50 transition cursor-pointer"
                  >
                    Ontem (-1d)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 7);
                      setDate(d.toISOString().slice(0, 10));
                    }}
                    className="rounded bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary border border-primary/40 transition cursor-pointer font-semibold"
                  >
                    Semana Passada (-7d)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 30);
                      setDate(d.toISOString().slice(0, 10));
                    }}
                    className="rounded bg-secondary/60 hover:bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-border/50 transition cursor-pointer"
                  >
                    Mês Passado (-30d)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setFullYear(d.getFullYear() - 1);
                      setDate(d.toISOString().slice(0, 10));
                    }}
                    className="rounded bg-secondary/60 hover:bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-border/50 transition cursor-pointer"
                  >
                    1 Ano Atrás (-365d)
                  </button>
                  {selectedPage?.createdAt && (
                    <button
                      type="button"
                      onClick={() => setDate(selectedPage.createdAt.slice(0, 10))}
                      className="rounded bg-purple-500/10 hover:bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-400 border border-purple-500/30 transition cursor-pointer"
                    >
                      Criação ({selectedPage.createdAt.slice(0, 10)})
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="snap-followers" className="text-xs flex items-center gap-1.5">
                  <Hash className="size-3.5" /> Novos Seguidores
                </Label>
                <Input
                  id="snap-followers"
                  placeholder="Ex: 25430"
                  inputMode="numeric"
                  value={followers}
                  onChange={(e) => setFollowers(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Painel de Cálculo e Prévia Automática */}
            {lastSnapshot && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3.5 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Última medição ({lastSnapshot.date}):</span>
                  <span className="font-semibold text-foreground">
                    {formatFollowers(lastSnapshot.followers)} seguidores
                  </span>
                </div>

                {preview && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="font-medium text-foreground mb-2 flex items-center gap-1">
                      <span>Cálculo automático:</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md bg-background/60 p-2 text-center border border-border/40">
                        <span className="text-[10px] text-muted-foreground block">Absoluto</span>
                        <span
                          className={`font-semibold text-xs flex items-center justify-center gap-0.5 ${
                            preview.diff >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {preview.diff >= 0 ? (
                            <TrendingUp className="size-3" />
                          ) : (
                            <TrendingDown className="size-3" />
                          )}
                          {formatGrowth(preview.diff)}
                        </span>
                      </div>

                      <div className="rounded-md bg-background/60 p-2 text-center border border-border/40">
                        <span className="text-[10px] text-muted-foreground block">Percentual</span>
                        <span
                          className={`font-semibold text-xs ${
                            preview.pct >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatPercent(preview.pct)}
                        </span>
                      </div>

                      <div className="rounded-md bg-background/60 p-2 text-center border border-border/40">
                        <span className="text-[10px] text-muted-foreground block">Média / Dia</span>
                        <span
                          className={`font-semibold text-xs ${
                            preview.avgPerDay >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {preview.avgPerDay >= 0 ? "+" : ""}
                          {preview.avgPerDay.toLocaleString("pt-BR")}/dia
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!activePageId || !followers.trim()}
            >
              <Plus className="mr-1.5 size-4" />
              Salvar Atualização
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
