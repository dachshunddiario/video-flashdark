/**
 * Ponte para o FFmpeg LOCAL.
 *
 * Em ambiente desktop (Tauri) existe `window.__TAURI_INTERNALS__` e usamos
 * `invoke("run_ffmpeg", { args })` — o binário roda na máquina do usuário e
 * nenhum arquivo é enviado para a internet.
 *
 * No navegador (preview) não há acesso a processos nativos, então a fila roda
 * em modo simulação e os comandos ficam visíveis para conferência/cópia.
 */
import type { EditorPreset } from "./types";

export function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Monta os argumentos de FFmpeg para um arquivo de entrada. */
export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  p: EditorPreset,
): string[] {
  const filters: string[] = [];

  if (p.aspect !== "original") {
    const ratio =
      p.aspect === "9:16"
        ? "ih*9/16:ih"
        : p.aspect === "1:1"
          ? "ih:ih"
          : "iw:iw*9/16";
    filters.push(`crop=${ratio}`);
  }
  if (p.zoom > 0) {
    const scale = 1 + p.zoom / 100;
    filters.push(`scale=iw*${scale.toFixed(3)}:-2`, "crop=iw/1:ih/1");
  }
  if (p.mirror) filters.push("hflip");
  if (p.brightness !== 0 || p.saturation !== 1) {
    filters.push(
      `eq=brightness=${p.brightness.toFixed(2)}:saturation=${p.saturation.toFixed(2)}`,
    );
  }
  if (p.speed !== 1) filters.push(`setpts=${(1 / p.speed).toFixed(3)}*PTS`);
  if (p.watermarkText.trim()) {
    const text = p.watermarkText.replace(/[:']/g, "");
    filters.push(
      `drawtext=text='${text}':fontcolor=white@0.75:fontsize=h/24:x=w-tw-40:y=h-th-60`,
    );
  }
  filters.push(`fps=${p.fps}`);

  const args: string[] = ["-y"];
  if (p.trimStart > 0) args.push("-ss", String(p.trimStart));
  args.push("-i", inputPath);
  if (p.trimEnd > 0) args.push("-t", String(Math.max(0.1, p.trimEnd - p.trimStart)));
  args.push("-vf", filters.join(","));
  if (p.removeAudio) args.push("-an");
  else if (p.speed !== 1) args.push("-af", `atempo=${Math.min(2, Math.max(0.5, p.speed))}`);
  args.push("-c:v", p.outputFormat === "webm" ? "libvpx-vp9" : "libx264");
  args.push("-crf", String(p.crf), "-preset", "veryfast", outputPath);
  return args;
}

export function previewCommand(
  ffmpegPath: string,
  inputName: string,
  preset: EditorPreset,
) {
  const out = `${preset.outputDir}/${inputName.replace(/\.[^.]+$/, "")}_edit.${preset.outputFormat}`;
  return [ffmpegPath, ...buildFfmpegArgs(inputName, out, preset)]
    .map((a) => (a.includes(" ") ? `"${a}"` : a))
    .join(" ");
}

/** Executa o FFmpeg local via Tauri. Lança erro fora do desktop. */
export async function runFfmpegLocal(args: string[]): Promise<string> {
  if (!isDesktopRuntime()) {
    throw new Error("FFmpeg local disponível apenas no aplicativo desktop.");
  }
  const invoke = (
    window as unknown as {
      __TAURI_INTERNALS__: { invoke: (cmd: string, a: unknown) => Promise<string> };
    }
  ).__TAURI_INTERNALS__.invoke;
  return invoke("run_ffmpeg", { args });
}
