import { useRef, useEffect, useState } from "react";
import type { BackgroundRemovalSettings, ManualMaskStroke } from "@/lib/types";
import { uid } from "@/lib/local-store";

interface ManualMaskCanvasProps {
  settings: BackgroundRemovalSettings;
  onChangeSettings: (updated: BackgroundRemovalSettings) => void;
  width: number;
  height: number;
}

export function ManualMaskCanvas({
  settings,
  onChangeSettings,
  width,
  height,
}: ManualMaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Redesenha os traços acumulados no canvas transparente de preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Renderiza traços gravados
    const allStrokes = [...settings.manualStrokes];
    if (currentStroke.length > 0) {
      allStrokes.push({
        id: "active",
        type: settings.currentTool,
        points: currentStroke,
        brushSize: settings.brushSize,
        brushSoftness: settings.brushSoftness,
      });
    }

    for (const stroke of allStrokes) {
      if (!stroke.points || stroke.points.length === 0) continue;

      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = stroke.brushSize * (width / 360);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.type === "add") {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.45)"; // Azul translúcido para adicionar
      } else {
        ctx.strokeStyle = "rgba(244, 63, 94, 0.55)"; // Vermelho translúcido para remover
      }

      const p0 = stroke.points[0];
      if (!p0) continue;
      ctx.moveTo((p0.x / 100) * width, (p0.y / 100) * height);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        if (!pt) continue;
        ctx.lineTo((pt.x / 100) * width, (pt.y / 100) * height);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [settings.manualStrokes, currentStroke, settings.currentTool, settings.brushSize, settings.brushSoftness, width, height]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));

    setIsDrawing(true);
    setCurrentStroke([{ x: xPct, y: yPct }]);
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (!isDrawing) return;
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));

    setCurrentStroke((prev) => [...prev, { x: xPct, y: yPct }]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    setIsDrawing(false);

    if (currentStroke.length > 0) {
      const newStroke: ManualMaskStroke = {
        id: uid(),
        type: settings.currentTool,
        points: currentStroke,
        brushSize: settings.brushSize,
        brushSoftness: settings.brushSoftness,
      };

      onChangeSettings({
        ...settings,
        manualStrokes: [...settings.manualStrokes, newStroke],
      });
    }

    setCurrentStroke([]);
  };

  return (
    <div className="absolute inset-0 z-30 pointer-events-auto cursor-crosshair">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setCursorPos(null)}
        className="size-full touch-none"
      />

      {/* Indicador do tamanho do pincel flutuando com o cursor */}
      {cursorPos && (
        <div
          style={{
            left: `${cursorPos.x}px`,
            top: `${cursorPos.y}px`,
            width: `${settings.brushSize}px`,
            height: `${settings.brushSize}px`,
            transform: "translate(-50%, -50%)",
          }}
          className={`pointer-events-none absolute rounded-full border-2 transition-transform ${
            settings.currentTool === "add"
              ? "border-sky-400 bg-sky-400/20 shadow-sky-500/50"
              : "border-rose-400 bg-rose-400/20 shadow-rose-500/50"
          }`}
        />
      )}
    </div>
  );
}
