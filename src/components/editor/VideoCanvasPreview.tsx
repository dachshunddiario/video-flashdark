import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Sparkles,
  Layers,
  Volume2,
  VolumeX,
  Smartphone,
  Eye,
  EyeOff,
  Move,
  Crosshair,
  Check,
  AlertTriangle,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Crop,
  Lock,
  Scissors,
  RotateCw,
} from "lucide-react";
import {
  type TemplateVisual,
  type VideoAdjustment,
  type VideoQueueItem,
  type LayerId,
  INSTAGRAM_FORMATS,
  DEFAULT_4_5_ORGANIZATION,
  DEFAULT_LAYER_ORDER,
} from "@/lib/types";
import { VideoProcessor } from "@/lib/video-processor";
import { Button } from "@/components/ui/button";

export type SelectableCanvasElement =
  | "profile"
  | "pageName"
  | "badge"
  | "headline"
  | "subHeadline"
  | "watermark"
  | "video"
  | "background"
  | null;

export type VideoHandleAction =
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se"
  | "crop-top"
  | "crop-bottom"
  | "crop-left"
  | "crop-right";

export interface VideoHandleDragState {
  action: VideoHandleAction;
  pointerId: number;
  startX: number;
  startY: number;
  startVideoWidth: number;
  startCropTop: number;
  startCropBottom: number;
  startCropLeft: number;
  startCropRight: number;
  startVideoRect: DOMRect;
  startContainerRect: DOMRect;
}

export type TemplateHandleAction =
  | "resize-w"
  | "resize-e"
  | "resize-n"
  | "resize-s"
  | "scale-nw"
  | "scale-ne"
  | "scale-sw"
  | "scale-se";

export interface TemplateHandleDragState {
  element: "headline" | "subHeadline" | "pageName" | "watermark" | "profile" | "badge";
  action: TemplateHandleAction;
  pointerId: number;
  startX: number;
  startY: number;
  startFontSize: number;
  startMaxWidth: number;
  startSize: number;
  startContainerRect: DOMRect;
}

interface VideoCanvasPreviewProps {
  currentVideo: VideoQueueItem | null;
  currentIndex: number;
  totalVideos: number;
  template: TemplateVisual;
  adjustment: VideoAdjustment;
  applyToAll: boolean;
  onToggleApplyToAll: (applyAll: boolean) => void;
  onNavigate: (index: number) => void;
  onUpdateTemplate: (updated: TemplateVisual) => void;
  onUpdateAdjustment: (updated: VideoAdjustment) => void;
  selectedElement?: SelectableCanvasElement;
  onSelectElement?: (el: SelectableCanvasElement) => void;
  isTemplateLocked?: boolean;
  onRequestEditTemplate?: () => void;
}

