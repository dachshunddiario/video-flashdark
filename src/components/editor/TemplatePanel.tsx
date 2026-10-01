import { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Type,
  CheckCircle2,
  Sparkles,
  Layers,
  Save,
  Trash2,
  FolderOpen,
  Eye,
  EyeOff,
  Folder,
  Download,
  Upload,
  Database,
  Plus,
  ChevronDown,
  Check,
  Palette,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Pipette,
  User,
  AlignLeft,
  AtSign,
  Smartphone,
  RotateCcw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DEFAULT_TEMPLATE_VISUAL,
  type TemplateVisual,
  INSTAGRAM_FORMATS,
  DEFAULT_4_5_ORGANIZATION,
  AVAILABLE_FONTS,
} from "@/lib/types";
import { templateRepository } from "@/lib/template-repository";

function FontSelector({
  value,
  onChange,
  label = "Tipografia / Fonte",
}: {
  value?: string | undefined;
  onChange: (fontFamily: string) => void;
  label?: string | undefined;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const defaultFont = AVAILABLE_FONTS[0] ?? {
    id: "outfit",
    name: "Outfit (Moderna)",
    fontFamily: "'Outfit', sans-serif",
    category: "sans" as const,
  };
  const currentFont = AVAILABLE_FONTS.find((f) => f.fontFamily === value) ?? defaultFont;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const categories: { key: string; label: string }[] = [
    { key: "sans", label: "Sans-Serif / Modernas" },
    { key: "display", label: "Display / Impacto" },
    { key: "serif", label: "Editorial / Clássicas" },
    { key: "handwriting", label: "Manuscritas / Estilo" },
    { key: "mono", label: "Tech / Monospace" },
  ];

  return (
    <div ref={containerRef} className="relative space-y-1.5 pt-1.5 border-t border-border/30">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
          <Type className="size-3.5 text-primary" /> {label}
        </Label>
        <span className="text-[10px] text-muted-foreground/80 font-mono">
          {AVAILABLE_FONTS.length} fontes disponíveis
        </span>
      </div>

      {/* Botão Dropdown / Dropbox principal */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-8 px-2.5 rounded-lg border border-input bg-secondary/40 hover:bg-secondary/70 flex items-center justify-between text-xs transition-colors outline-none focus:border-primary/60 cursor-pointer"
      >
        <div className="flex items-center gap-2 truncate">
          <span
            className="text-xs font-semibold text-foreground truncate"
            style={{ fontFamily: currentFont.fontFamily }}
          >
            {currentFont.name}
          </span>
          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
            {currentFont.category}
          </span>
        </div>
        <ChevronDown
          className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Menu Lista Suspensa (Dropbox) */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-popover/98 backdrop-blur-md shadow-2xl p-1.5 max-h-64 overflow-y-auto scrollbar-slim animate-in fade-in-0 zoom-in-95">
          {categories.map((cat) => {
            const catFonts = AVAILABLE_FONTS.filter((f) => f.category === cat.key);
            if (catFonts.length === 0) return null;
            return (
              <div key={cat.key} className="mb-2 last:mb-0">
                <div className="px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-secondary/40 rounded">
                  {cat.label}
                </div>
                <div className="space-y-0.5 mt-1">
                  {catFonts.map((font) => {
                    const isSelected = (value || defaultFont.fontFamily) === font.fontFamily;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => {
                          onChange(font.fontFamily);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition cursor-pointer ${
                          isSelected
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : "hover:bg-secondary/80 text-foreground"
                        }`}
                      >
                        <span className="text-xs truncate" style={{ fontFamily: font.fontFamily }}>
                          {font.name}
                        </span>
                        {isSelected && <Check className="size-3.5 shrink-0 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TemplatePanelProps {
  template: TemplateVisual;
  onChange: (updated: TemplateVisual) => void;
  onSavePreset?: (name: string) => void;
  savedTemplates?: { id: string; name: string; visual?: TemplateVisual }[];
  onLoadPreset?: (tpl: TemplateVisual) => void;
  activeSection?:
    | "profile"
    | "pageName"
    | "badge"
    | "headline"
    | "subHeadline"
    | "watermark"
    | "background";
  onSectionChange?: (
    sec:
      | "profile"
      | "pageName"
      | "badge"
      | "headline"
      | "subHeadline"
      | "watermark"
      | "background",
  ) => void;
  onProceedToEditor?: () => void;
}

export function TemplatePanel({
  template,
  onChange,
  onSavePreset,
  savedTemplates = [],
  onLoadPreset,
  activeSection: activeSectionProp,
  onSectionChange,
  onProceedToEditor,
}: TemplatePanelProps) {
  const [internalSection, setInternalSection] = useState<
    | "profile"
    | "pageName"
    | "badge"
    | "headline"
    | "subHeadline"
    | "watermark"
    | "background"
  >("headline");

  const [isProfilePreviewOpen, setIsProfilePreviewOpen] = useState(false);

  const activeSection = activeSectionProp || internalSection;
  const setActiveSection = (sec: typeof internalSection) => {
    setInternalSection(sec);
    if (onSectionChange) onSectionChange(sec);
  };

  const isInside45 = (y: number) =>
    y >= INSTAGRAM_FORMATS.timeline45.topPct && y <= INSTAGRAM_FORMATS.timeline45.bottomPct;

  const handleOrganizeIn45 = () => {
    onChange({
      ...template,
      profilePic: {
        ...template.profilePic,
        x: DEFAULT_4_5_ORGANIZATION.profilePic.x,
        y: DEFAULT_4_5_ORGANIZATION.profilePic.y,
        size: DEFAULT_4_5_ORGANIZATION.profilePic.size,
      },
      pageName: {
        ...template.pageName,
        x: DEFAULT_4_5_ORGANIZATION.pageName.x,
        y: DEFAULT_4_5_ORGANIZATION.pageName.y,
        align: DEFAULT_4_5_ORGANIZATION.pageName.align,
      },
      badge: {
        ...template.badge,
        x: DEFAULT_4_5_ORGANIZATION.badge.x,
        y: DEFAULT_4_5_ORGANIZATION.badge.y,
        size: DEFAULT_4_5_ORGANIZATION.badge.size,
      },
      headline: {
        ...template.headline,
        x: DEFAULT_4_5_ORGANIZATION.headline.x,
        y: DEFAULT_4_5_ORGANIZATION.headline.y,
        align: DEFAULT_4_5_ORGANIZATION.headline.align,
        maxWidth: DEFAULT_4_5_ORGANIZATION.headline.maxWidth,
      },
      subHeadline: {
        ...template.subHeadline,
        x: DEFAULT_4_5_ORGANIZATION.subHeadline.x,
        y: DEFAULT_4_5_ORGANIZATION.subHeadline.y,
        align: DEFAULT_4_5_ORGANIZATION.subHeadline.align,
        maxWidth: DEFAULT_4_5_ORGANIZATION.subHeadline.maxWidth,
      },
      watermark: {
        ...template.watermark,
        x: DEFAULT_4_5_ORGANIZATION.watermark.x,
        y: DEFAULT_4_5_ORGANIZATION.watermark.y,
      },
    });
  };

  const [availableTemplates, setAvailableTemplates] = useState<TemplateVisual[]>([]);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>(template.name || "");
  const [templateNameInput, setTemplateNameInput] = useState<string>(template.name || "");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const watermarkFileInputRef = useRef<HTMLInputElement>(null);
  const jsonImportInputRef = useRef<HTMLInputElement>(null);

  // Carrega a lista de templates da pasta ao montar
  const refreshTemplates = async () => {
    try {
      const list = await templateRepository.listTemplates();
      setAvailableTemplates(list);
      setConnectedFolder(templateRepository.getConnectedFolderName());
    } catch (err) {
      console.warn("Erro ao listar templates:", err);
    }
  };

  useEffect(() => {
    refreshTemplates();
  }, []);

  // Cria um novo template limpo do zero
  const handleCreateNewTemplate = () => {
    const nextNumber = availableTemplates.length + 1;
    const freshTemplate: TemplateVisual = {
      ...DEFAULT_TEMPLATE_VISUAL,
      name: `Template ${nextNumber}`,
    };
    onChange(freshTemplate);
    setSelectedTemplateName(freshTemplate.name);
    setTemplateNameInput(freshTemplate.name);
  };

  // Quando o usuário seleciona um template, busca direto na pasta e aplica
  const handleSelectTemplate = async (name: string) => {
    setSelectedTemplateName(name);
    setTemplateNameInput(name);
    try {
      const found = await templateRepository.getTemplate(name);
      if (found) {
        onChange(found);
        if (onLoadPreset) onLoadPreset(found);
      }
    } catch (err) {
      console.error("Erro ao carregar template da pasta:", err);
    }
  };

  // Salva o template atual diretamente na pasta templates/
  const handleSaveTemplate = async () => {
    const name = templateNameInput.trim() || template.name || "Template";
    const updatedTemplate = { ...template, name };
    onChange(updatedTemplate);

    try {
      await templateRepository.saveTemplate(updatedTemplate);
      if (onSavePreset) onSavePreset(name);
      await refreshTemplates();
      setSelectedTemplateName(name);
      alert(`Template "${name}" salvo na pasta templates/ com sucesso!`);
    } catch (err) {
      console.error("Erro ao salvar template:", err);
      alert("Erro ao salvar template na pasta.");
    }
  };

  // Salva o template na pasta e prossegue direto para a aba Editor
  const handleSaveAndProceed = async () => {
    const name = templateNameInput.trim() || template.name || "Template";
    const updatedTemplate = { ...template, name };
    onChange(updatedTemplate);

    try {
      await templateRepository.saveTemplate(updatedTemplate);
      if (onSavePreset) onSavePreset(name);
      await refreshTemplates();
      setSelectedTemplateName(name);
      if (onProceedToEditor) {
        onProceedToEditor();
      }
    } catch (err) {
      console.error("Erro ao salvar template:", err);
      alert("Erro ao salvar template na pasta.");
    }
  };

  // Conectar pasta física externa do computador (caso queira mudar de local)
  const handleConnectFolder = async () => {
    const folderName = await templateRepository.connectLocalFolder();
    if (folderName) {
      setConnectedFolder(folderName);
      await refreshTemplates();
      alert(`Pasta externa "${folderName}" conectada com sucesso! Os templates agora serão gravados nela.`);
    }
  };

  // Voltar a usar a pasta nativa templates/ do projeto
  const handleResetToNativeFolder = async () => {
    templateRepository.disconnectExternalFolder();
    await refreshTemplates();
    alert("Retornado para a pasta nativa 'templates/' do projeto!");
  };

  // Excluir template da pasta com garantia total de remoção física e de cache
  const handleDeleteTemplate = async () => {
    if (!selectedTemplateName) return;

    const templateObj = availableTemplates.find(
      (t) => t.name.toLowerCase() === selectedTemplateName.toLowerCase(),
    );
    const targetFileName = templateObj?.fileName;

    if (window.confirm(`Deseja realmente excluir o template "${selectedTemplateName}" da pasta?`)) {
      await templateRepository.deleteTemplate(selectedTemplateName, targetFileName);

      // Remove imediatamente em memória para resposta instantânea
      const remaining = availableTemplates.filter(
        (t) =>
          t.name.toLowerCase() !== selectedTemplateName.toLowerCase() &&
          (!targetFileName || t.fileName !== targetFileName),
      );
      setAvailableTemplates(remaining);
      setSelectedTemplateName("");
      setTemplateNameInput("");

      // Sincroniza com o disco
      await refreshTemplates();
      alert(`Template "${selectedTemplateName}" excluído com sucesso!`);
    }
  };

  // Importar arquivo JSON de template
  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await templateRepository.importTemplateFile(file);
      onChange(imported);
      await refreshTemplates();
      setSelectedTemplateName(imported.name);
      setTemplateNameInput(imported.name);
      alert(`Template "${imported.name}" importado e salvo com sucesso!`);
    } catch (err) {
      alert("Arquivo de template inválido.");
    }
  };

  // Upload da imagem de perfil
  const handleProfileImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        onChange({
          ...template,
          profilePic: {
            ...template.profilePic,
            imageUrl: ev.target.result as string,
            enabled: true,
          },
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload da imagem de marca d'água
  const handleWatermarkImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        onChange({
          ...template,
          watermark: {
            ...template.watermark,
            imageUrl: ev.target.result as string,
            enabled: true,
          },
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const isExternalFolder = templateRepository.isExternalFolderConnected();

  return (
    <div className="space-y-4">
      {/* SEÇÃO: GERENCIAMENTO DE PASTA LOCAL & BACKUP DE TEMPLATES */}
      <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="size-4 text-primary" />
            <h4 className="text-xs font-semibold text-foreground">Templates & Backup</h4>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                isExternalFolder
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              }`}
            >
              {isExternalFolder ? `Externa: ${connectedFolder}` : "Pasta do Projeto: templates/"}
            </span>
            {isExternalFolder && (
              <button
                type="button"
                onClick={handleResetToNativeFolder}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                title="Voltar para a pasta templates/ nativa do projeto"
              >
                (Restaurar nativa)
              </button>
            )}
          </div>
        </div>

        {/* Ações Rápidas: Criar Novo Template e Conectar Pasta */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreateNewTemplate}
            className="flex-1 h-7 text-xs font-medium gap-1.5 border-dashed hover:bg-secondary/70"
          >
            <Plus className="size-3 text-primary" /> Criar Novo Template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleConnectFolder}
            className="h-7 text-xs gap-1.5"
            title="Escolha uma pasta externa no seu computador caso queira mudar de local"
          >
            <FolderOpen className="size-3 text-primary" />
            {isExternalFolder ? "Mudar Pasta" : "Conectar Pasta"}
          </Button>
        </div>

        {/* Seleção do Template com busca automática na pasta */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Selecionar Template da Pasta:</span>
            <span className="text-[10px] text-muted-foreground/80">Busca automática</span>
          </Label>
          <div className="flex items-center gap-1.5">
            <select
              value={selectedTemplateName}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-secondary/50 px-2.5 text-xs outline-none focus:border-primary/60 font-medium"
            >
              <option value="" disabled>
                {availableTemplates.length === 0
                  ? "Nenhum template salvo na pasta ainda..."
                  : "Selecione um template..."}
              </option>
              {availableTemplates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>

            {selectedTemplateName && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDeleteTemplate}
                title={`Excluir template "${selectedTemplateName}" da pasta`}
                className="h-8 px-2 text-rose-400 hover:text-white hover:bg-rose-600/30 border border-rose-500/40 rounded-lg transition-colors"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* BLOCO DEDICADO: SALVAR TEMPLATE NA PASTA */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Save className="size-3.5 text-primary" />
              Salvar Template na Pasta
            </span>
            <span className="text-[10px] text-muted-foreground">Grava direto em templates/</span>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={templateNameInput}
              onChange={(e) => setTemplateNameInput(e.target.value)}
              placeholder="Nome do template..."
              className="h-8 text-xs bg-background/80"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleSaveTemplate}
              className="h-8 text-xs font-semibold gap-1.5 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              <Save className="size-3" /> Salvar Template
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleSaveAndProceed}
            className="w-full h-8 text-xs font-semibold gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm mt-1"
            title="Salva o template na pasta e prossegue para a tela de Editor"
          >
            <CheckCircle2 className="size-3.5" /> Salvar Template e Prosseguir para o Editor →
          </Button>
        </div>

        {/* Exportar / Importar arquivo .json direto */}
        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          <input
            ref={jsonImportInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => jsonImportInputRef.current?.click()}
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <Upload className="size-3" /> Restaurar de arquivo .json
          </button>
          <button
            type="button"
            onClick={() => templateRepository.exportTemplateFile(template)}
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <Download className="size-3" /> Exportar .json
          </button>
        </div>
      </div>

      {/* BANNER ÁREA SEGURA 4:5 (TIMELINE INSTAGRAM - 1080x1350) */}
      <div className="flex items-center justify-between rounded-xl bg-sky-950/40 border border-sky-500/30 p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Smartphone className="size-4 text-sky-400" />
          <div>
            <p className="font-semibold text-sky-200 text-[11px]">Área 4:5 Feed (1080x1350)</p>
            <p className="text-[10px] text-sky-300/70">Tamanho padrão do post na timeline</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleOrganizeIn45}
          className="h-7 text-xs font-semibold gap-1.5 bg-sky-500 hover:bg-sky-400 text-white shadow-xs"
          title="Auto-alinha Cabeçalho, Headline, Subtítulo e Marca d'água dentro da área 4:5"
        >
          <Sparkles className="size-3" /> Auto-alinhar 4:5
        </Button>
      </div>

      {/* Navegação entre os 7 Elementos do Template */}
      <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5 rounded-lg border border-border bg-secondary/20 p-1">
        {[
          { id: "headline", label: "Headline", icon: Type, enabled: template.headline.enabled },
          { id: "subHeadline", label: "Sub-title", icon: AlignLeft, enabled: template.subHeadline.enabled },
          { id: "profile", label: "Foto Perfil", icon: User, enabled: template.profilePic.enabled },
          { id: "pageName", label: "Nome Página", icon: AtSign, enabled: template.pageName.enabled },
          { id: "badge", label: "Selo", icon: CheckCircle2, enabled: template.badge.enabled },
          { id: "watermark", label: "Marca d'água", icon: Sparkles, enabled: template.watermark.enabled },
          {
            id: "background",
            label: "Fundo",
            icon: Palette,
            enabled: true,
            colorPreview: template.background?.color || "#000000",
          },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id as typeof activeSection)}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
              {item.colorPreview ? (
                <span
                  className="size-2.5 rounded-full border border-white/60 shadow-xs shrink-0"
                  style={{ backgroundColor: item.colorPreview }}
                />
              ) : (
                <span
                  className={`size-1.5 rounded-full shrink-0 ${
                    item.enabled ? "bg-emerald-400" : "bg-muted-foreground/40"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 1. HEADLINE */}
      {activeSection === "headline" && (
        <div className="space-y-3.5 rounded-lg border border-border bg-secondary/20 p-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground">Headline (Título Principal)</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Ativado</span>
              <Switch
                checked={template.headline.enabled}
                onCheckedChange={(val) =>
                  onChange({
                    ...template,
                    headline: { ...template.headline, enabled: val },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <textarea
              className="w-full rounded-lg border border-input bg-secondary/40 p-2 text-xs outline-none focus:border-primary/60 resize-none h-16"
              placeholder="Digite o título do template..."
              value={template.headline.text}
              onChange={(e) =>
                onChange({
                  ...template,
                  headline: { ...template.headline, text: e.target.value },
                })
              }
            />

            {/* Seletor com mais de 12 Fontes */}
            <FontSelector
              value={template.headline.fontFamily}
              onChange={(fontFamily) =>
                onChange({
                  ...template,
                  headline: { ...template.headline, fontFamily },
                })
              }
              label="Fonte da Headline"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Tamanho da Fonte ({template.headline.fontSize}px)</Label>
                <div className="flex items-center gap-1">
                  {[18, 24, 32, 44, 60].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...template,
                          headline: { ...template.headline, fontSize: sz },
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                        template.headline.fontSize === sz
                          ? "bg-primary text-white font-bold"
                          : "bg-secondary/60 text-muted-foreground hover:text-white"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={8}
                  max={200}
                  value={template.headline.fontSize}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      headline: {
                        ...template.headline,
                        fontSize: Number(e.target.value) || 24,
                      },
                    })
                  }
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={8}
                  value={template.headline.fontSize}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      headline: {
                        ...template.headline,
                        fontSize: Number(e.target.value) || 24,
                      },
                    })
                  }
                  className="h-7 w-16 text-xs text-center"
                />
              </div>
            </div>

            {/* Largura da Caixa de Texto (maxWidth %) */}
            <div className="space-y-2 pt-1 border-t border-border/30">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">
                  Largura da Caixa ({template.headline.maxWidth ?? 88}%)
                </Label>
                <div className="flex items-center gap-1">
                  {[50, 75, 88, 95, 100].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...template,
                          headline: { ...template.headline, maxWidth: w },
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                        (template.headline.maxWidth ?? 88) === w
                          ? "bg-primary text-white font-bold"
                          : "bg-secondary/60 text-muted-foreground hover:text-white"
                      }`}
                    >
                      {w}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={template.headline.maxWidth ?? 88}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      headline: {
                        ...template.headline,
                        maxWidth: Number(e.target.value) || 88,
                      },
                    })
                  }
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={10}
                  max={100}
                  value={template.headline.maxWidth ?? 88}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      headline: {
                        ...template.headline,
                        maxWidth: Number(e.target.value) || 88,
                      },
                    })
                  }
                  className="h-7 w-16 text-xs text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/30">
              <div>
                <Label className="text-[10px] text-muted-foreground">Peso da Fonte</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-secondary/40 px-2 text-xs outline-none"
                  value={template.headline.fontWeight}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      headline: {
                        ...template.headline,
                        fontWeight: e.target.value as "normal" | "600" | "bold",
                      },
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="600">Semibold</option>
                  <option value="bold">Bold</option>
                </select>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Alinhamento</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-secondary/40 px-2 text-xs outline-none"
                  value={template.headline.align}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      headline: {
                        ...template.headline,
                        align: e.target.value as "left" | "center" | "right",
                      },
                    })
                  }
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <Label className="text-[10px] text-muted-foreground">Posição Vertical (Y %)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={template.headline.y}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      headline: { ...template.headline, y: Number(e.target.value) || 20 },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Cor do Texto</Label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={template.headline.color}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        headline: { ...template.headline, color: e.target.value },
                      })
                    }
                    className="size-8 rounded border border-input cursor-pointer bg-transparent p-0"
                  />
                  <Input
                    value={template.headline.color}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        headline: { ...template.headline, color: e.target.value },
                      })
                    }
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SUB-HEADLINE */}
      {activeSection === "subHeadline" && (
        <div className="space-y-3.5 rounded-lg border border-border bg-secondary/20 p-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground">Sub-headline (Subtítulo)</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Ativado</span>
              <Switch
                checked={template.subHeadline.enabled}
                onCheckedChange={(val) =>
                  onChange({
                    ...template,
                    subHeadline: { ...template.subHeadline, enabled: val },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <textarea
              className="w-full rounded-lg border border-input bg-secondary/40 p-2 text-xs outline-none focus:border-primary/60 resize-none h-16"
              placeholder="Digite o subtítulo..."
              value={template.subHeadline.text}
              onChange={(e) =>
                onChange({
                  ...template,
                  subHeadline: { ...template.subHeadline, text: e.target.value },
                })
              }
            />

            {/* Seletor com mais de 12 Fontes */}
            <FontSelector
              value={template.subHeadline.fontFamily}
              onChange={(fontFamily) =>
                onChange({
                  ...template,
                  subHeadline: { ...template.subHeadline, fontFamily },
                })
              }
              label="Fonte do Subtítulo"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Tamanho da Fonte ({template.subHeadline.fontSize}px)</Label>
                <div className="flex items-center gap-1">
                  {[14, 18, 22, 28, 36].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...template,
                          subHeadline: { ...template.subHeadline, fontSize: sz },
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                        template.subHeadline.fontSize === sz
                          ? "bg-primary text-white font-bold"
                          : "bg-secondary/60 text-muted-foreground hover:text-white"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={8}
                  max={180}
                  value={template.subHeadline.fontSize}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      subHeadline: {
                        ...template.subHeadline,
                        fontSize: Number(e.target.value) || 16,
                      },
                    })
                  }
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={8}
                  value={template.subHeadline.fontSize}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      subHeadline: {
                        ...template.subHeadline,
                        fontSize: Number(e.target.value) || 16,
                      },
                    })
                  }
                  className="h-7 w-16 text-xs text-center"
                />
              </div>
            </div>

            {/* Largura da Caixa de Subtítulo */}
            <div className="space-y-2 pt-1 border-t border-border/30">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">
                  Largura da Caixa ({template.subHeadline.maxWidth ?? 84}%)
                </Label>
                <div className="flex items-center gap-1">
                  {[50, 70, 84, 95, 100].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...template,
                          subHeadline: { ...template.subHeadline, maxWidth: w },
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                        (template.subHeadline.maxWidth ?? 84) === w
                          ? "bg-primary text-white font-bold"
                          : "bg-secondary/60 text-muted-foreground hover:text-white"
                      }`}
                    >
                      {w}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={template.subHeadline.maxWidth ?? 84}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      subHeadline: {
                        ...template.subHeadline,
                        maxWidth: Number(e.target.value) || 84,
                      },
                    })
                  }
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={10}
                  max={100}
                  value={template.subHeadline.maxWidth ?? 84}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      subHeadline: {
                        ...template.subHeadline,
                        maxWidth: Number(e.target.value) || 84,
                      },
                    })
                  }
                  className="h-7 w-16 text-xs text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/30">
              <div>
                <Label className="text-[10px] text-muted-foreground">Alinhamento</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-secondary/40 px-2 text-xs outline-none"
                  value={template.subHeadline.align}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      subHeadline: {
                        ...template.subHeadline,
                        align: e.target.value as "left" | "center" | "right",
                      },
                    })
                  }
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Posição Y %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={template.subHeadline.y}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      subHeadline: { ...template.subHeadline, y: Number(e.target.value) || 28 },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. FOTO DE PERFIL */}
      {activeSection === "profile" && (
        <div className="space-y-3.5 rounded-lg border border-border bg-secondary/20 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="size-4 text-primary" />
              <Label className="text-xs font-semibold text-foreground">Foto de Perfil</Label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Ativado</span>
              <Switch
                checked={template.profilePic.enabled}
                onCheckedChange={(val) =>
                  onChange({
                    ...template,
                    profilePic: { ...template.profilePic, enabled: val },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfileImageUpload}
              className="hidden"
            />

            {/* CARD DE PRÉVIA NÍTIDA E SELEÇÃO DE IMAGEM */}
            <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-background/60 shadow-xs">
              <div
                onClick={() => {
                  if (template.profilePic.imageUrl) setIsProfilePreviewOpen(true);
                  else fileInputRef.current?.click();
                }}
                className={`relative size-20 shrink-0 overflow-hidden cursor-pointer group flex items-center justify-center bg-secondary/60 ${
                  template.profilePic.circular ? "rounded-full" : "rounded-xl"
                }`}
                style={{
                  border: template.profilePic.borderEnabled
                    ? `${Math.max(1, template.profilePic.borderWidth || 2)}px solid ${
                        template.profilePic.borderColor || "#ffffff"
                      }`
                    : "1px dashed rgba(255,255,255,0.2)",
                }}
                title="Clique para inspecionar em alta resolução"
              >
                {template.profilePic.imageUrl ? (
                  <>
                    <img
                      src={template.profilePic.imageUrl}
                      alt="Perfil"
                      className="size-full object-cover transition-transform"
                      style={{
                        transform: `scale(${(template.profilePic.zoom ?? 100) / 100})`,
                        transformOrigin: "center center",
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <Maximize2 className="size-4" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-1">
                    <ImageIcon className="size-6 opacity-60" />
                    <span className="text-[9px]">Sem foto</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {template.profilePic.imageUrl ? "Foto Carregada" : "Nenhuma Imagem"}
                  </span>
                  {template.profilePic.imageUrl && (
                    <span className="text-[10px] text-emerald-400 font-medium bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-500/30">
                      Ativa
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-xs gap-1 cursor-pointer"
                  >
                    <FolderOpen className="size-3 text-primary" />
                    {template.profilePic.imageUrl ? "Trocar Imagem" : "Carregar Imagem"}
                  </Button>

                  {template.profilePic.imageUrl && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsProfilePreviewOpen(true)}
                      className="h-7 text-xs gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 cursor-pointer shadow-xs font-semibold"
                      title="Abrir janela de inspeção com zoom e alta resolução"
                    >
                      <Eye className="size-3" />
                      Pré-view HD
                    </Button>
                  )}
                </div>

                {template.profilePic.imageUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...template,
                        profilePic: { ...template.profilePic, imageUrl: "" },
                      })
                    }
                    className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline block pt-0.5"
                  >
                    Remover imagem
                  </button>
                )}
              </div>
            </div>

            {/* 1. REGULAGEM EXATA DO TAMANHO DA FOTO NO VÍDEO (PX) */}
            <div className="space-y-1.5 pt-1 border-t border-border/30">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground font-medium">
                  Tamanho Exato ({template.profilePic.size}px)
                </Label>
                <div className="flex items-center gap-1">
                  {[
                    { label: "P", px: 44 },
                    { label: "M", px: 54 },
                    { label: "G", px: 72 },
                    { label: "GG", px: 96 },
                    { label: "XG", px: 128 },
                  ].map((preset) => (
                    <button
                      key={preset.px}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...template,
                          profilePic: {
                            ...template.profilePic,
                            size: preset.px,
                          },
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] transition cursor-pointer ${
                        template.profilePic.size === preset.px
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "bg-secondary/60 text-muted-foreground hover:text-white"
                      }`}
                      title={`${preset.px} pixels`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={20}
                  max={300}
                  value={template.profilePic.size}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      profilePic: {
                        ...template.profilePic,
                        size: Number(e.target.value) || 54,
                      },
                    })
                  }
                  className="flex-1 accent-primary cursor-pointer"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min={20}
                    max={300}
                    value={template.profilePic.size}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          size: Number(e.target.value) || 54,
                        },
                      })
                    }
                    className="h-7 w-16 text-xs text-center font-mono font-bold"
                  />
                  <span className="text-[10px] text-muted-foreground">px</span>
                </div>
              </div>
            </div>

            {/* 2. REGULAGEM EXATA DE ZOOM / APROXIMAÇÃO INTERNA (%) */}
            <div className="space-y-1.5 pt-1 border-t border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <ZoomIn className="size-3 text-primary" />
                    Aproximação / Zoom da Foto ({template.profilePic.zoom ?? 100}%)
                  </Label>
                  <p className="text-[9.5px] text-muted-foreground/75">
                    Aumente o zoom para o rosto/objeto preencher o círculo sem ficar distante
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {[100, 125, 150, 175, 200].map((zm) => (
                    <button
                      key={zm}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...template,
                          profilePic: {
                            ...template.profilePic,
                            zoom: zm,
                          },
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] transition cursor-pointer ${
                        (template.profilePic.zoom ?? 100) === zm
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "bg-secondary/60 text-muted-foreground hover:text-white"
                      }`}
                    >
                      {zm}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={50}
                  max={250}
                  value={template.profilePic.zoom ?? 100}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      profilePic: {
                        ...template.profilePic,
                        zoom: Number(e.target.value) || 100,
                      },
                    })
                  }
                  className="flex-1 accent-primary cursor-pointer"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min={50}
                    max={250}
                    value={template.profilePic.zoom ?? 100}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          zoom: Number(e.target.value) || 100,
                        },
                      })
                    }
                    className="h-7 w-16 text-xs text-center font-mono font-bold"
                  />
                  <span className="text-[10px] text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* 3. POSICIONAMENTO EXATO X E Y (%) */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/30">
              <div>
                <Label className="text-[10px] text-muted-foreground">Posição X Horizontal ({template.profilePic.x}%)</Label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={template.profilePic.x}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          x: Number(e.target.value),
                        },
                      })
                    }
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={template.profilePic.x}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          x: Number(e.target.value) || 14,
                        },
                      })
                    }
                    className="h-7 w-12 text-[11px] text-center font-mono"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Posição Y Vertical ({template.profilePic.y}%)</Label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={template.profilePic.y}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          y: Number(e.target.value),
                        },
                      })
                    }
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={template.profilePic.y}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          y: Number(e.target.value) || 18,
                        },
                      })
                    }
                    className="h-7 w-12 text-[11px] text-center font-mono"
                  />
                </div>
              </div>
            </div>

            {/* 4. FORMATO E BORDA */}
            <div className="space-y-2 pt-1 border-t border-border/30 text-xs">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={template.profilePic.circular}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          circular: e.target.checked,
                        },
                      })
                    }
                    className="size-3.5 accent-primary cursor-pointer"
                  />
                  Formato Circular (Redondo)
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={template.profilePic.borderEnabled}
                    onChange={(e) =>
                      onChange({
                        ...template,
                        profilePic: {
                          ...template.profilePic,
                          borderEnabled: e.target.checked,
                        },
                      })
                    }
                    className="size-3.5 accent-primary cursor-pointer"
                  />
                  Borda Ativada
                </label>
              </div>

              {template.profilePic.borderEnabled && (
                <div className="flex items-center justify-between gap-3 pt-1 bg-secondary/30 p-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-muted-foreground whitespace-nowrap">
                      Espessura ({template.profilePic.borderWidth || 2}px):
                    </Label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={template.profilePic.borderWidth || 2}
                      onChange={(e) =>
                        onChange({
                          ...template,
                          profilePic: {
                            ...template.profilePic,
                            borderWidth: Number(e.target.value) || 2,
                          },
                        })
                      }
                      className="w-20 accent-primary cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Cor:</Label>
                    <input
                      type="color"
                      value={template.profilePic.borderColor || "#ffffff"}
                      onChange={(e) =>
                        onChange({
                          ...template,
                          profilePic: {
                            ...template.profilePic,
                            borderColor: e.target.value,
                          },
                        })
                      }
                      className="size-6 rounded border border-border cursor-pointer bg-transparent p-0"
                      title="Escolher cor da borda"
                    />
                    <div className="flex items-center gap-1">
                      {["#ffffff", "#f59e0b", "#06b6d4", "#ef4444", "#000000"].map((bCol) => (
                        <button
                          key={bCol}
                          type="button"
                          onClick={() =>
                            onChange({
                              ...template,
                              profilePic: {
                                ...template.profilePic,
                                borderColor: bCol,
                              },
                            })
                          }
                          className="size-4 rounded-full border border-white/30 hover:scale-125 transition-transform"
                          style={{ backgroundColor: bCol }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. NOME DA PÁGINA */}
      {activeSection === "pageName" && (
        <div className="space-y-3.5 rounded-lg border border-border bg-secondary/20 p-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground">Nome da Página</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Ativado</span>
              <Switch
                checked={template.pageName.enabled}
                onCheckedChange={(val) =>
                  onChange({
                    ...template,
                    pageName: { ...template.pageName, enabled: val },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Input
              value={template.pageName.text}
              onChange={(e) =>
                onChange({
                  ...template,
                  pageName: { ...template.pageName, text: e.target.value },
                })
              }
              placeholder="Ex: Dachshund Diário"
              className="h-8 text-xs"
            />

            {/* Seletor com mais de 12 Fontes */}
            <FontSelector
              value={template.pageName.fontFamily}
              onChange={(fontFamily) =>
                onChange({
                  ...template,
                  pageName: { ...template.pageName, fontFamily },
                })
              }
              label="Fonte do Nome da Página"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Tamanho da Fonte ({template.pageName.fontSize}px)</Label>
                <div className="flex items-center gap-1">
                  {[16, 20, 24, 30, 36].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...template,
                          pageName: { ...template.pageName, fontSize: sz },
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                        template.pageName.fontSize === sz
                          ? "bg-primary text-white font-bold"
                          : "bg-secondary/60 text-muted-foreground hover:text-white"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={8}
                  max={140}
                  value={template.pageName.fontSize}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      pageName: {
                        ...template.pageName,
                        fontSize: Number(e.target.value) || 20,
                      },
                    })
                  }
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={8}
                  value={template.pageName.fontSize}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      pageName: {
                        ...template.pageName,
                        fontSize: Number(e.target.value) || 20,
                      },
                    })
                  }
                  className="h-7 w-16 text-xs text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/30">
              <div>
                <Label className="text-[10px] text-muted-foreground">Peso</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-secondary/40 px-2 text-xs outline-none"
                  value={template.pageName.fontWeight}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      pageName: {
                        ...template.pageName,
                        fontWeight: e.target.value as "normal" | "600" | "bold",
                      },
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="600">Semibold</option>
                  <option value="bold">Bold</option>
                </select>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Alinhamento</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-secondary/40 px-2 text-xs outline-none"
                  value={template.pageName.align}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      pageName: {
                        ...template.pageName,
                        align: e.target.value as "left" | "center" | "right",
                      },
                    })
                  }
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. SELO DE VERIFICAÇÃO */}
      {activeSection === "badge" && (
        <div className="space-y-3.5 rounded-lg border border-border bg-secondary/20 p-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground">Selo de Verificação</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Mostrar selo</span>
              <Switch
                checked={template.badge.enabled}
                onCheckedChange={(val) =>
                  onChange({
                    ...template,
                    badge: { ...template.badge, enabled: val },
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <Label className="text-[10px] text-muted-foreground">Tamanho ({template.badge.size}px)</Label>
              <div className="flex items-center gap-1.5 mt-0.5">
                <input
                  type="range"
                  min={10}
                  max={80}
                  value={template.badge.size}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      badge: { ...template.badge, size: Number(e.target.value) },
                    })
                  }
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={10}
                  max={80}
                  value={template.badge.size}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      badge: { ...template.badge, size: Number(e.target.value) || 20 },
                    })
                  }
                  className="h-6 w-14 text-[11px] text-center"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-3">
              <CheckCircle2 className="size-4 text-sky-400" />
              <span>Fixado ao lado do nome</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. MARCA D'ÁGUA */}
      {activeSection === "watermark" && (
        <div className="space-y-3.5 rounded-lg border border-border bg-secondary/20 p-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground">Marca d'Água</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Ativado</span>
              <Switch
                checked={template.watermark.enabled}
                onCheckedChange={(val) =>
                  onChange({
                    ...template,
                    watermark: { ...template.watermark, enabled: val },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-secondary/30 p-1">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...template,
                    watermark: { ...template.watermark, type: "text" },
                  })
                }
                className={`py-1 text-xs font-medium rounded ${
                  template.watermark.type === "text"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Texto
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...template,
                    watermark: { ...template.watermark, type: "image" },
                  })
                }
                className={`py-1 text-xs font-medium rounded ${
                  template.watermark.type === "image"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Imagem
              </button>
            </div>

            {template.watermark.type === "text" ? (
              <div className="space-y-2">
                <Input
                  value={template.watermark.text}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      watermark: { ...template.watermark, text: e.target.value },
                    })
                  }
                  placeholder="Ex: @minhapagina"
                  className="h-8 text-xs"
                />

                {/* Seletor com mais de 12 Fontes */}
                <FontSelector
                  value={template.watermark.fontFamily}
                  onChange={(fontFamily) =>
                    onChange({
                      ...template,
                      watermark: { ...template.watermark, fontFamily },
                    })
                  }
                  label="Fonte da Marca d'Água"
                />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-muted-foreground">
                      Tamanho da Fonte ({template.watermark.fontSize ?? 18}px)
                    </Label>
                    <div className="flex items-center gap-1">
                      {[12, 16, 20, 26, 32].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() =>
                            onChange({
                              ...template,
                              watermark: { ...template.watermark, fontSize: sz },
                            })
                          }
                          className={`px-1.5 py-0.5 rounded text-[9px] transition ${
                            (template.watermark.fontSize ?? 18) === sz
                              ? "bg-primary text-white font-bold"
                              : "bg-secondary/60 text-muted-foreground hover:text-white"
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={8}
                      max={120}
                      value={template.watermark.fontSize ?? 18}
                      onChange={(e) =>
                        onChange({
                          ...template,
                          watermark: {
                            ...template.watermark,
                            fontSize: Number(e.target.value) || 18,
                          },
                        })
                      }
                      className="flex-1 accent-primary"
                    />
                    <Input
                      type="number"
                      min={8}
                      value={template.watermark.fontSize ?? 18}
                      onChange={(e) =>
                        onChange({
                          ...template,
                          watermark: {
                            ...template.watermark,
                            fontSize: Number(e.target.value) || 18,
                          },
                        })
                      }
                      className="h-6 w-14 text-[11px] text-center"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={watermarkFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleWatermarkImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => watermarkFileInputRef.current?.click()}
                  className="w-full text-xs"
                >
                  Carregar Logo/Marca d'água
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/30">
              <div>
                <Label className="text-[10px] text-muted-foreground">Opacidade ({template.watermark.opacity}%)</Label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={template.watermark.opacity}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      watermark: {
                        ...template.watermark,
                        opacity: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-primary"
                />
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Posição Y ({template.watermark.y}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={template.watermark.y}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      watermark: {
                        ...template.watermark,
                        y: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. FUNDO DO TEMPLATE */}
      {activeSection === "background" && (
        <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              <Label className="text-xs font-semibold text-foreground">Fundo do Template</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Cor Atual:</span>
              <span
                className="size-3.5 rounded border border-white/30 shadow-xs"
                style={{ backgroundColor: template.background?.color || "#000000" }}
              />
              <span className="font-mono text-xs font-bold text-foreground">
                {template.background?.color || "#000000"}
              </span>
            </div>
          </div>

          {/* Destaque da cor atual com preview */}
          <div
            className="w-full h-14 rounded-lg border border-border/80 flex items-center justify-between px-3 shadow-inner transition-colors"
            style={{ backgroundColor: template.background?.color || "#000000" }}
          >
            <div className="bg-black/75 backdrop-blur-xs px-2.5 py-1 rounded-md text-white text-[11px] font-mono font-semibold flex items-center gap-2 border border-white/20">
              <div
                className="size-3 rounded-full border border-white/80"
                style={{ backgroundColor: template.background?.color || "#000000" }}
              />
              {template.background?.color || "#000000"}
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...template,
                  background: { color: "#000000", type: "solid" },
                })
              }
              className="bg-black/75 hover:bg-black/90 text-white/90 hover:text-white text-[10px] px-2.5 py-1 rounded-md border border-white/20 transition cursor-pointer flex items-center gap-1"
              title="Redefinir para o preto padrão (#000000)"
            >
              <RotateCcw className="size-3" />
              Resetar para Preto
            </button>
          </div>

          {/* 1. SELEÇÃO DE CORES PRÉ-FIXADAS (PRESETS POPULARES) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground font-semibold">
                Cores Pré-fixadas (Tons Recomendados)
              </Label>
              <span className="text-[10px] text-muted-foreground/80 font-mono">14 cores</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto scrollbar-slim p-1 rounded-lg border border-border/40 bg-secondary/10">
              {[
                { name: "Preto Puro (Padrão)", color: "#000000", desc: "Clássico Reels/Shorts" },
                { name: "Preto Ônix", color: "#090A0F", desc: "Sutil tom azulado" },
                { name: "Grafite Minimalista", color: "#121214", desc: "Estilo tech moderno" },
                { name: "Carvão Zinc", color: "#18181B", desc: "Neutro escuro suave" },
                { name: "Slate Petróleo", color: "#0F172A", desc: "Azul ardósia elegante" },
                { name: "Azul Noturno Navy", color: "#0A192F", desc: "Contraste cinematográfico" },
                { name: "Roxo Cósmico", color: "#1A0B2E", desc: "Impacto visual forte" },
                { name: "Vinho Bordô", color: "#250A16", desc: "Luxo e autoridade" },
                { name: "Verde Floresta Escuro", color: "#06281E", desc: "Natureza / Finanças" },
                { name: "Chocolate Escuro", color: "#201407", desc: "Aconchegante e rústico" },
                { name: "Cinza Metálico", color: "#27272A", desc: "Visual industrial" },
                { name: "Branco Puro (High Key)", color: "#FFFFFF", desc: "Fundo claro / Editorial" },
                { name: "Gelo / Creme", color: "#F8FAFC", desc: "Branco suave para post" },
                { name: "Rosa Pastel Suave", color: "#FCE7F3", desc: "Estética lifestyle" },
              ].map((preset) => {
                const isSelected =
                  (template.background?.color || "#000000").toLowerCase() ===
                  preset.color.toLowerCase();
                const isLight =
                  preset.color === "#FFFFFF" ||
                  preset.color === "#F8FAFC" ||
                  preset.color === "#FCE7F3";
                return (
                  <button
                    key={preset.color}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...template,
                        background: { color: preset.color, type: "solid" },
                      })
                    }
                    className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/40 bg-primary/10 shadow-xs"
                        : "border-border/40 hover:border-border hover:bg-secondary/40"
                    }`}
                  >
                    <span
                      className={`size-6 rounded-md shrink-0 border shadow-xs flex items-center justify-center ${
                        isLight ? "border-slate-300" : "border-white/20"
                      }`}
                      style={{ backgroundColor: preset.color }}
                    >
                      {isSelected && (
                        <Check
                          className={`size-3.5 ${isLight ? "text-slate-900" : "text-white"}`}
                        />
                      )}
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {preset.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        {preset.color}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. TABELA DE CORES / SELETOR HEXADECIMAL PERSONALIZADO */}
          <div className="space-y-2 pt-2 border-t border-border/30">
            <Label className="text-[11px] text-muted-foreground font-semibold flex items-center justify-between">
              <span>Seletor Personalizado (Código Hexadecimal)</span>
              <span className="text-[10px] text-muted-foreground font-mono">Ex: #FFFFFF, #000000</span>
            </Label>

            <div className="flex items-center gap-2">
              {/* Native color picker */}
              <div className="relative shrink-0">
                <input
                  type="color"
                  value={template.background?.color || "#000000"}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      background: { color: e.target.value.toUpperCase(), type: "solid" },
                    })
                  }
                  className="size-9 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
                  title="Clique para abrir a paleta de cores completa"
                />
              </div>

              {/* Hex Input */}
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground font-bold">
                  #
                </span>
                <Input
                  value={(template.background?.color || "#000000").replace("#", "")}
                  onChange={(e) => {
                    const raw = e.target.value.trim().replace("#", "");
                    if (/^[0-9A-Fa-f]{0,6}$/.test(raw)) {
                      const color = `#${raw.toUpperCase()}`;
                      onChange({
                        ...template,
                        background: { color, type: "solid" },
                      });
                    }
                  }}
                  placeholder="000000"
                  maxLength={6}
                  className="pl-7 font-mono font-bold text-xs uppercase h-9 bg-background/80"
                />
              </div>

              {/* Botões de atalho rápido #FFFFFF e #000000 */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    ...template,
                    background: { color: "#000000", type: "solid" },
                  })
                }
                className="h-9 px-2.5 text-xs font-mono font-semibold cursor-pointer"
                title="Cor Preta (#000000)"
              >
                #000
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    ...template,
                    background: { color: "#FFFFFF", type: "solid" },
                  })
                }
                className="h-9 px-2.5 text-xs font-mono font-semibold cursor-pointer"
                title="Cor Branca (#FFFFFF)"
              >
                #FFF
              </Button>
            </div>

            {/* Paleta rápida de swatches */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-muted-foreground">Paleta Rápida:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  "#000000",
                  "#1F2937",
                  "#111827",
                  "#0F172A",
                  "#1E1B4B",
                  "#311042",
                  "#3B0764",
                  "#450A0A",
                  "#042F2E",
                  "#FFFFFF",
                ].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...template,
                        background: { color: col, type: "solid" },
                      })
                    }
                    className="size-5 rounded border border-white/20 hover:scale-125 transition-transform cursor-pointer shadow-2xs"
                    style={{ backgroundColor: col }}
                    title={col}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-md bg-secondary/30 p-2.5 text-[11px] text-muted-foreground/90 border border-border/30">
            <p>
              💡 <strong>Como funciona o Fundo:</strong> Esta cor preenche as barras superior/inferior ou laterais do enquadramento 9:16 caso seu vídeo seja recortado ou menor que a tela inteira. É exibido no preview em tempo real e gravado no arquivo final pelo FFmpeg NVENC na GPU local.
            </p>
          </div>
        </div>
      )}

      {/* DIALOG MODAL: PRÉ-VISUALIZAÇÃO EM ALTA RESOLUÇÃO DA FOTO DE PERFIL */}
      <Dialog open={isProfilePreviewOpen} onOpenChange={setIsProfilePreviewOpen}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border border-border shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <Eye className="size-4 text-primary" />
              Pré-visualização da Foto de Perfil (HD)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Inspecione a nitidez, o enquadramento do rosto e os detalhes com máxima fidelidade antes de salvar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Visualizador Magnificado de Alta Resolução (240px x 240px) */}
            <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-border/60 bg-neutral-950/80 shadow-inner">
              <div
                className={`relative size-56 overflow-hidden flex items-center justify-center shadow-2xl bg-neutral-900 transition-all ${
                  template.profilePic.circular ? "rounded-full" : "rounded-2xl"
                }`}
                style={{
                  border: template.profilePic.borderEnabled
                    ? `${Math.max(2, (template.profilePic.borderWidth || 2) * 1.5)}px solid ${
                        template.profilePic.borderColor || "#ffffff"
                      }`
                    : "2px dashed rgba(255,255,255,0.2)",
                }}
              >
                {template.profilePic.imageUrl ? (
                  <img
                    src={template.profilePic.imageUrl}
                    alt="Prévia HD"
                    className="size-full object-cover transition-transform"
                    style={{
                      transform: `scale(${(template.profilePic.zoom ?? 100) / 100})`,
                      transformOrigin: "center center",
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <ImageIcon className="size-10 opacity-50" />
                    <span className="text-xs">Nenhuma foto carregada</span>
                  </div>
                )}
              </div>

              {/* Informações da foto e enquadramento */}
              <div className="flex items-center gap-3 mt-4 text-[11px] font-mono text-muted-foreground bg-secondary/40 px-3 py-1.5 rounded-lg border border-border/40">
                <span>Diâmetro: <strong>{template.profilePic.size}px</strong></span>
                <span>•</span>
                <span>Zoom: <strong>{template.profilePic.zoom ?? 100}%</strong></span>
                <span>•</span>
                <span>{template.profilePic.circular ? "Circular" : "Quadrado"}</span>
              </div>
            </div>

            {/* Ajustes Rápidos no próprio Modal */}
            <div className="space-y-3 bg-secondary/20 p-3 rounded-lg border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <ZoomIn className="size-3.5 text-primary" />
                    Aproximação / Zoom ({template.profilePic.zoom ?? 100}%)
                  </span>
                  <div className="flex items-center gap-1">
                    {[100, 130, 160, 200].map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() =>
                          onChange({
                            ...template,
                            profilePic: { ...template.profilePic, zoom: z },
                          })
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                          (template.profilePic.zoom ?? 100) === z
                            ? "bg-primary text-primary-foreground font-bold"
                            : "bg-secondary/60 text-muted-foreground hover:text-white"
                        }`}
                      >
                        {z}%
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  min={50}
                  max={250}
                  value={template.profilePic.zoom ?? 100}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      profilePic: {
                        ...template.profilePic,
                        zoom: Number(e.target.value) || 100,
                      },
                    })
                  }
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    Tamanho no Vídeo ({template.profilePic.size}px)
                  </span>
                  <div className="flex items-center gap-1">
                    {[44, 54, 72, 96, 128].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          onChange({
                            ...template,
                            profilePic: { ...template.profilePic, size: s },
                          })
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                          template.profilePic.size === s
                            ? "bg-primary text-primary-foreground font-bold"
                            : "bg-secondary/60 text-muted-foreground hover:text-white"
                        }`}
                      >
                        {s}px
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  min={20}
                  max={300}
                  value={template.profilePic.size}
                  onChange={(e) =>
                    onChange({
                      ...template,
                      profilePic: {
                        ...template.profilePic,
                        size: Number(e.target.value) || 54,
                      },
                    })
                  }
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs cursor-pointer gap-1"
            >
              <FolderOpen className="size-3" />
              Trocar Foto
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsProfilePreviewOpen(false)}
              className="text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-sm"
            >
              Confirmar e Fechar Prévia
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
