import { useState } from "react";
import { Plus, Instagram, AlertCircle, Sparkles, Loader2, CheckCircle2, Zap } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { uid } from "@/lib/local-store";
import { lookupInstagramProfile } from "@/lib/social-api";
import {
  type FollowerSnapshot,
  type InstagramProfileLookupResult,
  type MetaApiConfig,
  type Platform,
  type SocialPage,
} from "@/lib/types";

// Ícone simples para Facebook
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface AddPageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCompetitorDefault?: boolean;
  competitorsCount: number;
  metaConfig?: MetaApiConfig | null;
  onOpenMetaSettings?: () => void;
  onSave: (page: SocialPage, initialSnapshot?: FollowerSnapshot) => void;
}

export function AddPageModal({
  open,
  onOpenChange,
  isCompetitorDefault = false,
  competitorsCount,
  metaConfig,
  onOpenMetaSettings,
  onSave,
}: AddPageModalProps) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [isCompetitor, setIsCompetitor] = useState(isCompetitorDefault);
  const [initialFollowers, setInitialFollowers] = useState("");
  const [initialPosts, setInitialPosts] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Estado da busca automática
  const [isSearching, setIsSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<InstagramProfileLookupResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const isLimitReached = isCompetitor && competitorsCount >= 10;

  // Busca perfil automaticamente no Instagram usando Meta Graph API ou Modo Referência
  const handleAutoLookup = async () => {
    const clean = handle.trim().replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
    if (!clean) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const data = await lookupInstagramProfile(clean, metaConfig);
      if (data.success) {
        setLookupResult(data);
        setName(data.name || clean);
        setInitialFollowers(String(data.followers || 0));
        setInitialPosts(String(data.posts || 0));
        setHandle(data.handle);
      } else {
        setSearchError(data.message || "Não foi possível carregar os dados automáticos.");
        if (!name.trim()) {
          const autoName = clean
            .split(/[._]/)
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          setName(autoName);
        }
      }
    } catch (err: any) {
      setSearchError(err.message || "Erro ao consultar perfil.");
      if (!name.trim()) {
        const autoName = clean
          .split(/[._]/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        setName(autoName);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDownHandle = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAutoLookup();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHandle = handle.trim().replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
    if (!cleanHandle) return;
    if (isLimitReached) return;

    const pageId = uid();
    const effectiveName =
      name.trim() ||
      lookupResult?.name ||
      cleanHandle
        .split(/[._]/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

    const newPage: SocialPage = {
      id: pageId,
      name: effectiveName,
      handle: cleanHandle,
      platform,
      isCompetitor,
      createdAt: new Date().toISOString(),
      avatarUrl: lookupResult?.avatarUrl,
      biography: lookupResult?.biography,
      postsCount: initialPosts ? parseInt(initialPosts.replace(/\D/g, ""), 10) : lookupResult?.posts,
      followersCount: initialFollowers
        ? parseInt(initialFollowers.replace(/\D/g, ""), 10)
        : lookupResult?.followers,
      verified: lookupResult?.verified,
    };

    let snapshot: FollowerSnapshot | undefined;
    if (initialFollowers.trim() || lookupResult?.followers) {
      const followersNum = initialFollowers
        ? parseInt(initialFollowers.replace(/\D/g, ""), 10)
        : lookupResult?.followers;
      const postsNum = initialPosts
        ? parseInt(initialPosts.replace(/\D/g, ""), 10)
        : lookupResult?.posts;

      if (followersNum !== undefined && !isNaN(followersNum)) {
        snapshot = {
          id: uid(),
          pageId,
          date,
          followers: followersNum,
          posts: postsNum !== undefined && !isNaN(postsNum) ? postsNum : undefined,
        };
      }
    }

    onSave(newPage, snapshot);
    setName("");
    setHandle("");
    setInitialFollowers("");
    setInitialPosts("");
    setLookupResult(null);
    setSearchError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isCompetitor ? "Adicionar Concorrente" : "Cadastrar Minha Página"}
            </DialogTitle>
            <DialogDescription>
              {isCompetitor
                ? `Monitore páginas concorrentes para comparar crescimento (${competitorsCount}/10 cadastradas).`
                : "Acompanhe as métricas oficiais de crescimento da sua página."}
            </DialogDescription>
          </DialogHeader>

          {isLimitReached && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>Limite máximo de 10 concorrentes atingido. Remova um concorrente para adicionar outro.</span>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {/* Tipo de Página */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Tipo de Página</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCompetitor(false)}
                  className={`flex items-center justify-center rounded-lg border p-2.5 text-xs font-medium transition ${
                    !isCompetitor
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  Minha Página
                </button>
                <button
                  type="button"
                  onClick={() => setIsCompetitor(true)}
                  className={`flex items-center justify-center rounded-lg border p-2.5 text-xs font-medium transition ${
                    isCompetitor
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  Concorrente ({competitorsCount}/10)
                </button>
              </div>
            </div>

            {/* Plataforma */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Plataforma</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPlatform("instagram")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition ${
                    platform === "instagram"
                      ? "border-pink-500/50 bg-pink-500/10 text-pink-400 font-semibold"
                      : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  <Instagram className="size-4" /> Instagram
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("facebook")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition ${
                    platform === "facebook"
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400 font-semibold"
                      : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  <FacebookIcon className="size-4" /> Facebook
                </button>
              </div>
            </div>

            {/* Handle do Instagram com Busca Automática */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="page-handle" className="text-xs font-medium">
                  @Usuário ou URL do Perfil *
                </Label>
                {metaConfig?.accessToken ? (
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 gap-1 py-0">
                    <CheckCircle2 className="size-2.5" /> Meta API Ativa
                  </Badge>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenMetaSettings}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                  >
                    <Zap className="size-2.5" /> Conectar Meta API
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="page-handle"
                    placeholder="Ex: dachshunddiario ou @seufilmefavorito"
                    value={handle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHandle(val);
                      if (!name) {
                        const clean = val.trim().replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
                        if (clean) {
                          const auto = clean
                            .split(/[._]/)
                            .filter(Boolean)
                            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(" ");
                          setName(auto);
                        }
                      }
                    }}
                    onKeyDown={handleKeyDownHandle}
                    required
                    className="text-sm font-medium"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleAutoLookup}
                  disabled={isSearching || !handle.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shrink-0"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Buscar no Instagram
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Digite o @ da página e clique em "Buscar no Instagram" (ou dê Enter) para carregar seguidores e dados oficiais ou de referência.
              </p>
            </div>

            {/* Card de Prévia do Perfil Encontrado */}
            {lookupResult && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5 transition animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-3">
                  {lookupResult.avatarUrl ? (
                    <img
                      src={lookupResult.avatarUrl}
                      alt={lookupResult.name}
                      className="size-11 rounded-full object-cover border border-primary/40 shadow-sm"
                    />
                  ) : (
                    <div className="size-11 rounded-full bg-secondary flex items-center justify-center font-bold text-foreground">
                      {lookupResult.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {lookupResult.name}
                      </span>
                      {lookupResult.verified && (
                        <CheckCircle2 className="size-3.5 fill-blue-500 text-background shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground block truncate">
                      @{lookupResult.handle}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 font-medium ${
                      lookupResult.source === "meta_graph_api"
                        ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                        : lookupResult.source === "reference_mode" || lookupResult.isReference
                          ? "border-purple-500/40 text-purple-300 bg-purple-500/15"
                          : "border-border text-muted-foreground bg-secondary/40"
                    }`}
                  >
                    {lookupResult.source === "meta_graph_api"
                      ? "Meta API Oficial"
                      : lookupResult.source === "reference_mode" || lookupResult.isReference
                        ? "Modo Referência · Concorrente"
                        : "Modo Demonstração"}
                  </Badge>
                </div>

                {/* Aviso amigável quando carregado em Modo Referência */}
                {(lookupResult.source === "reference_mode" || lookupResult.isReference) && (
                  <div className="flex items-start gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 p-2.5 text-[11px] text-purple-200">
                    <Sparkles className="size-3.5 shrink-0 text-purple-400 mt-0.5" />
                    <span>
                      Perfil importado como <strong>Referência de Comparação</strong>! Os seguidores e posts foram pré-carregados para benchmarking. Você pode confirmar ou ajustar os valores reais abaixo antes de salvar.
                    </span>
                  </div>
                )}

                {/* Métricas do Perfil (reativas ao que o usuário digita nos inputs abaixo) */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-xs">
                  <div className="rounded-lg bg-background/50 p-2 text-center">
                    <span className="text-muted-foreground block text-[10px]">Seguidores</span>
                    <strong className="text-sm font-bold text-foreground">
                      {(initialFollowers ? parseInt(initialFollowers, 10) : lookupResult.followers).toLocaleString("pt-BR")}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-background/50 p-2 text-center">
                    <span className="text-muted-foreground block text-[10px]">Publicações</span>
                    <strong className="text-sm font-bold text-foreground">
                      {(initialPosts ? parseInt(initialPosts, 10) : lookupResult.posts).toLocaleString("pt-BR")}
                    </strong>
                  </div>
                </div>

                {lookupResult.biography && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                    "{lookupResult.biography}"
                  </p>
                )}

                {lookupResult.message && lookupResult.source === "meta_graph_api" && (
                  <p className="text-[10px] text-primary/80 pt-0.5">
                    {lookupResult.message}
                  </p>
                )}
              </div>
            )}

            {searchError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>Aviso sobre consulta automática</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  {searchError}
                </p>
                <p className="text-[10px] text-muted-foreground pt-1">
                  💡 Você pode preencher o nome e os seguidores manualmente nos campos abaixo para adicionar e comparar normalmente no gráfico.
                </p>
              </div>
            )}

            {/* Nome da Página */}
            <div className="space-y-1.5">
              <Label htmlFor="page-name" className="text-xs font-medium">
                Nome de Exibição da Página *
              </Label>
              <Input
                id="page-name"
                placeholder="Ex: Seu Filme Favorito ou Dachshund Diário"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Seguidores e Posts Iniciais */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="page-followers" className="text-xs font-medium">
                  Seguidores Atuais
                </Label>
                <Input
                  id="page-followers"
                  placeholder="Ex: 48500"
                  inputMode="numeric"
                  value={initialFollowers}
                  onChange={(e) => setInitialFollowers(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="page-posts" className="text-xs font-medium">
                  Total de Posts
                </Label>
                <Input
                  id="page-posts"
                  placeholder="Ex: 320"
                  inputMode="numeric"
                  value={initialPosts}
                  onChange={(e) => setInitialPosts(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>

            {/* Data da Medição */}
            <div className="space-y-1.5">
              <Label htmlFor="page-date" className="text-xs font-medium">
                Data da Medição
              </Label>
              <Input
                id="page-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
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
              disabled={!handle.trim() || isLimitReached}
            >
              <Plus className="mr-1.5 size-4" />
              {isCompetitor ? "Adicionar Concorrente" : "Cadastrar Página"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
