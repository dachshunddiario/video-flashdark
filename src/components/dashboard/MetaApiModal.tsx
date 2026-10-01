import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { testMetaConnection, type MetaConnectionResult } from "@/lib/social-api";
import { type ConnectedProfileData, type MetaApiConfig } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
  KeyRound,
  Sparkles,
  Users,
  Image as ImageIcon,
  ArrowRight,
  Instagram,
  Check,
  Square,
  CheckSquare2,
} from "lucide-react";

// Ícone simples para Facebook
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface MetaApiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: MetaApiConfig | null;
  onSaveConfig: (
    config: MetaApiConfig | null,
    profileData?: ConnectedProfileData,
    allDiscovered?: ConnectedProfileData[],
  ) => void;
}

export function MetaApiModal({
  open,
  onOpenChange,
  config,
  onSaveConfig,
}: MetaApiModalProps) {
  const [accessToken, setAccessToken] = useState(config?.accessToken || "");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<MetaConnectionResult | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"instagram" | "facebook">("instagram");

  const isConnected = Boolean(config?.accessToken && config?.instagramAccountId);

  // Lista de contas encontradas pela Meta Graph API
  const accounts: ConnectedProfileData[] = testResult?.accounts || [];

  // Separa contas estritamente entre Instagram e Facebook sem duplicidade
  const instagramAccounts = useMemo(() => {
    const seen = new Set<string>();
    return accounts.filter((a) => {
      if (a.platform !== "instagram") return false;
      const key = (a.id || a.username).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [accounts]);

  const facebookAccounts = useMemo(() => {
    const seen = new Set<string>();
    return accounts.filter((a) => {
      if (a.platform !== "facebook") return false;
      const key = (a.id || a.username).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [accounts]);

  // Ao receber novos resultados, seleciona automaticamente todas as contas de Instagram encontradas
  useEffect(() => {
    if (accounts.length > 0) {
      const igIds = accounts
        .filter((a) => a.platform === "instagram")
        .map((a) => a.id);

      if (igIds.length > 0) {
        setSelectedAccountIds(igIds);
        setActiveTab("instagram");
      } else {
        const fbIds = accounts
          .filter((a) => a.platform === "facebook")
          .map((a) => a.id);
        setSelectedAccountIds(fbIds);
        setActiveTab("facebook");
      }
    }
  }, [accounts]);

  const toggleSelectAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAllCurrentTab = (list: ConnectedProfileData[]) => {
    const listIds = list.map((a) => a.id);
    setSelectedAccountIds((prev) => {
      const merged = new Set([...prev, ...listIds]);
      return Array.from(merged);
    });
  };

  const handleDeselectAllCurrentTab = (list: ConnectedProfileData[]) => {
    const listIds = new Set(list.map((a) => a.id));
    setSelectedAccountIds((prev) => prev.filter((id) => !listIds.has(id)));
  };

  const handleSearchPages = async () => {
    if (!accessToken.trim()) {
      setTestResult({
        success: false,
        message: "Por favor, cole o seu Access Token primeiro.",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testMetaConnection({
        accessToken: accessToken.trim(),
      });

      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Erro inesperado ao consultar a Meta API.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Sincroniza todas as contas marcadas pelo usuário
  const handleSaveSelected = () => {
    const seen = new Set<string>();
    const selectedProfiles = accounts.filter((a) => {
      if (!selectedAccountIds.includes(a.id)) return false;
      const key = `${a.platform}:${(a.id || a.username).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (selectedProfiles.length === 0) {
      return;
    }

    const primary = selectedProfiles[0]!;
    const newConfig: MetaApiConfig = {
      accessToken: accessToken.trim(),
      instagramAccountId: primary.id,
      accountUsername: primary.username,
      accountName: primary.name,
      avatarUrl: primary.avatarUrl,
      followers: primary.followers,
      posts: primary.posts,
      biography: primary.biography,
      connectedAt: new Date().toISOString(),
    };

    onSaveConfig(newConfig, primary, selectedProfiles);
    onOpenChange(false);
  };

  const handleDisconnect = () => {
    onSaveConfig(null);
    setAccessToken("");
    setTestResult(null);
    setSelectedAccountIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-pink-500/10 p-2 text-pink-400 border border-pink-500/20">
              <Zap className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Conexão Oficial com a Meta API</DialogTitle>
              <DialogDescription className="text-xs">
                Visualize suas páginas separadas em abas e marque quais você deseja sincronizar no Dashboard.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* FEEDBACK DE ERRO */}
        {testResult && !testResult.success && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/15 p-4 text-xs text-destructive space-y-2 transition animate-in fade-in">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <XCircle className="size-5 shrink-0" />
              <span>Falha na Conexão</span>
            </div>
            <p className="leading-relaxed whitespace-pre-line text-foreground/90">
              {testResult.message}
            </p>
          </div>
        )}

        {/* Status Atual se não buscou ainda */}
        {!testResult && (
          <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status da Conexão
              </span>
              {isConnected ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  Conectado Oficialmente
                  {config?.accountUsername ? ` (@${config.accountUsername})` : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground border-border gap-1.5">
                  <Info className="size-3.5" />
                  Nenhum Token Ativo
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isConnected
                ? `Conexão ativa com o ID: ${config?.instagramAccountId} (@${config?.accountUsername || ""}). Você pode buscar novas páginas a qualquer momento abaixo.`
                : "Cole seu Access Token abaixo e clique em 'Buscar Páginas'. Todas as suas contas serão organizadas em abas do Instagram e Facebook para você marcar quais deseja sincronizar."}
            </p>
          </div>
        )}

        {/* Formulário: Token de Acesso */}
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="meta-token" className="text-xs font-medium">
                Meta User / Page Access Token *
              </Label>
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
              >
                Abrir Graph API Explorer <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="meta-token"
                type="password"
                placeholder="Cole seu token aqui (começa com EAAB... ou EAA...)"
                value={accessToken}
                onChange={(e) => {
                  setAccessToken(e.target.value);
                  if (testResult) setTestResult(null);
                }}
                className="pl-9 font-mono text-xs"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
              <p className="text-[11px] text-muted-foreground">
                Permissões recomendadas: <code className="text-primary font-mono text-[10px]">instagram_basic</code>, <code className="text-primary font-mono text-[10px]">pages_show_list</code>.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isTesting || !accessToken.trim()}
                onClick={handleSearchPages}
                className="h-8 text-xs gap-1.5 shrink-0 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
              >
                {isTesting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Buscar Páginas do Token
              </Button>
            </div>
          </div>
        </div>

        {/* SEÇÃO PRINCIPAL: ABAS SEPARADAS (INSTAGRAM E FACEBOOK) COM CARDS SELECIONÁVEIS */}
        {accounts.length > 0 && (
          <div className="space-y-3 pt-2 transition animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Selecione as páginas para sincronizar
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Marque as contas que você quer adicionar no Dashboard.
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-mono font-medium">
                {selectedAccountIds.length} de {accounts.length} selecionada(s)
              </Badge>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-secondary/50 p-1 rounded-xl h-10">
                <TabsTrigger
                  value="instagram"
                  className="gap-2 text-xs font-semibold data-[state=active]:bg-pink-500/15 data-[state=active]:text-pink-400 data-[state=active]:border data-[state=active]:border-pink-500/30 rounded-lg"
                >
                  <Instagram className="size-4" />
                  Instagram ({instagramAccounts.length})
                </TabsTrigger>
                <TabsTrigger
                  value="facebook"
                  className="gap-2 text-xs font-semibold data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400 data-[state=active]:border data-[state=active]:border-blue-500/30 rounded-lg"
                >
                  <FacebookIcon className="size-3.5" />
                  Facebook ({facebookAccounts.length})
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: INSTAGRAM */}
              <TabsContent value="instagram" className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Contas comerciais do Instagram vinculadas:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAllCurrentTab(instagramAccounts)}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      Marcar Todas
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleDeselectAllCurrentTab(instagramAccounts)}
                      className="text-[11px] text-muted-foreground hover:underline"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                </div>

                {instagramAccounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center bg-secondary/15">
                    <p className="text-xs text-muted-foreground">
                      Nenhuma conta comercial do Instagram vinculada encontrada neste token.
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Verifique se a sua conta do Instagram é Profissional (Comercial ou Criador) e está vinculada à sua Página do Facebook.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {instagramAccounts.map((acc) => {
                      const isSelected = selectedAccountIds.includes(acc.id);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => toggleSelectAccount(acc.id)}
                          className={`flex items-center gap-3.5 p-3 rounded-xl border transition cursor-pointer select-none ${
                            isSelected
                              ? "border-emerald-500/70 bg-emerald-950/40 shadow-sm"
                              : "border-border/80 bg-card hover:border-primary/40 hover:bg-secondary/20"
                          }`}
                        >
                          {/* Checkbox visual */}
                          <div
                            className={`size-5 rounded-md flex items-center justify-center shrink-0 border transition ${
                              isSelected
                                ? "bg-emerald-500 border-emerald-500 text-emerald-950 font-bold"
                                : "border-border bg-background/80"
                            }`}
                          >
                            {isSelected && <Check className="size-3.5 stroke-[3]" />}
                          </div>

                          {/* Foto de perfil */}
                          {acc.avatarUrl ? (
                            <img
                              src={acc.avatarUrl}
                              alt={acc.username}
                              className="size-11 rounded-full object-cover border border-border shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="size-11 rounded-full bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400 shrink-0">
                              <Instagram className="size-5" />
                            </div>
                          )}

                          {/* Detalhes da conta */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground truncate">
                                {acc.name || acc.username}
                              </span>
                              <Badge className="bg-pink-500/15 text-pink-400 border-pink-500/30 text-[10px] py-0 px-1.5">
                                @{acc.username}
                              </Badge>
                            </div>
                            {acc.pageName && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                Página: <strong className="text-foreground/80">{acc.pageName}</strong>
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] font-mono text-foreground font-medium">
                                <Users className="size-3 text-primary" />
                                {(acc.followers ?? 0).toLocaleString("pt-BR")} seguidores
                              </span>
                              {acc.posts > 0 && (
                                <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] font-mono text-foreground font-medium">
                                  <ImageIcon className="size-3 text-primary" />
                                  {acc.posts} posts
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ABA 2: FACEBOOK */}
              <TabsContent value="facebook" className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Páginas do Facebook encontradas:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAllCurrentTab(facebookAccounts)}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      Marcar Todas
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleDeselectAllCurrentTab(facebookAccounts)}
                      className="text-[11px] text-muted-foreground hover:underline"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                </div>

                {facebookAccounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center bg-secondary/15">
                    <p className="text-xs text-muted-foreground">
                      Todas as suas páginas do Facebook já estão vinculadas a contas do Instagram (veja na aba Instagram)!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {facebookAccounts.map((acc) => {
                      const isSelected = selectedAccountIds.includes(acc.id);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => toggleSelectAccount(acc.id)}
                          className={`flex items-center gap-3.5 p-3 rounded-xl border transition cursor-pointer select-none ${
                            isSelected
                              ? "border-emerald-500/70 bg-emerald-950/40 shadow-sm"
                              : "border-border/80 bg-card hover:border-primary/40 hover:bg-secondary/20"
                          }`}
                        >
                          {/* Checkbox visual */}
                          <div
                            className={`size-5 rounded-md flex items-center justify-center shrink-0 border transition ${
                              isSelected
                                ? "bg-emerald-500 border-emerald-500 text-emerald-950 font-bold"
                                : "border-border bg-background/80"
                            }`}
                          >
                            {isSelected && <Check className="size-3.5 stroke-[3]" />}
                          </div>

                          {/* Foto / Ícone */}
                          {acc.avatarUrl ? (
                            <img
                              src={acc.avatarUrl}
                              alt={acc.name}
                              className="size-11 rounded-full object-cover border border-border shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="size-11 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                              <FacebookIcon className="size-5" />
                            </div>
                          )}

                          {/* Detalhes */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground truncate">
                                {acc.name}
                              </span>
                              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] py-0 px-1.5">
                                Facebook
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              Página ID: <span className="font-mono text-foreground/80">{acc.id}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* BOTÃO DE SINCRONIZAÇÃO DAS PÁGINAS SELECIONADAS */}
            <div className="pt-2 flex items-center justify-between border-t border-border/60">
              <span className="text-xs text-muted-foreground font-medium">
                {selectedAccountIds.length === 0
                  ? "Nenhuma página marcada"
                  : `${selectedAccountIds.length} página(s) pronta(s) para sincronizar`}
              </span>
              <Button
                type="button"
                disabled={selectedAccountIds.length === 0}
                onClick={handleSaveSelected}
                className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400 font-semibold text-xs gap-1.5 shadow"
              >
                <CheckCircle2 className="size-4" />
                <span>Sincronizar Páginas Selecionadas ({selectedAccountIds.length})</span>
              </Button>
            </div>
          </div>
        )}

        {/* Guia Rápido */}
        <div className="rounded-xl border border-border/70 bg-secondary/15 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <ShieldCheck className="size-4 text-emerald-400" />
            Como obter o Token no Graph API Explorer
          </div>
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4 leading-relaxed">
            <li>
              Acesse o{" "}
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline inline-flex items-center gap-0.5 font-medium"
              >
                Graph API Explorer <ExternalLink className="size-2.5" />
              </a>
              .
            </li>
            <li>
              Em <strong>User or Page</strong>, selecione o seu Usuário ou Página desejada.
            </li>
            <li>
              Adicione as permissões: <code className="bg-background/80 px-1 py-0.5 rounded text-foreground font-mono text-[10px]">instagram_basic</code> e <code className="bg-background/80 px-1 py-0.5 rounded text-foreground font-mono text-[10px]">pages_show_list</code>.
            </li>
            <li>
              Clique em <strong>Generate Access Token</strong>, copie e cole aqui acima para ver todas as suas páginas nas abas!
            </li>
          </ol>
        </div>

        <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          {isConnected && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              className="text-xs"
            >
              Desconectar Meta
            </Button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isTesting || !accessToken.trim()}
              onClick={handleSearchPages}
              className="bg-primary text-primary-foreground text-xs gap-1.5 font-medium"
            >
              {isTesting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Zap className="size-3.5" />
                  Buscar Páginas
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