export function VideoCanvasPreview({
  currentVideo,
  currentIndex,
  totalVideos,
  template,
  adjustment,
  applyToAll,
  onToggleApplyToAll,
  onNavigate,
  onUpdateTemplate,
  onUpdateAdjustment,
  selectedElement: controlledSelectedElement,
  onSelectElement,
  isTemplateLocked = false,
  onRequestEditTemplate,
}: VideoCanvasPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<"fit" | 0.75 | 1.0>("fit");

  // Guias e Máscaras de Simulação
  const [showGuides, setShowGuides] = useState(true);
  const [showTimelineMask, setShowTimelineMask] = useState(false);
  const [activeGuideFormat, setActiveGuideFormat] = useState<"timeline45" | "reelsFeed35" | "profileGrid11">("timeline45");

  // Elemento selecionado (interno ou controlado)
  const [internalSelected, setInternalSelected] = useState<SelectableCanvasElement>("headline");
  const selectedElement = controlledSelectedElement !== undefined ? controlledSelectedElement : internalSelected;

  const setSelectedElement = useCallback(
    (el: SelectableCanvasElement) => {
      setInternalSelected(el);
      if (onSelectElement) onSelectElement(el);
    },
    [onSelectElement],
  );

  // Arrastar elemento no canvas
  const [draggingElement, setDraggingElement] = useState<SelectableCanvasElement>(null);
  const [dragTooltip, setDragTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [isSnapping, setIsSnapping] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  // Manipulação interativa da camada de vídeo (alças de canto para tamanho e alças de borda para margens)
  const [activeHandleDrag, setActiveHandleDrag] = useState<VideoHandleDragState | null>(null);
  // Manipulação interativa dos elementos de texto e template (alças de largura e tamanho da fonte)
  const [activeTemplateHandleDrag, setActiveTemplateHandleDrag] = useState<TemplateHandleDragState | null>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoBlobUrlRef = useRef<string | null>(null);

  // Atualiza a URL do arquivo de vídeo selecionado
  useEffect(() => {
    if (videoBlobUrlRef.current) {
      URL.revokeObjectURL(videoBlobUrlRef.current);
      videoBlobUrlRef.current = null;
    }

    if (currentVideo?.file) {
      const url = URL.createObjectURL(currentVideo.file);
      videoBlobUrlRef.current = url;
      if (videoRef.current) {
        videoRef.current.src = url;
        videoRef.current.load();
        setIsPlaying(false);
        setCurrentTime(0);
      }
    } else if (videoRef.current) {
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }

    return () => {
      if (videoBlobUrlRef.current) {
        URL.revokeObjectURL(videoBlobUrlRef.current);
      }
    };
  }, [currentVideo?.file]);

  // Atualiza taxa de reprodução de acordo com adjustment.speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = adjustment.speed;
    }
  }, [adjustment.speed]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 16,
    height: 9,
  });

  const getLayerZIndex = useCallback(
    (layerId: LayerId): number => {
      const order = adjustment.layerOrder || DEFAULT_LAYER_ORDER;
      const idx = order.indexOf(layerId);
      return idx >= 0 ? (idx + 1) * 5 : 10;
    },
    [adjustment.layerOrder]
  );

  const isLayerHidden = useCallback(
    (layerId: LayerId): boolean => {
      return !!adjustment.hiddenLayers?.includes(layerId);
    },
    [adjustment.hiddenLayers]
  );

  /**
   * ORGANIZAR AUTOMATICAMENTE NO FORMATO 4:5 (1080 x 1350 px)
   * Alinha todos os elementos perfeitamente dentro do quadrado do meio indicado na imagem de referência.
   */
  const handleOrganizeIn45 = () => {
    onUpdateTemplate({
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

    // Centraliza o enquadramento do vídeo no meio
    onUpdateAdjustment({
      ...adjustment,
      cropPanX: 0,
      cropPanY: 0,
    });
  };

  // Verifica se uma coordenada Y está dentro da área segura 4:5 (14.84% a 85.16%)
  const isInside45 = (y: number) => {
    return y >= INSTAGRAM_FORMATS.timeline45.topPct && y <= INSTAGRAM_FORMATS.timeline45.bottomPct;
  };

  // Drag & drop dos elementos de template no preview
  const handlePointerDown = (
    el: SelectableCanvasElement,
    e: React.PointerEvent,
  ) => {
    if (isTemplateLocked && el !== "video") return;
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setSelectedElement(el);
    setDraggingElement(el);
  };

  // Início do arrasto em uma alça interativa da camada de vídeo (canto ou margem)
  const handleHandlePointerDown = (
    action: VideoHandleAction,
    e: React.PointerEvent,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current || !videoWrapperRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    setSelectedElement("video");
    setActiveHandleDrag({
      action,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startVideoWidth: adjustment.videoWidth ?? 96,
      startCropTop: adjustment.cropTop ?? 0,
      startCropBottom: adjustment.cropBottom ?? 0,
      startCropLeft: adjustment.cropLeft ?? 0,
      startCropRight: adjustment.cropRight ?? 0,
      startVideoRect: videoWrapperRef.current.getBoundingClientRect(),
      startContainerRect: containerRef.current.getBoundingClientRect(),
    });
  };

  // Início do arrasto em uma alça interativa de elemento de template (largura da caixa ou tamanho da fonte)
  const handleTemplateHandlePointerDown = (
    el: "headline" | "subHeadline" | "pageName" | "watermark" | "profile" | "badge",
    action: TemplateHandleAction,
    e: React.PointerEvent,
  ) => {
    if (isTemplateLocked) return;
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    setSelectedElement(el);

    let startFontSize = 24;
    let startMaxWidth = 88;
    let startSize = 54;

    if (el === "headline") {
      startFontSize = template.headline.fontSize;
      startMaxWidth = template.headline.maxWidth ?? 88;
    } else if (el === "subHeadline") {
      startFontSize = template.subHeadline.fontSize;
      startMaxWidth = template.subHeadline.maxWidth ?? 84;
    } else if (el === "pageName") {
      startFontSize = template.pageName.fontSize;
    } else if (el === "watermark") {
      startFontSize = template.watermark.fontSize ?? 18;
    } else if (el === "profile") {
      startSize = template.profilePic.size;
    } else if (el === "badge") {
      startSize = template.badge.size;
    }

    setActiveTemplateHandleDrag({
      element: el,
      action,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startFontSize,
      startMaxWidth,
      startSize,
      startContainerRect: containerRef.current.getBoundingClientRect(),
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 0. MANIPULAÇÃO DAS ALÇAS INTERATIVAS DE TEMPLATE / TEXTO (LARGURA E TAMANHO DA FONTE)
    if (activeTemplateHandleDrag) {
      const dx = e.clientX - activeTemplateHandleDrag.startX;
      const dy = e.clientY - activeTemplateHandleDrag.startY;
      const containerW = activeTemplateHandleDrag.startContainerRect.width || 340;
      const { element, action, startFontSize, startMaxWidth, startSize } = activeTemplateHandleDrag;

      // Foto de perfil ou Selo
      if (element === "profile") {
        const delta = action.includes("e") || action.includes("s") ? (dx + dy) / 2 : -(dx + dy) / 2;
        const newSize = Math.round(Math.max(20, Math.min(240, startSize + delta * 1.5)));
        onUpdateTemplate({
          ...template,
          profilePic: { ...template.profilePic, size: newSize },
        });
        setDragTooltip({
          x: Math.round(template.profilePic.x),
          y: Math.round(template.profilePic.y),
          label: `Foto: ${newSize}px`,
        });
        return;
      }

      if (element === "badge") {
        const delta = action.includes("e") || action.includes("s") ? (dx + dy) / 2 : -(dx + dy) / 2;
        const newSize = Math.round(Math.max(10, Math.min(80, startSize + delta * 1.2)));
        onUpdateTemplate({
          ...template,
          badge: { ...template.badge, size: newSize },
        });
        setDragTooltip({
          x: Math.round(template.badge.x),
          y: Math.round(template.badge.y),
          label: `Selo: ${newSize}px`,
        });
        return;
      }

      // Largura da Caixa de Texto (Alças laterais W / E)
      if (action === "resize-e" || action === "resize-w") {
        const rawDeltaPct = (dx / containerW) * 100;
        const deltaPct = action === "resize-e" ? rawDeltaPct : -rawDeltaPct;
        const align = element === "headline" ? template.headline.align : template.subHeadline.align;
        const factor = align === "center" ? 2 : 1;
        const newMaxWidth = Math.round(Math.max(10, Math.min(100, startMaxWidth + deltaPct * factor)));

        if (element === "headline") {
          onUpdateTemplate({
            ...template,
            headline: { ...template.headline, maxWidth: newMaxWidth },
          });
          setDragTooltip({
            x: Math.round(template.headline.x),
            y: Math.round(template.headline.y),
            label: `Largura Headline: ${newMaxWidth}%`,
          });
        } else if (element === "subHeadline") {
          onUpdateTemplate({
            ...template,
            subHeadline: { ...template.subHeadline, maxWidth: newMaxWidth },
          });
          setDragTooltip({
            x: Math.round(template.subHeadline.x),
            y: Math.round(template.subHeadline.y),
            label: `Largura Subtítulo: ${newMaxWidth}%`,
          });
        }
        return;
      }

      // Tamanho da Fonte (Cantos ou Alças verticais - SEM LIMITES)
      let deltaScale = 0;
      if (action === "scale-se") {
        deltaScale = (dx + dy) / 2;
      } else if (action === "scale-sw") {
        deltaScale = (-dx + dy) / 2;
      } else if (action === "scale-ne") {
        deltaScale = (dx - dy) / 2;
      } else if (action === "scale-nw") {
        deltaScale = (-dx - dy) / 2;
      } else if (action === "resize-s") {
        deltaScale = dy;
      } else if (action === "resize-n") {
        deltaScale = -dy;
      }

      const fontDelta = Math.round(deltaScale / 2.2);
      const newFontSize = Math.max(8, Math.round(startFontSize + fontDelta));

      if (element === "headline") {
        onUpdateTemplate({
          ...template,
          headline: { ...template.headline, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.headline.x),
          y: Math.round(template.headline.y),
          label: `Fonte Headline: ${newFontSize}px`,
        });
      } else if (element === "subHeadline") {
        onUpdateTemplate({
          ...template,
          subHeadline: { ...template.subHeadline, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.subHeadline.x),
          y: Math.round(template.subHeadline.y),
          label: `Fonte Subtítulo: ${newFontSize}px`,
        });
      } else if (element === "pageName") {
        onUpdateTemplate({
          ...template,
          pageName: { ...template.pageName, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.pageName.x),
          y: Math.round(template.pageName.y),
          label: `Fonte Nome: ${newFontSize}px`,
        });
      } else if (element === "watermark") {
        onUpdateTemplate({
          ...template,
          watermark: { ...template.watermark, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.watermark.x),
          y: Math.round(template.watermark.y),
          label: `Fonte Marca: ${newFontSize}px`,
        });
      }
      return;
    }

    // 1. MANIPULAÇÃO DAS ALÇAS INTERATIVAS DO VÍDEO (AUMENTAR/DIMINUIR E MARGENS)
    if (activeHandleDrag) {
      const dx = e.clientX - activeHandleDrag.startX;
      const dy = e.clientY - activeHandleDrag.startY;

      // Alças de canto: Aumentar e Diminuir tamanho (videoWidth de 30% a 140%)
      if (activeHandleDrag.action.startsWith("resize-")) {
        const containerW = activeHandleDrag.startContainerRect.width || 340;
        let deltaPct = 0;
        if (activeHandleDrag.action === "resize-se") {
          deltaPct = (dx / containerW) * 100;
        } else if (activeHandleDrag.action === "resize-sw") {
          deltaPct = (-dx / containerW) * 100;
        } else if (activeHandleDrag.action === "resize-ne") {
          deltaPct = (dx / containerW) * 100;
        } else if (activeHandleDrag.action === "resize-nw") {
          deltaPct = (-dx / containerW) * 100;
        }

        const newWidth = Math.round(
          Math.min(140, Math.max(30, activeHandleDrag.startVideoWidth + deltaPct * 2)),
        );

        onUpdateAdjustment({
          ...adjustment,
          videoWidth: newWidth,
        });

        setDragTooltip({
          x: Math.round(adjustment.videoX ?? 50),
          y: Math.round(adjustment.videoY ?? 53),
          label: `Largura: ${newWidth}%`,
        });
        return;
      }

      // Alças de borda: Dimensionar Margens de Recorte (cropTop, cropBottom, cropLeft, cropRight de 0% a 45%)
      const videoW = Math.max(50, activeHandleDrag.startVideoRect.width);
      const videoH = Math.max(50, activeHandleDrag.startVideoRect.height);

      if (activeHandleDrag.action === "crop-top") {
        const deltaPct = (dy / videoH) * 100;
        const newCropTop = Math.round(
          Math.min(45, Math.max(0, activeHandleDrag.startCropTop + deltaPct)),
        );
        onUpdateAdjustment({
          ...adjustment,
          cropTop: newCropTop,
          cropMode: "manual",
        });
        setDragTooltip({
          x: Math.round(adjustment.videoX ?? 50),
          y: Math.max(5, Math.round((adjustment.videoY ?? 53) - 15)),
          label: `Margem Topo: ${newCropTop}%`,
        });
        return;
      }

      if (activeHandleDrag.action === "crop-bottom") {
        const deltaPct = (-dy / videoH) * 100;
        const newCropBottom = Math.round(
          Math.min(45, Math.max(0, activeHandleDrag.startCropBottom + deltaPct)),
        );
        onUpdateAdjustment({
          ...adjustment,
          cropBottom: newCropBottom,
          cropMode: "manual",
        });
        setDragTooltip({
          x: Math.round(adjustment.videoX ?? 50),
          y: Math.min(95, Math.round((adjustment.videoY ?? 53) + 15)),
          label: `Margem Base: ${newCropBottom}%`,
        });
        return;
      }

      if (activeHandleDrag.action === "crop-left") {
        const deltaPct = (dx / videoW) * 100;
        const newCropLeft = Math.round(
          Math.min(45, Math.max(0, activeHandleDrag.startCropLeft + deltaPct)),
        );
        onUpdateAdjustment({
          ...adjustment,
          cropLeft: newCropLeft,
          cropMode: "manual",
        });
        setDragTooltip({
          x: Math.max(5, Math.round((adjustment.videoX ?? 50) - 20)),
          y: Math.round(adjustment.videoY ?? 53),
          label: `Margem Esquerda: ${newCropLeft}%`,
        });
        return;
      }

      if (activeHandleDrag.action === "crop-right") {
        const deltaPct = (-dx / videoW) * 100;
        const newCropRight = Math.round(
          Math.min(45, Math.max(0, activeHandleDrag.startCropRight + deltaPct)),
        );
        onUpdateAdjustment({
          ...adjustment,
          cropRight: newCropRight,
          cropMode: "manual",
        });
        setDragTooltip({
          x: Math.min(95, Math.round((adjustment.videoX ?? 50) + 20)),
          y: Math.round(adjustment.videoY ?? 53),
          label: `Margem Direita: ${newCropRight}%`,
        });
        return;
      }
    }

    if (!draggingElement || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let xPct = ((e.clientX - rect.left) / rect.width) * 100;
    let yPct = ((e.clientY - rect.top) / rect.height) * 100;

    // Limites da tela
    xPct = Math.min(100, Math.max(0, xPct));
    yPct = Math.min(100, Math.max(0, yPct));

    // Magnetic Snap ao Centro Horizontal (50%)
    let snappedX = false;
    let snappedY = false;
    if (Math.abs(xPct - 50) < 1.8) {
      xPct = 50;
      snappedX = true;
    }

    // Magnetic Snap aos limites do 4:5 (14.84% e 85.16%) e ao centro vertical (50%)
    if (Math.abs(yPct - INSTAGRAM_FORMATS.timeline45.topPct) < 1.5) {
      yPct = Math.round(INSTAGRAM_FORMATS.timeline45.topPct);
      snappedY = true;
    } else if (Math.abs(yPct - INSTAGRAM_FORMATS.timeline45.bottomPct) < 1.5) {
      yPct = Math.round(INSTAGRAM_FORMATS.timeline45.bottomPct);
      snappedY = true;
    } else if (Math.abs(yPct - 50) < 1.5) {
      yPct = 50;
      snappedY = true;
    }

    setIsSnapping({ x: snappedX, y: snappedY });

    const finalX = Math.round(xPct);
    const finalY = Math.round(yPct);

    setDragTooltip({
      x: finalX,
      y: finalY,
      label:
        draggingElement === "video"
          ? `Vídeo (${finalX}%, ${finalY}%)`
          : isInside45(finalY)
            ? "✓ 4:5 Seguro"
            : "⚠ Corta na Timeline",
    });

    switch (draggingElement) {
      case "profile":
        onUpdateTemplate({
          ...template,
          profilePic: { ...template.profilePic, x: finalX, y: finalY },
        });
        break;
      case "headline":
        onUpdateTemplate({
          ...template,
          headline: { ...template.headline, x: finalX, y: finalY },
        });
        break;
      case "subHeadline":
        onUpdateTemplate({
          ...template,
          subHeadline: { ...template.subHeadline, x: finalX, y: finalY },
        });
        break;
      case "watermark":
        onUpdateTemplate({
          ...template,
          watermark: { ...template.watermark, x: finalX, y: finalY },
        });
        break;
      case "pageName":
        onUpdateTemplate({
          ...template,
          pageName: { ...template.pageName, x: finalX, y: finalY },
        });
        break;
      case "badge":
        onUpdateTemplate({
          ...template,
          badge: { ...template.badge, x: finalX, y: finalY },
        });
        break;
      case "video":
        // Posicionamento livre do vídeo recortado
        onUpdateAdjustment({
          ...adjustment,
          videoX: finalX,
          videoY: finalY,
        });
        break;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTemplateHandleDrag) {
      try {
        e.currentTarget.releasePointerCapture(activeTemplateHandleDrag.pointerId);
      } catch {}
      setActiveTemplateHandleDrag(null);
      setDragTooltip(null);
    }
    if (activeHandleDrag) {
      try {
        e.currentTarget.releasePointerCapture(activeHandleDrag.pointerId);
      } catch {}
      setActiveHandleDrag(null);
      setDragTooltip(null);
    }
    if (draggingElement) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingElement(null);
      setDragTooltip(null);
      setIsSnapping({ x: false, y: false });
    }
  };

  // Listener global de window para garantir que o arrasto continue perfeitamente fluido mesmo se o mouse se mover rápido
  useEffect(() => {
    if (!activeTemplateHandleDrag) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - activeTemplateHandleDrag.startX;
      const dy = e.clientY - activeTemplateHandleDrag.startY;
      const containerW = activeTemplateHandleDrag.startContainerRect.width || 340;
      const { element, action, startFontSize, startMaxWidth, startSize } = activeTemplateHandleDrag;

      if (element === "profile") {
        const delta = action.includes("e") || action.includes("s") ? (dx + dy) / 2 : -(dx + dy) / 2;
        const newSize = Math.round(Math.max(20, Math.min(240, startSize + delta * 1.5)));
        onUpdateTemplate({
          ...template,
          profilePic: { ...template.profilePic, size: newSize },
        });
        setDragTooltip({
          x: Math.round(template.profilePic.x),
          y: Math.round(template.profilePic.y),
          label: `Foto: ${newSize}px`,
        });
        return;
      }

      if (element === "badge") {
        const delta = action.includes("e") || action.includes("s") ? (dx + dy) / 2 : -(dx + dy) / 2;
        const newSize = Math.round(Math.max(10, Math.min(80, startSize + delta * 1.2)));
        onUpdateTemplate({
          ...template,
          badge: { ...template.badge, size: newSize },
        });
        setDragTooltip({
          x: Math.round(template.badge.x),
          y: Math.round(template.badge.y),
          label: `Selo: ${newSize}px`,
        });
        return;
      }

      if (action === "resize-e" || action === "resize-w") {
        const rawDeltaPct = (dx / containerW) * 100;
        const deltaPct = action === "resize-e" ? rawDeltaPct : -rawDeltaPct;
        const align = element === "headline" ? template.headline.align : template.subHeadline.align;
        const factor = align === "center" ? 2 : 1;
        const newMaxWidth = Math.round(Math.max(10, Math.min(100, startMaxWidth + deltaPct * factor)));

        if (element === "headline") {
          onUpdateTemplate({
            ...template,
            headline: { ...template.headline, maxWidth: newMaxWidth },
          });
          setDragTooltip({
            x: Math.round(template.headline.x),
            y: Math.round(template.headline.y),
            label: `Largura Headline: ${newMaxWidth}%`,
          });
        } else if (element === "subHeadline") {
          onUpdateTemplate({
            ...template,
            subHeadline: { ...template.subHeadline, maxWidth: newMaxWidth },
          });
          setDragTooltip({
            x: Math.round(template.subHeadline.x),
            y: Math.round(template.subHeadline.y),
            label: `Largura Subtítulo: ${newMaxWidth}%`,
          });
        }
        return;
      }

      let deltaScale = 0;
      if (action === "scale-se") deltaScale = (dx + dy) / 2;
      else if (action === "scale-sw") deltaScale = (-dx + dy) / 2;
      else if (action === "scale-ne") deltaScale = (dx - dy) / 2;
      else if (action === "scale-nw") deltaScale = (-dx - dy) / 2;
      else if (action === "resize-s") deltaScale = dy;
      else if (action === "resize-n") deltaScale = -dy;

      const fontDelta = Math.round(deltaScale / 2.2);
      const newFontSize = Math.max(8, Math.round(startFontSize + fontDelta));

      if (element === "headline") {
        onUpdateTemplate({
          ...template,
          headline: { ...template.headline, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.headline.x),
          y: Math.round(template.headline.y),
          label: `Fonte Headline: ${newFontSize}px`,
        });
      } else if (element === "subHeadline") {
        onUpdateTemplate({
          ...template,
          subHeadline: { ...template.subHeadline, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.subHeadline.x),
          y: Math.round(template.subHeadline.y),
          label: `Fonte Subtítulo: ${newFontSize}px`,
        });
      } else if (element === "pageName") {
        onUpdateTemplate({
          ...template,
          pageName: { ...template.pageName, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.pageName.x),
          y: Math.round(template.pageName.y),
          label: `Fonte Nome: ${newFontSize}px`,
        });
      } else if (element === "watermark") {
        onUpdateTemplate({
          ...template,
          watermark: { ...template.watermark, fontSize: newFontSize },
        });
        setDragTooltip({
          x: Math.round(template.watermark.x),
          y: Math.round(template.watermark.y),
          label: `Fonte Marca: ${newFontSize}px`,
        });
      }
    };

    const handleWindowPointerUp = () => {
      setActiveTemplateHandleDrag(null);
      setDragTooltip(null);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [activeTemplateHandleDrag, onUpdateTemplate, template]);

  // Ajuste fino com teclado (Setas) para o elemento selecionado
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedElement) return;
      const step = e.shiftKey ? 0.2 : 1;
      let dx = 0;
      let dy = 0;

      if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else return;

      e.preventDefault();

      if (selectedElement === "profile") {
        onUpdateTemplate({
          ...template,
          profilePic: {
            ...template.profilePic,
            x: Math.min(100, Math.max(0, template.profilePic.x + dx)),
            y: Math.min(100, Math.max(0, template.profilePic.y + dy)),
          },
        });
      } else if (selectedElement === "pageName") {
        onUpdateTemplate({
          ...template,
          pageName: {
            ...template.pageName,
            x: Math.min(100, Math.max(0, template.pageName.x + dx)),
            y: Math.min(100, Math.max(0, template.pageName.y + dy)),
          },
        });
      } else if (selectedElement === "badge") {
        onUpdateTemplate({
          ...template,
          badge: {
            ...template.badge,
            x: Math.min(100, Math.max(0, template.badge.x + dx)),
            y: Math.min(100, Math.max(0, template.badge.y + dy)),
          },
        });
      } else if (selectedElement === "headline") {
        onUpdateTemplate({
          ...template,
          headline: {
            ...template.headline,
            x: Math.min(100, Math.max(0, template.headline.x + dx)),
            y: Math.min(100, Math.max(0, template.headline.y + dy)),
          },
        });
      } else if (selectedElement === "subHeadline") {
        onUpdateTemplate({
          ...template,
          subHeadline: {
            ...template.subHeadline,
            x: Math.min(100, Math.max(0, template.subHeadline.x + dx)),
            y: Math.min(100, Math.max(0, template.subHeadline.y + dy)),
          },
        });
      } else if (selectedElement === "watermark") {
        onUpdateTemplate({
          ...template,
          watermark: {
            ...template.watermark,
            x: Math.min(100, Math.max(0, template.watermark.x + dx)),
            y: Math.min(100, Math.max(0, template.watermark.y + dy)),
          },
        });
      } else if (selectedElement === "video") {
        onUpdateAdjustment({
          ...adjustment,
          videoX: Math.min(100, Math.max(0, (adjustment.videoX ?? 50) + dx)),
          videoY: Math.min(100, Math.max(0, (adjustment.videoY ?? 53) + dy)),
        });
      }
    },
    [selectedElement, template, onUpdateTemplate, adjustment, onUpdateAdjustment],
  );

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const canvasFilter = VideoProcessor.getCanvasFilter(
    adjustment.filter,
    adjustment.filterIntensity,
  );

  const vAspect =
    videoDimensions.width > 0 && videoDimensions.height > 0
      ? videoDimensions.width / videoDimensions.height
      : 16 / 9;

  const cropTop = Math.min(48, Math.max(0, adjustment.cropTop ?? 0));
  const cropBottom = Math.min(48, Math.max(0, adjustment.cropBottom ?? 0));
  const cropLeft = Math.min(48, Math.max(0, adjustment.cropLeft ?? 0));
  const cropRight = Math.min(48, Math.max(0, adjustment.cropRight ?? 0));

  const wFactor = Math.max(0.04, 1 - (cropLeft + cropRight) / 100);
  const hFactor = Math.max(0.04, 1 - (cropTop + cropBottom) / 100);
  const croppedAspect = vAspect * (wFactor / hFactor);
  const hasMarginCrop = cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0;

  // Parâmetros do formato de guia ativo
  const currentFormat = INSTAGRAM_FORMATS[activeGuideFormat];

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-sm outline-none focus:ring-1 focus:ring-primary/40"
    >
      {/* BARRA SUPERIOR DE CONTROLES: ORGANIZAR 4:5 + GUIAS + ZOOM */}
      <div className="flex flex-col gap-2.5 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* BOTÃO PRINCIPAL: ORGANIZAR NO QUADRADO 4:5 (1080 x 1350) */}
          <Button
            type="button"
            size="sm"
            onClick={handleOrganizeIn45}
            className="h-8 text-xs font-semibold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500 text-primary-foreground shadow-md"
            title="Auto-alinha o Cabeçalho, Headline, Vídeo central e Marca d'água perfeitamente no quadrado 4:5 (1080x1350px)"
          >
            <Sparkles className="size-3.5" />
            Organizar no 4:5 (1080x1350)
          </Button>

          {/* Toggle Modo em Massa vs Modo Individual */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onToggleApplyToAll(true)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                applyToAll
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({totalVideos})
            </button>
            <button
              type="button"
              onClick={() => onToggleApplyToAll(false)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                !applyToAll
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Este vídeo
            </button>
          </div>
        </div>

        {/* BARRA DE GUIAS E MODOS DE VISUALIZAÇÃO INSTAGRAM */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          {/* Seletor de Formato de Guia */}
          <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-secondary/20 p-0.5">
            <button
              type="button"
              onClick={() => {
                setActiveGuideFormat("timeline45");
                setShowGuides(true);
              }}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition flex items-center gap-1 ${
                activeGuideFormat === "timeline45" && showGuides
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Formato 4:5 (1080 x 1350 px) - Celular do meio com maior visibilidade na timeline"
            >
              <Smartphone className="size-3" />
              4:5 Timeline (1080x1350)
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveGuideFormat("reelsFeed35");
                setShowGuides(true);
              }}
              className={`px-2 py-0.5 text-[11px] rounded transition ${
                activeGuideFormat === "reelsFeed35" && showGuides
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Formato 3:5 (1080 x 1800 px) - Thumbnail do feed do Reels"
            >
              3:5 Reels
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveGuideFormat("profileGrid11");
                setShowGuides(true);
              }}
              className={`px-2 py-0.5 text-[11px] rounded transition ${
                activeGuideFormat === "profileGrid11" && showGuides
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Formato 1:1 (1080 x 1080 px) - Grade quadrada do perfil"
            >
              1:1 Perfil
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle de Guias */}
            <button
              type="button"
              onClick={() => setShowGuides(!showGuides)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
                showGuides
                  ? "border-primary/50 bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:bg-secondary/60"
              }`}
              title="Exibir ou ocultar linhas-guia das áreas seguras"
            >
              <Grid className="size-3" />
              <span>Guias</span>
            </button>

            {/* Simulação Máscara da Timeline */}
            <button
              type="button"
              onClick={() => setShowTimelineMask(!showTimelineMask)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
                showTimelineMask
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-400 font-medium"
                  : "border-border text-muted-foreground hover:bg-secondary/60"
              }`}
              title="Simular visualização do feed com os cortes superior e inferior do Instagram"
            >
              {showTimelineMask ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
              <span>Máscara Feed</span>
            </button>

            {/* Zoom do Preview */}
            <div className="flex rounded-md border border-border bg-secondary/30 p-0.5">
              <button
                onClick={() => setPreviewZoom("fit")}
                className={`px-1.5 py-0.5 text-[10px] rounded ${
                  previewZoom === "fit" ? "bg-secondary text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                Fit
              </button>
              <button
                onClick={() => setPreviewZoom(0.75)}
                className={`px-1.5 py-0.5 text-[10px] rounded ${
                  previewZoom === 0.75 ? "bg-secondary text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                75%
              </button>
              <button
                onClick={() => setPreviewZoom(1.0)}
                className={`px-1.5 py-0.5 text-[10px] rounded ${
                  previewZoom === 1.0 ? "bg-secondary text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                100%
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ÁREA CENTRAL: O CANVAS VERTICAL 9:16 COM INTERATIVIDADE TOTAL */}
      <div className="flex flex-1 items-center justify-center p-2 sm:p-4 overflow-hidden min-h-[460px]">
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={() => {
            // Se clicar fora de um elemento, desseleciona para visão limpa
            // mas mantém vídeo pronto se desejar
          }}
          className="relative aspect-[9/16] w-full max-w-[340px] sm:max-w-[380px] select-none rounded-2xl overflow-hidden border-2 border-border/80 shadow-2xl transition-transform"
          style={{
            backgroundColor: template.background?.color || "#000000",
            transform:
              previewZoom === 0.75
                ? "scale(0.85)"
                : previewZoom === 1.0
                  ? "scale(1.05)"
                  : "scale(1.0)",
          }}
        >
          {/* 1. O VÍDEO CENTRAL RECORTADO (CORTA MARGENS/FAIXAS PRETAS, CENÁRIO 100% VISÍVEL) */}
          <div
            style={{
              position: "absolute",
              left: `${adjustment.videoX ?? 50}%`,
              top: `${adjustment.videoY ?? 53}%`,
              width: `${adjustment.videoWidth ?? 96}%`,
              transform: `translate(-50%, -50%) rotate(${adjustment.rotation ?? 0}deg)`,
              zIndex: getLayerZIndex("video"),
              display: isLayerHidden("video") ? "none" : "block",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedElement("video");
            }}
            onPointerDown={(e) => handlePointerDown("video", e)}
            className={`cursor-move transition-shadow relative ${
              selectedElement === "video"
                ? "ring-2 ring-primary ring-offset-2 ring-offset-black rounded-lg shadow-2xl"
                : "hover:ring-1 hover:ring-white/40 rounded-lg"
            }`}
            title="Arraste para mover o vídeo ou use os controles de margem e tamanho na aba Editor"
          >
            {currentVideo ? (
              <div
                ref={videoWrapperRef}
                className="relative overflow-hidden bg-black flex items-center justify-center shadow-lg"
                style={{
                  width: "100%",
                  aspectRatio: `${croppedAspect}`,
                  borderRadius: `${adjustment.borderRadius ?? 8}px`,
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted={isMuted}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration);
                      if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
                        setVideoDimensions({
                          width: videoRef.current.videoWidth,
                          height: videoRef.current.videoHeight,
                        });
                      }
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                  className="pointer-events-none"
                  style={{
                    position: "absolute",
                    width: `${(100 / wFactor).toFixed(3)}%`,
                    height: `${(100 / hFactor).toFixed(3)}%`,
                    left: `${(-cropLeft / wFactor).toFixed(3)}%`,
                    top: `${(-cropTop / hFactor).toFixed(3)}%`,
                    maxWidth: "none",
                    maxHeight: "none",
                    objectFit: "fill",
                    filter: canvasFilter,
                    transform: `scale(${adjustment.zoom}) ${
                      adjustment.mirror ? "scaleX(-1)" : ""
                    } translate(${adjustment.cropPanX * 0.5}%, ${adjustment.cropPanY * 0.5}%)`,
                    transformOrigin: "center center",
                  }}
                />

                {/* Bounding Box Interativo da Camada de Vídeo (Representa SOMENTE O VÍDEO) */}
                {(selectedElement === "video" || adjustment.cropMode === "manual") && (
                  <>
                    {/* Contorno Bounding Box exclusivo do Vídeo */}
                    <div className="absolute inset-0 border-2 border-dashed border-primary pointer-events-none rounded-[inherit] z-10" />

                    {/* Guias Visuais de Corte de Margem quando ativos */}
                    {cropTop > 0 && (
                      <div className="absolute top-0 inset-x-0 border-b border-dashed border-amber-400/90 pointer-events-none z-15" />
                    )}
                    {cropBottom > 0 && (
                      <div className="absolute bottom-0 inset-x-0 border-t border-dashed border-amber-400/90 pointer-events-none z-15" />
                    )}
                    {cropLeft > 0 && (
                      <div className="absolute left-0 inset-y-0 border-r border-dashed border-amber-400/90 pointer-events-none z-15" />
                    )}
                    {cropRight > 0 && (
                      <div className="absolute right-0 inset-y-0 border-l border-dashed border-amber-400/90 pointer-events-none z-15" />
                    )}

                    {/* 4 ALÇAS DE CANTO: AUMENTAR E DIMINUIR O VÍDEO (RESIZE) */}
                    <div
                      onPointerDown={(e) => handleHandlePointerDown("resize-nw", e)}
                      className="absolute -top-3.5 -left-3.5 size-7 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Aumentar / Diminuir tamanho (arraste para dentro ou fora)"
                    >
                      <div className="size-3.5 bg-primary rounded-full shadow-lg border-2 border-white ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleHandlePointerDown("resize-ne", e)}
                      className="absolute -top-3.5 -right-3.5 size-7 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Aumentar / Diminuir tamanho (arraste para dentro ou fora)"
                    >
                      <div className="size-3.5 bg-primary rounded-full shadow-lg border-2 border-white ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleHandlePointerDown("resize-sw", e)}
                      className="absolute -bottom-3.5 -left-3.5 size-7 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Aumentar / Diminuir tamanho (arraste para dentro ou fora)"
                    >
                      <div className="size-3.5 bg-primary rounded-full shadow-lg border-2 border-white ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleHandlePointerDown("resize-se", e)}
                      className="absolute -bottom-3.5 -right-3.5 size-7 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Aumentar / Diminuir tamanho (arraste para dentro ou fora)"
                    >
                      <div className="size-3.5 bg-primary rounded-full shadow-lg border-2 border-white ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    {/* 4 ALÇAS DE BORDA: DIMENSIONAR AS MARGENS DO VÍDEO (CROP) */}
                    {/* Alça Margem Superior */}
                    <div
                      onPointerDown={(e) => handleHandlePointerDown("crop-top", e)}
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-14 h-7 flex items-center justify-center cursor-ns-resize select-none touch-none z-30 group"
                      title="Dimensionar Margem Superior (arraste para baixo para cortar a borda superior)"
                    >
                      <div
                        className={`h-2.5 px-2 rounded-full shadow-md border border-white flex items-center justify-center gap-1 group-hover:scale-110 transition-all ${
                          cropTop > 0 ? "bg-amber-500 text-white" : "bg-primary text-white"
                        }`}
                      >
                        <div className="w-3 h-0.5 bg-white rounded-full" />
                        {cropTop > 0 && (
                          <span className="text-[7.5px] font-bold font-mono leading-none">{cropTop}%</span>
                        )}
                      </div>
                    </div>

                    {/* Alça Margem Inferior */}
                    <div
                      onPointerDown={(e) => handleHandlePointerDown("crop-bottom", e)}
                      className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-14 h-7 flex items-center justify-center cursor-ns-resize select-none touch-none z-30 group"
                      title="Dimensionar Margem Inferior (arraste para cima para cortar a borda inferior)"
                    >
                      <div
                        className={`h-2.5 px-2 rounded-full shadow-md border border-white flex items-center justify-center gap-1 group-hover:scale-110 transition-all ${
                          cropBottom > 0 ? "bg-amber-500 text-white" : "bg-primary text-white"
                        }`}
                      >
                        <div className="w-3 h-0.5 bg-white rounded-full" />
                        {cropBottom > 0 && (
                          <span className="text-[7.5px] font-bold font-mono leading-none">{cropBottom}%</span>
                        )}
                      </div>
                    </div>

                    {/* Alça Margem Esquerda */}
                    <div
                      onPointerDown={(e) => handleHandlePointerDown("crop-left", e)}
                      className="absolute top-1/2 -left-3.5 -translate-y-1/2 w-7 h-14 flex items-center justify-center cursor-ew-resize select-none touch-none z-30 group"
                      title="Dimensionar Margem Esquerda (arraste para a direita para cortar a borda esquerda)"
                    >
                      <div
                        className={`w-2.5 py-2 rounded-full shadow-md border border-white flex flex-col items-center justify-center gap-1 group-hover:scale-110 transition-all ${
                          cropLeft > 0 ? "bg-amber-500 text-white" : "bg-primary text-white"
                        }`}
                      >
                        <div className="h-3 w-0.5 bg-white rounded-full" />
                        {cropLeft > 0 && (
                          <span className="text-[7px] font-bold font-mono leading-none">{cropLeft}%</span>
                        )}
                      </div>
                    </div>

                    {/* Alça Margem Direita */}
                    <div
                      onPointerDown={(e) => handleHandlePointerDown("crop-right", e)}
                      className="absolute top-1/2 -right-3.5 -translate-y-1/2 w-7 h-14 flex items-center justify-center cursor-ew-resize select-none touch-none z-30 group"
                      title="Dimensionar Margem Direita (arraste para a esquerda para cortar a borda direita)"
                    >
                      <div
                        className={`w-2.5 py-2 rounded-full shadow-md border border-white flex flex-col items-center justify-center gap-1 group-hover:scale-110 transition-all ${
                          cropRight > 0 ? "bg-amber-500 text-white" : "bg-primary text-white"
                        }`}
                      >
                        <div className="h-3 w-0.5 bg-white rounded-full" />
                        {cropRight > 0 && (
                          <span className="text-[7px] font-bold font-mono leading-none">{cropRight}%</span>
                        )}
                      </div>
                    </div>

                    {/* Badge de Informação e Ações Rápidas da Camada de Vídeo */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/90 backdrop-blur-md px-2 py-0.5 text-[9px] font-bold text-white shadow-xl flex items-center gap-1.5 pointer-events-auto border border-white/20 z-30">
                      <span className="flex items-center gap-1 text-primary">
                        <Crop className="size-3" /> Vídeo ({videoDimensions.width}x{videoDimensions.height})
                      </span>
                      <span className="opacity-80 font-mono text-[8.5px]">
                        Tam: {adjustment.videoWidth ?? 96}%
                      </span>
                      {hasMarginCrop && (
                        <span className="bg-amber-500/40 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded font-mono text-[8px]">
                          {cropTop ? `T:${cropTop}% ` : ""}
                          {cropBottom ? `B:${cropBottom}% ` : ""}
                          {cropLeft ? `L:${cropLeft}% ` : ""}
                          {cropRight ? `R:${cropRight}%` : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateAdjustment({ ...adjustment, videoX: 50, videoY: 53 });
                        }}
                        title="Centralizar perfeitamente no template"
                        className="hover:bg-primary/20 text-sky-300 px-1.5 py-0.5 rounded text-[8px] border border-sky-400/30 transition-colors"
                      >
                        Centralizar
                      </button>
                      {hasMarginCrop && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateAdjustment({
                              ...adjustment,
                              cropTop: 0,
                              cropBottom: 0,
                              cropLeft: 0,
                              cropRight: 0,
                            });
                          }}
                          title="Zerar corte de margens"
                          className="hover:bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded text-[8px] border border-rose-400/30 transition-colors"
                        >
                          Zerar corte
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground border border-dashed border-white/20 rounded-xl bg-secondary/10">
                <Smartphone className="size-8 opacity-40 mb-2 text-primary" />
                <p className="text-xs font-semibold text-foreground/80">Espaço Central do Vídeo</p>
                <p className="text-[10px] mt-1 text-muted-foreground/80 max-w-[220px]">
                  Adicione vídeos ao lado para ver o preview com o template organizado.
                </p>
              </div>
            )}
          </div>

          {/* 2. LINHAS-GUIA DE CORTE E TAMANHO (SIMULAÇÃO FIEL DA IMAGEM) */}
          {showGuides && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Centro Horizontal e Vertical */}
              <div
                className={`absolute left-0 top-1/2 w-full border-t border-dashed transition-colors ${
                  isSnapping.y ? "border-amber-400" : "border-sky-400/30"
                }`}
              />
              <div
                className={`absolute top-0 left-1/2 h-full border-l border-dashed transition-colors ${
                  isSnapping.x ? "border-amber-400" : "border-sky-400/30"
                }`}
              />

              {/* LINHA DE CORTE SUPERIOR (14.84% = 285px em 1920px) */}
              <div
                style={{ top: `${currentFormat.topPct}%` }}
                className="absolute left-0 w-full border-t-2 border-dashed border-sky-400/70"
              >
                <span className="absolute left-2 -top-4 rounded bg-sky-950/90 text-sky-300 border border-sky-500/40 px-1.5 py-0.2 text-[9px] font-mono tracking-tight font-medium shadow-sm">
                  {activeGuideFormat === "timeline45"
                    ? "Limite 4:5 Timeline (1080x1350)"
                    : currentFormat.label}
                </span>
                <span className="absolute right-2 -top-4 text-[9px] font-mono text-sky-300/80 bg-sky-950/80 px-1 rounded">
                  1080 px
                </span>
              </div>

              {/* LINHA DE CORTE INFERIOR (85.16% = 1635px em 1920px) */}
              <div
                style={{ top: `${currentFormat.bottomPct}%` }}
                className="absolute left-0 w-full border-t-2 border-dashed border-sky-400/70"
              >
                <span className="absolute left-2 -bottom-4 rounded bg-sky-950/90 text-sky-300 border border-sky-500/40 px-1.5 py-0.2 text-[9px] font-mono tracking-tight font-medium shadow-sm">
                  {activeGuideFormat === "timeline45"
                    ? "1350 px · Base do Post na Timeline"
                    : "Base da Área Visível"}
                </span>
              </div>

              {/* Borda do Quadrado 4:5 Central */}
              <div
                style={{
                  top: `${currentFormat.topPct}%`,
                  height: `${currentFormat.heightPct}%`,
                }}
                className="absolute inset-x-0 border-x-2 border-dashed border-sky-400/30 pointer-events-none"
              />
            </div>
          )}

          {/* 3. MÁSCARA DA TIMELINE DO INSTAGRAM (SIMULAÇÃO DO CORTE NO FEED) */}
          {showTimelineMask && (
            <div className="absolute inset-0 pointer-events-none z-15">
              {/* Máscara Superior (Corte de 0% a 14.84%) */}
              <div
                style={{ height: `${INSTAGRAM_FORMATS.timeline45.topPct}%` }}
                className="absolute inset-x-0 top-0 bg-black/75 backdrop-blur-[1px] border-b border-dashed border-amber-400/80 flex items-center justify-between px-3 text-[10px] text-amber-200"
              >
                <span className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="size-3 text-amber-400" /> Corte Superior Timeline
                </span>
                <span className="font-mono text-[9px] opacity-75">285px</span>
              </div>

              {/* Máscara Inferior (Corte de 85.16% a 100% com Botões de Ação do Feed) */}
              <div
                style={{
                  top: `${INSTAGRAM_FORMATS.timeline45.bottomPct}%`,
                  bottom: 0,
                }}
                className="absolute inset-x-0 bg-black/80 backdrop-blur-[1px] border-t border-dashed border-amber-400/80 p-2.5 flex flex-col justify-between text-white"
              >
                {/* Scrubber do Instagram simulado */}
                <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden">
                  <div className="bg-white h-full w-2/5 rounded-full" />
                </div>

                {/* Ícones de Interação do Feed (Like, Comentário, Enviar, Salvar) */}
                <div className="flex items-center justify-between pt-1 text-white/90">
                  <div className="flex items-center gap-3">
                    <Heart className="size-4 hover:text-rose-500" />
                    <MessageCircle className="size-4" />
                    <Send className="size-4" />
                  </div>
                  <Bookmark className="size-4" />
                </div>
              </div>
            </div>
          )}

          {/* AVISO DE TEMPLATE BLOQUEADO QUANDO NA ABA EDITOR */}
          {isTemplateLocked && (
            <div className="absolute top-2 left-2 right-2 z-35 flex items-center justify-between rounded-lg bg-black/85 backdrop-blur-md px-2.5 py-1 text-[10px] text-muted-foreground border border-white/10 shadow-lg pointer-events-auto">
              <span className="flex items-center gap-1.5 text-amber-300 font-medium">
                <Lock className="size-3 text-amber-400" />
                Template fixo (bloqueado)
              </span>
              {onRequestEditTemplate && (
                <button
                  type="button"
                  onClick={onRequestEditTemplate}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  Editar na aba Template →
                </button>
              )}
            </div>
          )}

          {/* 4. CAMADA INTERATIVA DE ELEMENTOS DO TEMPLATE (ARRASTÁVEIS E SELECIONÁVEIS) */}
          <div
            className={`absolute inset-0 overflow-hidden ${isTemplateLocked ? "pointer-events-none" : ""}`}
            style={{
              zIndex: 12,
              pointerEvents: isTemplateLocked ? "none" : "auto",
            }}
          >
            {/* FOTO DE PERFIL */}
            {template.profilePic.enabled && !isLayerHidden("profile") && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement("profile");
                }}
                onPointerDown={(e) => handlePointerDown("profile", e)}
                style={{
                  left: `${template.profilePic.x}%`,
                  top: `${template.profilePic.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: `${template.profilePic.size * 0.5}px`,
                  height: `${template.profilePic.size * 0.5}px`,
                  zIndex: getLayerZIndex("profile"),
                }}
                className={`absolute cursor-move transition-shadow ${
                  selectedElement === "profile"
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-black z-30"
                    : "hover:ring-1 hover:ring-white/70"
                }`}
              >
                {template.profilePic.imageUrl ? (
                  <div
                    className={`size-full overflow-hidden flex items-center justify-center ${
                      template.profilePic.circular ? "rounded-full" : "rounded-md"
                    }`}
                    style={{
                      border: template.profilePic.borderEnabled
                        ? `${Math.max(1, (template.profilePic.borderWidth || 2) * 0.5)}px solid ${
                            template.profilePic.borderColor || "#ffffff"
                          }`
                        : "none",
                    }}
                  >
                    <img
                      src={template.profilePic.imageUrl}
                      alt="Perfil"
                      className="size-full object-cover pointer-events-none transition-transform"
                      style={{
                        transform: `scale(${(template.profilePic.zoom ?? 100) / 100})`,
                        transformOrigin: "center center",
                      }}
                    />
                  </div>
                ) : (
                  <div className="size-full rounded-full bg-secondary/80 border border-border flex items-center justify-center text-[9px] text-muted-foreground pointer-events-none">
                    Foto
                  </div>
                )}

                {/* Handles e Identificador de Seleção da Foto */}
                {selectedElement === "profile" && (
                  <>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("profile", "scale-nw", e)}
                      className="absolute -top-2.5 -left-2.5 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a foto"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("profile", "scale-ne", e)}
                      className="absolute -top-2.5 -right-2.5 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a foto"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("profile", "scale-sw", e)}
                      className="absolute -bottom-2.5 -left-2.5 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a foto"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("profile", "scale-se", e)}
                      className="absolute -bottom-2.5 -right-2.5 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a foto"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900/95 border border-primary/40 px-2 py-0.5 text-[8px] font-bold text-white shadow-xl flex items-center gap-1.5 z-40 backdrop-blur-sm"
                    >
                      <span className="text-primary">Foto</span>
                      <span>{template.profilePic.size}px</span>
                      <div className="flex items-center gap-0.5 ml-1 border-l border-white/20 pl-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              profilePic: {
                                ...template.profilePic,
                                size: Math.max(20, template.profilePic.size - 4),
                              },
                            });
                          }}
                          className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                          title="Diminuir"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              profilePic: {
                                ...template.profilePic,
                                size: Math.min(240, template.profilePic.size + 4),
                              },
                            });
                          }}
                          className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                          title="Aumentar"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* NOME DA PÁGINA */}
            {template.pageName.enabled && !isLayerHidden("pageName") && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement("pageName");
                }}
                onPointerDown={(e) => handlePointerDown("pageName", e)}
                style={{
                  left: `${template.pageName.x}%`,
                  top: `${template.pageName.y}%`,
                  transform:
                    template.pageName.align === "center"
                      ? "translate(-50%, -50%)"
                      : template.pageName.align === "right"
                        ? "translate(-100%, -50%)"
                        : "translate(0, -50%)",
                  zIndex: getLayerZIndex("pageName"),
                }}
                className={`absolute cursor-move flex items-center gap-1.5 whitespace-nowrap drop-shadow-md px-1.5 py-0.5 rounded transition ${
                  selectedElement === "pageName"
                    ? "ring-2 ring-primary bg-black/60 z-30 shadow-lg"
                    : "hover:bg-black/30"
                }`}
              >
                <span
                  style={{
                    fontFamily: template.pageName.fontFamily || "'Outfit', sans-serif",
                    fontSize: `${template.pageName.fontSize * 0.65}px`,
                    fontWeight:
                      template.pageName.fontWeight === "bold"
                        ? 700
                        : template.pageName.fontWeight === "600"
                          ? 600
                          : 400,
                    color: template.pageName.color,
                  }}
                  className="pointer-events-none"
                >
                  {template.pageName.text}
                </span>

                {/* Selo ao lado do nome se badge não for arrastado separadamente */}
                {template.badge.enabled && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElement("badge");
                    }}
                    onPointerDown={(e) => handlePointerDown("badge", e)}
                    style={{
                      width: `${template.badge.size * 0.6}px`,
                      height: `${template.badge.size * 0.6}px`,
                    }}
                    className={`inline-flex items-center justify-center rounded-full bg-sky-500 text-white shrink-0 cursor-move ${
                      selectedElement === "badge" ? "ring-2 ring-primary" : ""
                    }`}
                    title="Selo de verificação (arrastável)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}

                {/* Handles e Identificador do Nome da Página */}
                {selectedElement === "pageName" && (
                  <>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("pageName", "scale-nw", e)}
                      className="absolute -top-2.5 -left-2.5 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("pageName", "scale-ne", e)}
                      className="absolute -top-2.5 -right-2.5 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("pageName", "scale-sw", e)}
                      className="absolute -bottom-2.5 -left-2.5 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("pageName", "scale-se", e)}
                      className="absolute -bottom-2.5 -right-2.5 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900/95 border border-primary/40 px-2 py-0.5 text-[8px] font-bold text-white shadow-xl flex items-center gap-1.5 z-40 backdrop-blur-sm"
                    >
                      <span className="text-primary font-bold">Nome</span>
                      <span>Fonte: {template.pageName.fontSize}px</span>
                      <div className="flex items-center gap-0.5 ml-1 border-l border-white/20 pl-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              pageName: {
                                ...template.pageName,
                                fontSize: Math.max(8, template.pageName.fontSize - 2),
                              },
                            });
                          }}
                          className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                          title="Diminuir fonte (A-)"
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              pageName: {
                                ...template.pageName,
                                fontSize: template.pageName.fontSize + 2,
                              },
                            });
                          }}
                          className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                          title="Aumentar fonte (A+)"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SELO DE VERIFICAÇÃO (quando selecionado individualmente) */}
            {selectedElement === "badge" && template.badge.enabled && (
              <div
                style={{
                  position: "absolute",
                  left: `${template.badge.x}%`,
                  top: `${template.badge.y}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 35,
                }}
                className="pointer-events-auto"
              >
                <div
                  onPointerDown={(e) => handleTemplateHandlePointerDown("badge", "scale-se", e)}
                  className="absolute -bottom-2.5 -right-2.5 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                  title="Arraste para redimensionar o selo"
                >
                  <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                </div>
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900/95 border border-primary/40 px-2 py-0.5 text-[8px] font-bold text-white shadow-xl flex items-center gap-1.5 z-40 backdrop-blur-sm"
                >
                  <span className="text-sky-400 font-bold">Selo</span>
                  <span>{template.badge.size}px</span>
                  <div className="flex items-center gap-0.5 ml-1 border-l border-white/20 pl-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTemplate({
                          ...template,
                          badge: { ...template.badge, size: Math.max(10, template.badge.size - 2) },
                        });
                      }}
                      className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTemplate({
                          ...template,
                          badge: { ...template.badge, size: Math.min(80, template.badge.size + 2) },
                        });
                      }}
                      className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* HEADLINE (TÍTULO PRINCIPAL) COM RESPONSIVIDADE E ARRASTO TOTAL SEM LIMITES */}
            {template.headline.enabled && !isLayerHidden("headline") && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement("headline");
                }}
                onPointerDown={(e) => handlePointerDown("headline", e)}
                style={{
                  fontFamily: template.headline.fontFamily || "'Outfit', sans-serif",
                  left: `${template.headline.x}%`,
                  top: `${template.headline.y}%`,
                  width: `${template.headline.maxWidth}%`,
                  maxWidth: "100%",
                  transform:
                    template.headline.align === "center"
                      ? "translate(-50%, -50%)"
                      : template.headline.align === "right"
                        ? "translate(-100%, -50%)"
                        : "translate(0, -50%)",
                  textAlign: template.headline.align,
                  fontSize: `${template.headline.fontSize * 0.6}px`,
                  fontWeight: template.headline.fontWeight === "bold" ? 700 : 600,
                  color: template.headline.color,
                  zIndex: getLayerZIndex("headline"),
                  wordBreak: "break-word",
                  lineHeight: 1.25,
                }}
                className={`absolute cursor-move drop-shadow-lg px-2.5 py-1.5 rounded transition select-none ${
                  selectedElement === "headline"
                    ? "ring-2 ring-primary bg-black/60 z-30 shadow-2xl"
                    : "hover:bg-black/30"
                }`}
              >
                {template.headline.text}

                {/* Handles Interativos de Largura e Tamanho da Fonte (Sem Limites) */}
                {selectedElement === "headline" && (
                  <>
                    {/* Alças Laterais W / E: Redimensionar Largura da Caixa de Texto */}
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "resize-w", e)}
                      className="absolute top-1/2 -left-3.5 -translate-y-1/2 w-6 h-10 flex items-center justify-center cursor-ew-resize select-none touch-none z-30 group"
                      title="Arraste para alterar a largura da caixa de texto"
                    >
                      <div className="w-2 h-6 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "resize-e", e)}
                      className="absolute top-1/2 -right-3.5 -translate-y-1/2 w-6 h-10 flex items-center justify-center cursor-ew-resize select-none touch-none z-30 group"
                      title="Arraste para alterar a largura da caixa de texto"
                    >
                      <div className="w-2 h-6 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    {/* Alças Verticais N / S: Redimensionar Tamanho da Fonte */}
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "resize-n", e)}
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-10 h-6 flex items-center justify-center cursor-ns-resize select-none touch-none z-30 group"
                      title="Arraste para alterar o tamanho da fonte"
                    >
                      <div className="w-6 h-2 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "resize-s", e)}
                      className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-10 h-6 flex items-center justify-center cursor-ns-resize select-none touch-none z-30 group"
                      title="Arraste para alterar o tamanho da fonte"
                    >
                      <div className="w-6 h-2 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    {/* 4 Alças de Canto: Escala de Fonte Proporcional */}
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "scale-nw", e)}
                      className="absolute -top-3 -left-3 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para aumentar ou diminuir a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "scale-ne", e)}
                      className="absolute -top-3 -right-3 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para aumentar ou diminuir a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "scale-sw", e)}
                      className="absolute -bottom-3 -left-3 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para aumentar ou diminuir a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("headline", "scale-se", e)}
                      className="absolute -bottom-3 -right-3 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para aumentar ou diminuir a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    {/* Barra Flutuante de Informações e Ações Rápidas */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900/95 border border-primary/40 px-2 py-0.5 text-[9px] font-bold text-white shadow-2xl flex items-center gap-1.5 z-40 backdrop-blur-md"
                    >
                      <span className="text-primary font-bold">Headline</span>
                      <span className="opacity-80">Fonte: {template.headline.fontSize}px</span>
                      <span className="opacity-40">|</span>
                      <span className="opacity-80">Caixa: {template.headline.maxWidth}%</span>
                      <div className="flex items-center gap-0.5 ml-1 border-l border-white/20 pl-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              headline: {
                                ...template.headline,
                                fontSize: Math.max(8, template.headline.fontSize - 2),
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[9px] font-bold"
                          title="Diminuir fonte (A-)"
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              headline: {
                                ...template.headline,
                                fontSize: template.headline.fontSize + 2,
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[9px] font-bold"
                          title="Aumentar fonte (A+)"
                        >
                          A+
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              headline: {
                                ...template.headline,
                                maxWidth: Math.max(10, (template.headline.maxWidth ?? 88) - 5),
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[8px] font-bold"
                          title="Estreitar caixa (↔-)"
                        >
                          ↔-
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              headline: {
                                ...template.headline,
                                maxWidth: Math.min(100, (template.headline.maxWidth ?? 88) + 5),
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[8px] font-bold"
                          title="Alargar caixa (↔+)"
                        >
                          ↔+
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextAlign =
                              template.headline.align === "left"
                                ? "center"
                                : template.headline.align === "center"
                                  ? "right"
                                  : "left";
                            onUpdateTemplate({
                              ...template,
                              headline: { ...template.headline, align: nextAlign },
                            });
                          }}
                          className="px-1 h-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[8px] font-mono"
                          title="Alternar alinhamento"
                        >
                          {template.headline.align === "left"
                            ? "Esq"
                            : template.headline.align === "right"
                              ? "Dir"
                              : "Cen"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SUB-HEADLINE (SUBTÍTULO) COM RESPONSIVIDADE E ARRASTO TOTAL SEM LIMITES */}
            {template.subHeadline.enabled && !isLayerHidden("subHeadline") && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement("subHeadline");
                }}
                onPointerDown={(e) => handlePointerDown("subHeadline", e)}
                style={{
                  fontFamily: template.subHeadline.fontFamily || "'Outfit', sans-serif",
                  left: `${template.subHeadline.x}%`,
                  top: `${template.subHeadline.y}%`,
                  width: `${template.subHeadline.maxWidth}%`,
                  maxWidth: "100%",
                  transform:
                    template.subHeadline.align === "center"
                      ? "translate(-50%, -50%)"
                      : template.subHeadline.align === "right"
                        ? "translate(-100%, -50%)"
                        : "translate(0, -50%)",
                  textAlign: template.subHeadline.align,
                  fontSize: `${template.subHeadline.fontSize * 0.6}px`,
                  fontWeight: template.subHeadline.fontWeight === "bold" ? 700 : 400,
                  color: template.subHeadline.color,
                  zIndex: getLayerZIndex("subHeadline"),
                  wordBreak: "break-word",
                  lineHeight: 1.25,
                }}
                className={`absolute cursor-move drop-shadow-md px-2.5 py-1.5 rounded transition select-none ${
                  selectedElement === "subHeadline"
                    ? "ring-2 ring-primary bg-black/60 z-30 shadow-2xl"
                    : "hover:bg-black/30"
                }`}
              >
                {template.subHeadline.text}

                {/* Handles Interativos do Subtítulo */}
                {selectedElement === "subHeadline" && (
                  <>
                    {/* Alças Laterais W / E */}
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "resize-w", e)}
                      className="absolute top-1/2 -left-3.5 -translate-y-1/2 w-6 h-10 flex items-center justify-center cursor-ew-resize select-none touch-none z-30 group"
                      title="Arraste para alterar a largura da caixa de texto"
                    >
                      <div className="w-2 h-6 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "resize-e", e)}
                      className="absolute top-1/2 -right-3.5 -translate-y-1/2 w-6 h-10 flex items-center justify-center cursor-ew-resize select-none touch-none z-30 group"
                      title="Arraste para alterar a largura da caixa de texto"
                    >
                      <div className="w-2 h-6 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    {/* Alças Verticais N / S */}
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "resize-n", e)}
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-10 h-6 flex items-center justify-center cursor-ns-resize select-none touch-none z-30 group"
                      title="Arraste para alterar o tamanho da fonte"
                    >
                      <div className="w-6 h-2 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "resize-s", e)}
                      className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-10 h-6 flex items-center justify-center cursor-ns-resize select-none touch-none z-30 group"
                      title="Arraste para alterar o tamanho da fonte"
                    >
                      <div className="w-6 h-2 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    {/* 4 Alças de Canto */}
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "scale-nw", e)}
                      className="absolute -top-3 -left-3 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "scale-ne", e)}
                      className="absolute -top-3 -right-3 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "scale-sw", e)}
                      className="absolute -bottom-3 -left-3 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("subHeadline", "scale-se", e)}
                      className="absolute -bottom-3 -right-3 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar a fonte livremente"
                    >
                      <div className="size-3.5 bg-white border-2 border-primary rounded-full shadow-lg ring-1 ring-black/50 group-hover:scale-125 transition-transform" />
                    </div>

                    {/* Barra Flutuante de Informações do Subtítulo */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900/95 border border-primary/40 px-2 py-0.5 text-[9px] font-bold text-white shadow-2xl flex items-center gap-1.5 z-40 backdrop-blur-md"
                    >
                      <span className="text-primary font-bold">Subtítulo</span>
                      <span className="opacity-80">Fonte: {template.subHeadline.fontSize}px</span>
                      <span className="opacity-40">|</span>
                      <span className="opacity-80">Caixa: {template.subHeadline.maxWidth}%</span>
                      <div className="flex items-center gap-0.5 ml-1 border-l border-white/20 pl-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              subHeadline: {
                                ...template.subHeadline,
                                fontSize: Math.max(8, template.subHeadline.fontSize - 2),
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[9px] font-bold"
                          title="Diminuir fonte (A-)"
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              subHeadline: {
                                ...template.subHeadline,
                                fontSize: template.subHeadline.fontSize + 2,
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[9px] font-bold"
                          title="Aumentar fonte (A+)"
                        >
                          A+
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              subHeadline: {
                                ...template.subHeadline,
                                maxWidth: Math.max(10, (template.subHeadline.maxWidth ?? 84) - 5),
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[8px] font-bold"
                          title="Estreitar caixa (↔-)"
                        >
                          ↔-
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              subHeadline: {
                                ...template.subHeadline,
                                maxWidth: Math.min(100, (template.subHeadline.maxWidth ?? 84) + 5),
                              },
                            });
                          }}
                          className="size-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[8px] font-bold"
                          title="Alargar caixa (↔+)"
                        >
                          ↔+
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextAlign =
                              template.subHeadline.align === "left"
                                ? "center"
                                : template.subHeadline.align === "center"
                                  ? "right"
                                  : "left";
                            onUpdateTemplate({
                              ...template,
                              subHeadline: { ...template.subHeadline, align: nextAlign },
                            });
                          }}
                          className="px-1 h-4 rounded bg-white/10 hover:bg-primary text-white flex items-center justify-center text-[8px] font-mono"
                          title="Alternar alinhamento"
                        >
                          {template.subHeadline.align === "left"
                            ? "Esq"
                            : template.subHeadline.align === "right"
                              ? "Dir"
                              : "Cen"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* MARCA D'ÁGUA / RODAPÉ */}
            {template.watermark.enabled && !isLayerHidden("watermark") && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement("watermark");
                }}
                onPointerDown={(e) => handlePointerDown("watermark", e)}
                style={{
                  left: `${template.watermark.x}%`,
                  top: `${template.watermark.y}%`,
                  transform: "translate(-50%, -50%)",
                  opacity: template.watermark.opacity / 100,
                  zIndex: getLayerZIndex("watermark"),
                }}
                className={`absolute cursor-move drop-shadow-md px-2 py-1 rounded transition ${
                  selectedElement === "watermark"
                    ? "ring-2 ring-primary bg-black/60 z-30 shadow-xl"
                    : "hover:bg-black/30"
                }`}
              >
                {template.watermark.type === "image" && template.watermark.imageUrl ? (
                  <img
                    src={template.watermark.imageUrl}
                    alt="Watermark"
                    className="h-7 w-auto object-contain pointer-events-none"
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: template.watermark.fontFamily || "'Outfit', sans-serif",
                      fontSize: `${(template.watermark.fontSize ?? 18) * 0.6}px`,
                    }}
                    className="font-bold text-white tracking-wider pointer-events-none"
                  >
                    {template.watermark.text}
                  </span>
                )}

                {/* Handles e Identificador da Marca d'Água */}
                {selectedElement === "watermark" && (
                  <>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("watermark", "scale-nw", e)}
                      className="absolute -top-2.5 -left-2.5 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("watermark", "scale-ne", e)}
                      className="absolute -top-2.5 -right-2.5 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("watermark", "scale-sw", e)}
                      className="absolute -bottom-2.5 -left-2.5 size-6 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                    <div
                      onPointerDown={(e) => handleTemplateHandlePointerDown("watermark", "scale-se", e)}
                      className="absolute -bottom-2.5 -right-2.5 size-6 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                      title="Arraste para redimensionar"
                    >
                      <div className="size-3 bg-white border-2 border-primary rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>

                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900/95 border border-primary/40 px-2 py-0.5 text-[8px] font-bold text-white shadow-xl flex items-center gap-1.5 z-40 backdrop-blur-sm"
                    >
                      <span className="text-primary font-bold">Marca d'água</span>
                      <span>Fonte: {template.watermark.fontSize ?? 18}px</span>
                      <div className="flex items-center gap-0.5 ml-1 border-l border-white/20 pl-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              watermark: {
                                ...template.watermark,
                                fontSize: Math.max(8, (template.watermark.fontSize ?? 18) - 2),
                              },
                            });
                          }}
                          className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                          title="Diminuir fonte (A-)"
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTemplate({
                              ...template,
                              watermark: {
                                ...template.watermark,
                                fontSize: (template.watermark.fontSize ?? 18) + 2,
                              },
                            });
                          }}
                          className="size-3.5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] font-bold"
                          title="Aumentar fonte (A+)"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TOOLTIP FLUTUANTE DURANTE O ARRASTO */}
            {dragTooltip && (
              <div
                style={{
                  left: `${dragTooltip.x}%`,
                  top: `${Math.max(8, dragTooltip.y - 8)}%`,
                  transform: "translate(-50%, -100%)",
                }}
                className="absolute pointer-events-none z-50 rounded-lg bg-black/90 px-2 py-1 text-[10px] font-mono text-white shadow-xl border border-white/20 flex items-center gap-1.5"
              >
                <Move className="size-2.5 text-primary" />
                <span>
                  X:{dragTooltip.x}% Y:{dragTooltip.y}%
                </span>
                <span
                  className={`px-1 py-0.2 rounded text-[9px] font-sans font-semibold ${
                    isInside45(dragTooltip.y)
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {dragTooltip.label}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BARRA INFERIOR: STATUS DE SEGURANÇA 4:5 + NAVEGAÇÃO ENTRE OS VÍDEOS */}
      <div className="border-t border-border/60 pt-3 space-y-2.5">
        {/* Indicador de Status dos Elementos em Relação ao Quadrado 4:5 */}
        <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Status 4:5:</span>
            {isInside45(template.headline.y) && isInside45(template.profilePic.y) && isInside45(template.watermark.y) ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <Check className="size-3" /> Todos os elementos dentro do 4:5 (1080x1350)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <AlertTriangle className="size-3" /> Atenção: algum elemento está fora da área 4:5
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleOrganizeIn45}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Reorganizar no 4:5
          </button>
        </div>

        {/* Scrubber de Tempo */}
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!currentVideo}
            className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40"
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
          </button>

          <span className="font-mono text-[11px] text-muted-foreground w-20">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </span>

          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={(e) => {
              const val = Number(e.target.value);
              setCurrentTime(val);
              if (videoRef.current) videoRef.current.currentTime = val;
            }}
            disabled={!currentVideo}
            className="flex-1 accent-primary h-1 bg-secondary rounded cursor-pointer"
          />

          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>

        {/* Navegação: Anterior | X/Total | Próximo */}
        <div className="flex items-center justify-between text-xs pt-0.5">
          <button
            type="button"
            onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
            disabled={currentIndex <= 0}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-medium transition hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="size-4" /> Anterior
          </button>

          <div className="text-center font-mono font-semibold">
            {totalVideos > 0 ? (
              <span className="text-foreground">
                Vídeo {currentIndex + 1} / {totalVideos}
              </span>
            ) : (
              <span className="text-muted-foreground">0 / 0 vídeos</span>
            )}
            {currentVideo && (
              <p className="text-[10px] text-muted-foreground font-sans truncate max-w-[200px]">
                {currentVideo.name}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate(Math.min(totalVideos - 1, currentIndex + 1))}
            disabled={currentIndex >= totalVideos - 1 || totalVideos === 0}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-medium transition hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Próximo <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
