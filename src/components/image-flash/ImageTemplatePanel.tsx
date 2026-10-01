import React, { useState, useRef } from "react";
import {
  type TemplateVisual,
  GOOGLE_FONTS_CATALOG,
} from "@/lib/types";
import {
  User,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  Upload,
  CheckCircle2,
  Trash2,
  Palette,
  ShieldCheck,
  FolderOpen,
  Save,
  Check,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface ImageTemplatePanelProps {
  template: TemplateVisual;
  onUpdateTemplate: (updated: TemplateVisual) => void;
  onSaveTemplate?: (name: string) => Promise<void>;
  onLoadTemplate?: (template: TemplateVisual) => void;
  savedTemplates?: { name: string; template: TemplateVisual }[];
  onDeleteTemplate?: (name: string) => Promise<void>;
  className?: string;
}

const PRESET_BG_COLORS = [
  { name: "Dark Chic", color: "#0D0E15", desc: "Preto azulado elegante" },
  { name: "Preto Absoluto", color: "#000000", desc: "Contraste máximo OLED" },
  { name: "Cinza Grafite", color: "#18181B", desc: "Moderno e minimalista" },
  { name: "Azul Meia-Noite", color: "#0B132B", desc: "Autoridade e seriedade" },
  { name: "Roxo Místico", color: "#1E1035", desc: "Engajamento e mistério" },
  { name: "Verde Floresta", color: "#0B2017", desc: "Orgânico e bem-estar" },
  { name: "Branco Editorial", color: "#FFFFFF", desc: "High Key limpo e claro" },
  { name: "Creme Suave", color: "#F4F4F0", desc: "Estilo revista contemporânea" },
];

export function ImageTemplatePanel({
  template,
  onUpdateTemplate,
  onSaveTemplate,
  savedTemplates = [],
  onDeleteTemplate,
  className = "",
}: ImageTemplatePanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"header" | "headline" | "sublegend" | "watermark" | "background" | "saved">("header");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const profileFileInputRef = useRef<HTMLInputElement>(null);
  const watermarkFileInputRef = useRef<HTMLInputElement>(null);

  const handleProfileImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpdateTemplate({
      ...template,
      profilePic: {
        ...template.profilePic,
        enabled: true,
        imageUrl: url,
      },
    });
  };

  const handleWatermarkImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpdateTemplate({
      ...template,
      watermark: {
        ...template.watermark,
        enabled: true,
        type: "image",
        imageUrl: url,
      },
    });
  };

  const handleSave = async () => {
    if (!onSaveTemplate) return;
    const name = newTemplateName.trim() || template.name || "Template Imagem Flash";
    setIsSaving(true);
    try {
      await onSaveTemplate(name);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      setNewTemplateName("");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`flex flex-col h-full space-y-4 ${className}`}>
      {/* Sub-abas do Template Simplificado */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 bg-secondary/50 rounded-xl border border-border/70 text-[11px] font-medium">
        <button
          type="button"
          onClick={() => setActiveSubTab("header")}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition ${
            activeSubTab === "header"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <User className="size-3.5" /> Cabeçalho
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("headline")}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition ${
            activeSubTab === "headline"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Type className="size-3.5" /> Headline
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("sublegend")}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition ${
            activeSubTab === "sublegend"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <AlignLeft className="size-3.5" /> Sublegenda
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("watermark")}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition ${
            activeSubTab === "watermark"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <ShieldCheck className="size-3.5" /> Marca D'água
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("background")}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition ${
            activeSubTab === "background"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Palette className="size-3.5" /> Fundo
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("saved")}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition ${
            activeSubTab === "saved"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <FolderOpen className="size-3.5" /> Salvos
        </button>
      </div>

      {/* Conteúdo da Sub-aba Ativa */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        {/* =========================================
            1. CABEÇALHO (Foto de Perfil + Nome da Página)
        ========================================= */}
        {activeSubTab === "header" && (
          <div className="space-y-4">
            {/* Foto de Perfil */}
            <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <User className="size-3.5 text-primary" /> Foto de Perfil
                </Label>
                <Switch
                  checked={template.profilePic.enabled}
                  onCheckedChange={(checked) =>
                    onUpdateTemplate({
                      ...template,
                      profilePic: { ...template.profilePic, enabled: checked },
                    })
                  }
                />
              </div>

              {template.profilePic.enabled && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div
                      className="size-14 rounded-full overflow-hidden border border-border bg-black/40 flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80 transition"
                      onClick={() => profileFileInputRef.current?.click()}
                    >
                      {template.profilePic.imageUrl ? (
                        <img
                          src={template.profilePic.imageUrl}
                          alt="Perfil"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Upload className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => profileFileInputRef.current?.click()}
                        className="text-xs w-full"
                      >
                        <Upload className="size-3.5 mr-1.5" /> Selecionar Foto
                      </Button>
                      <input
                        ref={profileFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleProfileImageUpload}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Recomendado: imagem quadrada ou logo em PNG/JPG
                      </p>
                    </div>
                  </div>

                  {/* Tamanho e Borda da Foto */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">
                        Tamanho ({template.profilePic.size}px)
                      </span>
                      <Slider
                        min={30}
                        max={180}
                        step={2}
                        value={[template.profilePic.size]}
                        onValueChange={([val]) =>
                          onUpdateTemplate({
                            ...template,
                            profilePic: { ...template.profilePic, size: val ?? 80 },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">
                        Zoom ({template.profilePic.zoom ?? 100}%)
                      </span>
                      <Slider
                        min={60}
                        max={200}
                        step={5}
                        value={[template.profilePic.zoom ?? 100]}
                        onValueChange={([val]) =>
                          onUpdateTemplate({
                            ...template,
                            profilePic: { ...template.profilePic, zoom: val ?? 100 },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Nome da Página & Selo Verificado */}
            <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Type className="size-3.5 text-primary" /> Nome da Página & Badge
                </Label>
                <Switch
                  checked={template.pageName.enabled}
                  onCheckedChange={(checked) =>
                    onUpdateTemplate({
                      ...template,
                      pageName: { ...template.pageName, enabled: checked },
                    })
                  }
                />
              </div>

              {template.pageName.enabled && (
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">
                      Nome da Página / @Arroba
                    </Label>
                    <Input
                      value={template.pageName.text}
                      onChange={(e) =>
                        onUpdateTemplate({
                          ...template,
                          pageName: { ...template.pageName, text: e.target.value },
                        })
                      }
                      placeholder="Ex: @dachshunddiario"
                      className="h-8 text-xs bg-background/60"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 p-2">
                    <span className="text-xs flex items-center gap-1.5">
                      <span className="size-3 rounded-full bg-[#3897F0] inline-block" />
                      Selo de Verificado Oficial
                    </span>
                    <Switch
                      checked={template.badge.enabled}
                      onCheckedChange={(checked) =>
                        onUpdateTemplate({
                          ...template,
                          badge: { ...template.badge, enabled: checked },
                        })
                      }
                    />
                  </div>

                  {/* Fonte, Tamanho e Cor */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1 block">
                        Tamanho da Fonte ({template.pageName.fontSize}px)
                      </Label>
                      <Slider
                        min={14}
                        max={42}
                        step={1}
                        value={[template.pageName.fontSize]}
                        onValueChange={([val]) =>
                          onUpdateTemplate({
                            ...template,
                            pageName: { ...template.pageName, fontSize: val ?? 22 },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1 block">
                        Cor do Nome
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={template.pageName.color || "#FFFFFF"}
                          onChange={(e) =>
                            onUpdateTemplate({
                              ...template,
                              pageName: { ...template.pageName, color: e.target.value },
                            })
                          }
                          className="size-7 rounded cursor-pointer border border-border bg-transparent"
                        />
                        <Input
                          value={template.pageName.color || "#FFFFFF"}
                          onChange={(e) =>
                            onUpdateTemplate({
                              ...template,
                              pageName: { ...template.pageName, color: e.target.value },
                            })
                          }
                          className="h-7 text-[11px] font-mono uppercase bg-background/60"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================
            2. HEADLINE (Manchete / Título / Gancho)
        ========================================= */}
        {activeSubTab === "headline" && (
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Type className="size-3.5 text-primary" /> Headline de Alto Impacto
              </Label>
              <Switch
                checked={template.headline.enabled}
                onCheckedChange={(checked) =>
                  onUpdateTemplate({
                    ...template,
                    headline: { ...template.headline, enabled: checked },
                  })
                }
              />
            </div>

            {template.headline.enabled && (
              <div className="space-y-3 pt-1">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Texto do Título / Pergunta
                  </Label>
                  <textarea
                    rows={2}
                    value={template.headline.text}
                    onChange={(e) =>
                      onUpdateTemplate({
                        ...template,
                        headline: { ...template.headline, text: e.target.value },
                      })
                    }
                    placeholder="Ex: O que o seu cão faz quando você sai de casa?"
                    className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Seletor de Família de Fontes */}
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Fonte da Headline
                  </Label>
                  <select
                    value={template.headline.fontFamily || "'Outfit', sans-serif"}
                    onChange={(e) =>
                      onUpdateTemplate({
                        ...template,
                        headline: { ...template.headline, fontFamily: e.target.value },
                      })
                    }
                    className="w-full h-8 rounded-md border border-input bg-background/80 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {GOOGLE_FONTS_CATALOG.map((font) => (
                      <option key={font.id} value={font.fontFamily}>
                        {font.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tamanho e Cor */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">
                      Tamanho ({template.headline.fontSize}px)
                    </Label>
                    <Slider
                      min={18}
                      max={56}
                      step={1}
                      value={[template.headline.fontSize]}
                      onValueChange={([val]) =>
                        onUpdateTemplate({
                          ...template,
                          headline: { ...template.headline, fontSize: val ?? 32 },
                        })
                      }
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">
                      Cor do Texto
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={template.headline.color || "#FFFFFF"}
                        onChange={(e) =>
                          onUpdateTemplate({
                            ...template,
                            headline: { ...template.headline, color: e.target.value },
                          })
                        }
                        className="size-7 rounded cursor-pointer border border-border bg-transparent"
                      />
                      <Input
                        value={template.headline.color || "#FFFFFF"}
                        onChange={(e) =>
                          onUpdateTemplate({
                            ...template,
                            headline: { ...template.headline, color: e.target.value },
                          })
                        }
                        className="h-7 text-[11px] font-mono uppercase bg-background/60"
                      />
                    </div>
                  </div>
                </div>

                {/* Alinhamento */}
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Alinhamento
                  </Label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["left", "center", "right"] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() =>
                          onUpdateTemplate({
                            ...template,
                            headline: { ...template.headline, align },
                          })
                        }
                        className={`rounded py-1 text-xs flex items-center justify-center transition ${
                          template.headline.align === align
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                        }`}
                      >
                        {align === "left" && <AlignLeft className="size-3.5" />}
                        {align === "center" && <AlignCenter className="size-3.5" />}
                        {align === "right" && <AlignRight className="size-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================
            3. SUBLEGENDA (Contexto e Apoio)
        ========================================= */}
        {activeSubTab === "sublegend" && (
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <AlignLeft className="size-3.5 text-primary" /> Sublegenda / Contexto
              </Label>
              <Switch
                checked={template.subHeadline.enabled}
                onCheckedChange={(checked) =>
                  onUpdateTemplate({
                    ...template,
                    subHeadline: { ...template.subHeadline, enabled: checked },
                  })
                }
              />
            </div>

            {template.subHeadline.enabled && (
              <div className="space-y-3 pt-1">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Texto da Sublegenda
                  </Label>
                  <textarea
                    rows={2}
                    value={template.subHeadline.text}
                    onChange={(e) =>
                      onUpdateTemplate({
                        ...template,
                        subHeadline: { ...template.subHeadline, text: e.target.value },
                      })
                    }
                    placeholder="Ex: Arraste para o lado e confira os detalhes..."
                    className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">
                      Tamanho ({template.subHeadline.fontSize}px)
                    </Label>
                    <Slider
                      min={12}
                      max={36}
                      step={1}
                      value={[template.subHeadline.fontSize]}
                      onValueChange={([val]) =>
                        onUpdateTemplate({
                          ...template,
                          subHeadline: { ...template.subHeadline, fontSize: val ?? 18 },
                        })
                      }
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">
                      Cor
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={template.subHeadline.color || "#A1A1AA"}
                        onChange={(e) =>
                          onUpdateTemplate({
                            ...template,
                            subHeadline: { ...template.subHeadline, color: e.target.value },
                          })
                        }
                        className="size-7 rounded cursor-pointer border border-border bg-transparent"
                      />
                      <Input
                        value={template.subHeadline.color || "#A1A1AA"}
                        onChange={(e) =>
                          onUpdateTemplate({
                            ...template,
                            subHeadline: { ...template.subHeadline, color: e.target.value },
                          })
                        }
                        className="h-7 text-[11px] font-mono uppercase bg-background/60"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================
            4. MARCA D'ÁGUA
        ========================================= */}
        {activeSubTab === "watermark" && (
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" /> Marca D'água Protetora
              </Label>
              <Switch
                checked={template.watermark.enabled}
                onCheckedChange={(checked) =>
                  onUpdateTemplate({
                    ...template,
                    watermark: { ...template.watermark, enabled: checked },
                  })
                }
              />
            </div>

            {template.watermark.enabled && (
              <div className="space-y-3 pt-1">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Texto da Marca D'água
                  </Label>
                  <Input
                    value={template.watermark.text || ""}
                    onChange={(e) =>
                      onUpdateTemplate({
                        ...template,
                        watermark: { ...template.watermark, text: e.target.value, type: "text" },
                      })
                    }
                    placeholder="Ex: @seuperfil"
                    className="h-8 text-xs bg-background/60"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">
                    Opacidade ({template.watermark.opacity ?? 60}%)
                  </span>
                  <Slider
                    min={10}
                    max={100}
                    step={5}
                    value={[template.watermark.opacity ?? 60]}
                    onValueChange={([val]) =>
                      onUpdateTemplate({
                        ...template,
                        watermark: { ...template.watermark, opacity: val ?? 60 },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================
            5. FUNDO (Cores Predefinidas + Seletor Hexadecimal)
        ========================================= */}
        {activeSubTab === "background" && (
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Palette className="size-3.5 text-primary" /> Cor de Fundo do Post
              </Label>
              <div className="flex items-center gap-2">
                <div
                  className="size-5 rounded-md border border-border shadow-xs"
                  style={{ backgroundColor: template.background?.color || "#0D0E15" }}
                />
                <span className="font-mono text-xs text-foreground font-semibold">
                  {template.background?.color || "#0D0E15"}
                </span>
              </div>
            </div>

            {/* Cores Pré-fixadas Recomendadas */}
            <div className="space-y-2">
              <span className="text-[10px] text-muted-foreground block font-medium">
                Cores Pré-fixadas em Alta no Instagram
              </span>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_BG_COLORS.map((item) => {
                  const isSelected =
                    (template.background?.color || "#0D0E15").toLowerCase() ===
                    item.color.toLowerCase();
                  return (
                    <button
                      key={item.color}
                      type="button"
                      onClick={() =>
                        onUpdateTemplate({
                          ...template,
                          background: { ...template.background, color: item.color },
                        })
                      }
                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                          : "border-border/60 bg-secondary/30 hover:bg-secondary/60 hover:border-border"
                      }`}
                    >
                      <div
                        className="size-6 rounded-md border border-border/80 shrink-0 shadow-xs"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground truncate">
                            {item.name}
                          </span>
                          {isSelected && <Check className="size-3 text-primary shrink-0 ml-1" />}
                        </div>
                        <span className="text-[9px] text-muted-foreground truncate block">
                          {item.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seletor Customizado Hexadecimal */}
            <div className="pt-2 border-t border-border/50 space-y-2">
              <span className="text-[10px] text-muted-foreground block font-medium">
                Tabela de Cores / Código Hexadecimal
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={template.background?.color || "#0D0E15"}
                  onChange={(e) =>
                    onUpdateTemplate({
                      ...template,
                      background: { ...template.background, color: e.target.value },
                    })
                  }
                  className="size-9 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
                />
                <div className="flex-1 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">
                    #
                  </span>
                  <Input
                    value={(template.background?.color || "#0D0E15").replace("#", "")}
                    onChange={(e) => {
                      const hex = `#${e.target.value.replace(/[^0-9A-Fa-f]/g, "")}`;
                      onUpdateTemplate({
                        ...template,
                        background: { ...template.background, color: hex },
                      });
                    }}
                    placeholder="0D0E15"
                    maxLength={6}
                    className="h-9 pl-7 font-mono text-xs uppercase bg-background/80"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            6. TEMPLATES SALVOS NA PASTA
        ========================================= */}
        {activeSubTab === "saved" && (
          <div className="space-y-4">
            {/* Salvar Novo */}
            <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-2.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Save className="size-3.5 text-primary" /> Salvar Template Atual
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Nome do template (ex: Feed Diário Dark)"
                  className="h-8 text-xs bg-background/60"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-8 text-xs shrink-0"
                >
                  {saveSuccess ? (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-3.5" /> Salvo!
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Save className="size-3.5" /> Salvar
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Lista de Templates Salvos */}
            <div className="space-y-2">
              <span className="text-[10px] text-muted-foreground block font-medium">
                Templates Salvos na Pasta do Projeto ({savedTemplates.length})
              </span>
              {savedTemplates.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                  Nenhum template salvo na pasta ainda. Salve o seu acima!
                </div>
              ) : (
                <div className="space-y-1.5">
                  {savedTemplates.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-secondary/30 hover:bg-secondary/60 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="size-4 rounded-full border border-border shrink-0"
                          style={{
                            backgroundColor: item.template.background?.color || "#000",
                          }}
                        />
                        <span className="text-xs font-medium text-foreground truncate">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => onUpdateTemplate(item.template)}
                          className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10"
                        >
                          Carregar
                        </Button>
                        {onDeleteTemplate && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeleteTemplate(item.name)}
                            className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
