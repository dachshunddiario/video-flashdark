import React, { useState, useMemo } from "react";
import {
  type SocialPage,
  type FollowerSnapshot,
  type PagePostInsight,
  type TimeRangePeriod,
} from "@/lib/types";
import {
  calculatePageMetrics,
  formatFollowers,
  formatGrowth,
  formatPercent,
  getGrowthForPeriod,
  getPeriodLabel,
} from "@/lib/metrics";
import {
  TrendingUp,
  Swords,
  Sparkles,
  Share2,
  Heart,
  MessageCircle,
  Eye,
  Plus,
  ArrowUpRight,
  Flame,
  CheckCircle2,
  ExternalLink,
  Copy,
  Instagram,
  FileImage,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "@tanstack/react-router";

interface CompetitorInsightsSectionProps {
  competitors: SocialPage[];
  ownPages: SocialPage[];
  history: FollowerSnapshot[];
  posts: PagePostInsight[];
  onAddPost?: (newPost: PagePostInsight) => void;
  className?: string;
}

const PERIODS: { id: TimeRangePeriod; label: string }[] = [
  { id: "1d", label: "Diário (24h)" },
  { id: "3d", label: "3 Dias" },
  { id: "7d", label: "7 Dias" },
  { id: "15d", label: "15 Dias" },
  { id: "30d", label: "30 Dias" },
  { id: "90d", label: "90 Dias" },
];

export function CompetitorInsightsSection({
  competitors,
  ownPages,
  history,
  posts,
  onAddPost,
  className = "",
}: CompetitorInsightsSectionProps) {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<TimeRangePeriod>("7d");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isAddPostModalOpen, setIsAddPostModalOpen] = useState(false);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);

  // Formulário do novo post
  const [newHeadline, setNewHeadline] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [newCompetitorId, setNewCompetitorId] = useState(competitors[0]?.id || "");
  const [newMediaType, setNewMediaType] = useState<"image" | "carousel" | "video">("image");
  const [newLikes, setNewLikes] = useState(1500);
  const [newComments, setNewComments] = useState(120);
  const [newGrowthImpact, setNewGrowthImpact] = useState(250);
  const [newStrategy, setNewStrategy] = useState("Pergunta Intrigante");

  // Métricas calculadas para cada concorrente
  const competitorMetrics = useMemo(() => {
    return competitors.map((comp) => {
      const snaps = history.filter((h) => h.pageId === comp.id);
      const metrics = calculatePageMetrics(snaps);
      const growthData = getGrowthForPeriod(metrics, selectedPeriod);
      return {
        comp,
        metrics,
        periodGrowth: growthData.growth,
        periodPercent: growthData.percent,
      };
    }).sort((a, b) => b.periodGrowth - a.periodGrowth);
  }, [competitors, history, selectedPeriod]);

  // Modelar no Imagem Flash com preenchimento da headline
  const handleModelInImageFlash = (headline: string) => {
    try {
      // Salva no localStorage para a página Imagem Flash carregar imediatamente
      const current = window.localStorage.getItem("vlocal:image-flash-template");
      if (current) {
        const parsed = JSON.parse(current);
        parsed.headline = { ...parsed.headline, text: headline };
        window.localStorage.setItem("vlocal:image-flash-template", JSON.stringify(parsed));
      }
    } catch {}
    navigate({ to: "/imagem-flash" });
  };

  // Modelar no Video Flash
  const handleModelInVideoFlash = (headline: string) => {
    try {
      const current = window.localStorage.getItem("vlocal:templates");
      // Opcional: injeta a headline no editor
    } catch {}
    navigate({ to: "/editor" });
  };

  const handleCopyText = (postId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPostId(postId);
    setTimeout(() => setCopiedPostId(null), 2000);
  };

  const handleSaveNewPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHeadline.trim() || !onAddPost) return;

    const newPost: PagePostInsight = {
      id: "post_" + Math.random().toString(36).slice(2, 9),
      pageId: newCompetitorId || competitors[0]?.id || "comp-1",
      date: new Date().toISOString().split("T")[0] ?? "2026-09-23",
      headline: newHeadline.trim(),
      captionPreview: newCaption.trim() || undefined,
      mediaType: newMediaType,
      likes: Number(newLikes) || 0,
      comments: Number(newComments) || 0,
      growthImpactFollowers: Number(newGrowthImpact) || 0,
      strategyTag: newStrategy.trim(),
      viralScore: Math.min(99, Math.max(70, Math.round((newGrowthImpact / 10) + 70))),
    };

    onAddPost(newPost);
    setIsAddPostModalOpen(false);
    setNewHeadline("");
    setNewCaption("");
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* CABEÇALHO DO RADAR & SELETOR DE PERÍODO */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <Swords className="size-4" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Radar de Concorrentes & O Que as Grandes Fazem
            </h2>
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400 flex items-center gap-1">
              <Flame className="size-3" /> Inteligência Competitiva
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Descubra quantos seguidores os grandes perfis estão ganhando e quais postagens exatas geraram os picos virais.
          </p>
        </div>

        {/* Botoes de Período Diário, 3d, 7d, 15d, 30d, 90d */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-secondary/50 border border-border/70 text-xs">
          {PERIODS.map((p) => {
            const isSelected = selectedPeriod === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPeriod(p.id)}
                className={`py-1.5 px-3 rounded-lg font-medium transition ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. TABELA & CARDS: QUANTOS SEGUIDORES CADA CONCORRENTE GANHOU NO PERÍODO */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-primary" />
            Ganho de Seguidores por Concorrente ({getPeriodLabel(selectedPeriod)})
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Ordenado pelo maior ganho no período
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {competitorMetrics.map(({ comp, metrics, periodGrowth, periodPercent }, idx) => {
            const isLeader = idx === 0;
            return (
              <div
                key={comp.id}
                className={`relative rounded-xl border p-4 transition-all ${
                  isLeader
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-md"
                    : "border-border/80 bg-secondary/20 hover:bg-secondary/40"
                }`}
              >
                {isLeader && (
                  <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground shadow-xs">
                    Maior Crescimento
                  </span>
                )}

                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      {comp.name}
                    </h4>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      @{comp.handle}
                    </p>
                  </div>
                  <span className="rounded-md bg-secondary/80 border border-border px-2 py-0.5 text-[10px] text-muted-foreground uppercase font-semibold">
                    {comp.platform}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      Seguidores Atuais
                    </span>
                    <span className="font-semibold text-foreground font-mono">
                      {formatFollowers(metrics.currentFollowers)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      Ganho no Período
                    </span>
                    <span
                      className={`font-semibold font-mono flex items-center gap-0.5 ${
                        periodGrowth >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatGrowth(periodGrowth)} ({formatPercent(periodPercent)})
                    </span>
                  </div>
                </div>

                {comp.niche && (
                  <p className="text-[10px] text-muted-foreground/80 mt-2 truncate">
                    Nicho: <span className="text-foreground/90 font-medium">{comp.niche}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. POSTAGENS VENCEDORAS DOS CONCORRENTES: "O QUE AS GRANDES FAZEM" */}
      <div className="space-y-4 pt-4 border-t border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sparkles className="size-4 text-amber-400" />
              Postagens que Impulsionaram o Crescimento das Grandes
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identifique as manchetes, formatos e ganchos vencedores para modelar no Imagem Flash ou Video Flash.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => setIsAddPostModalOpen(true)}
            className="h-8 text-xs font-semibold shrink-0"
          >
            <Plus className="size-3.5 mr-1" /> Adicionar Referência Observada
          </Button>
        </div>

        {/* Galeria de Postagens Inteligentes */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const page = competitors.find((c) => c.id === post.pageId) || {
              name: "Concorrente",
              handle: "concorrente",
            };

            return (
              <div
                key={post.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-secondary/20 p-4 transition hover:border-primary/50 hover:bg-secondary/35 shadow-sm"
              >
                <div>
                  {/* Topo do Card do Post */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[11px] font-mono font-semibold text-primary">
                      @{page.handle}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">
                        Score Viral {post.viralScore || 92}
                      </span>
                      <span className="rounded-md bg-secondary/80 border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground uppercase font-semibold">
                        {post.mediaType}
                      </span>
                    </div>
                  </div>

                  {/* Headline do Post */}
                  <h4 className="text-sm font-bold text-foreground leading-snug mb-2 group-hover:text-primary transition-colors">
                    "{post.headline}"
                  </h4>

                  {post.captionPreview && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {post.captionPreview}
                    </p>
                  )}

                  {/* Tag da Estratégia Identificada */}
                  {post.strategyTag && (
                    <div className="mb-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        ⚡ Estratégia: {post.strategyTag}
                      </span>
                    </div>
                  )}

                  {/* Métricas de Engajamento e Impacto */}
                  <div className="grid grid-cols-3 gap-1 py-2 px-2.5 rounded-lg bg-black/30 border border-border/50 text-[11px] text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <Heart className="size-3 text-rose-400" />
                      <span>{formatFollowers(post.likes)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageCircle className="size-3 text-sky-400" />
                      <span>{formatFollowers(post.comments)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowUpRight className="size-3 text-emerald-400" />
                      <span className="font-semibold text-emerald-400">
                        +{post.growthImpactFollowers || 400} seg.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação para Modelar Imediatamente */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleModelInImageFlash(post.headline)}
                    className="flex-1 h-8 text-[11px] font-semibold"
                    title="Modelar esta manchete na página Imagem Flash"
                  >
                    <FileImage className="size-3.5 mr-1 text-emerald-400" /> Modelar Imagem
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleModelInVideoFlash(post.headline)}
                    className="h-8 text-[11px] px-2.5"
                    title="Modelar no Video Flash"
                  >
                    <Video className="size-3.5 text-primary" />
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopyText(post.id, post.headline)}
                    className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    title="Copiar texto"
                  >
                    {copiedPostId === post.id ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL PARA ADICIONAR NOVO POST DE CONCORRENTE */}
      {isAddPostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Cadastrar Post de Concorrente
              </h3>
              <button
                type="button"
                onClick={() => setIsAddPostModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewPost} className="space-y-3.5">
              <div>
                <Label className="text-xs font-semibold mb-1 block">
                  Página Concorrente
                </Label>
                <select
                  value={newCompetitorId}
                  onChange={(e) => setNewCompetitorId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {competitors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (@{c.handle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold mb-1 block">
                  Manchete / Título Chamativo
                </Label>
                <Input
                  value={newHeadline}
                  onChange={(e) => setNewHeadline(e.target.value)}
                  placeholder="Ex: 5 erros que você comete todo dia com seu pet"
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold mb-1 block">
                  Legenda / Contexto
                </Label>
                <textarea
                  rows={2}
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Resumo ou gancho utilizado na legenda do post..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold mb-1 block">
                    Tipo de Mídia
                  </Label>
                  <select
                    value={newMediaType}
                    onChange={(e) => setNewMediaType(e.target.value as any)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="image">Imagem Única</option>
                    <option value="carousel">Carrossel (Mais Salvos)</option>
                    <option value="video">Vídeo / Reels</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold mb-1 block">
                    Estratégia Identificada
                  </Label>
                  <Input
                    value={newStrategy}
                    onChange={(e) => setNewStrategy(e.target.value)}
                    placeholder="Ex: Curiosidade, Pergunta"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Curtidas
                  </Label>
                  <Input
                    type="number"
                    value={newLikes}
                    onChange={(e) => setNewLikes(Number(e.target.value))}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Comentários
                  </Label>
                  <Input
                    type="number"
                    value={newComments}
                    onChange={(e) => setNewComments(Number(e.target.value))}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Seguidores Estimados
                  </Label>
                  <Input
                    type="number"
                    value={newGrowthImpact}
                    onChange={(e) => setNewGrowthImpact(Number(e.target.value))}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsAddPostModalOpen(false)}
                  className="h-8 text-xs"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="h-8 text-xs font-semibold">
                  Salvar Referência
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
