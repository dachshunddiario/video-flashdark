"""
Módulo de Renderização de Vídeo de Alta Performance com FFmpeg + NVIDIA NVENC
Otimizado para GPUs NVIDIA (RTX 3090) e processamento em lote assíncrono.
"""

import asyncio
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
import shutil
import subprocess
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [Worker-%(process)d] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("VideoRenderer")


@dataclass
class CropArea:
    """Coordenadas e dimensões do recorte da área selecionada."""
    x: int
    y: int
    width: int
    height: int


@dataclass
class OverlayPosition:
    """Posicionamento do recorte dentro do template."""
    x: int
    y: int


@dataclass
class RenderTask:
    """Definição de uma tarefa individual de renderização."""
    task_id: str
    input_video_path: str
    template_path: str
    output_path: str
    crop: CropArea
    position: OverlayPosition
    cq: int = 26
    preset: str = "p4"
    target_bitrate: str = "1800k"
    max_bitrate: str = "2400k"
    buf_size: str = "4800k"


@dataclass
class RenderResult:
    """Resultado retornado após a execução de um worker."""
    task_id: str
    output_path: str
    success: bool
    elapsed_seconds: float
    error_message: Optional[str] = None


def get_ffmpeg_binary() -> str:
    """Retorna o caminho do binário do FFmpeg com suporte a NVENC."""
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        return which_ffmpeg
    
    known_paths = [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"),
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ]
    for p in known_paths:
        if os.path.exists(p):
            return p
    return "ffmpeg"


# ==============================================================================
# 1. CONSTRUÇÃO DO COMANDO FFMPEG COM ACELERAÇÃO POR HARDWARE (NVENC)
# ==============================================================================
def build_nvenc_ffmpeg_command(task: RenderTask) -> List[str]:
    """
    Constrói a lista de argumentos para o subprocess FFmpeg aproveitando 100%
    do pipeline de hardware NVIDIA:
    
    1. `-hwaccel cuda`: Decodificação acelerada na GPU antes da entrada do vídeo.
    2. `-filter_complex`: Executa crop + overlay em um único grafo de filtros.
    3. `-c:v h264_nvenc`: Codificador por hardware NVENC dedicado na RTX 3090.
    4. `-preset p4 -rc:v vbr -cq:v 26 -b:v target -maxrate max`: Taxa de bits enxuta sem perda de qualidade visual.
    5. `-spatial-aq 1 -temporal-aq 1`: Quantização adaptativa de hardware para textos e bordas super nítidas.
    6. `-c:a copy`: Cópia direta do fluxo de áudio sem recompressão.
    7. `-movflags +faststart`: Move os metadados (moov) para o início do arquivo,
       garantindo que a barra de progresso e o seek funcionem instantaneamente.
    """
    cmd: List[str] = [get_ffmpeg_binary(), "-y"]

    # Template (Entrada 0) - Pode ser imagem estática (.png/.jpg) ou vídeo de fundo
    is_template_image = Path(task.template_path).suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]
    if is_template_image:
        cmd.extend(["-loop", "1", "-i", task.template_path])
    else:
        cmd.extend(["-hwaccel", "cuda", "-i", task.template_path])

    # Vídeo Principal (Entrada 1) - Decodificação acelerada via CUDA
    cmd.extend([
        "-hwaccel", "cuda",
        "-i", task.input_video_path
    ])

    # Grafo de Filtros em Passo Único (Single-Pass Filter Complex)
    # [1:v] -> Recorta a área de interesse (crop=w:h:x:y)
    # [0:v][cropped] -> Posiciona sobre o template no ponto x, y (overlay=x:y)
    # shortest=1 garante sincronia com a duração do vídeo principal quando o template é imagem
    filter_graph = (
        f"[1:v]crop=w={task.crop.width}:h={task.crop.height}:x={task.crop.x}:y={task.crop.y}[cropped];"
        f"[0:v][cropped]overlay=x={task.position.x}:y={task.position.y}:shortest=1[outv]"
    )
    cmd.extend(["-filter_complex", filter_graph])

    # Mapeamento explícito de streams
    cmd.extend([
        "-map", "[outv]",    # Stream de vídeo processado pelo filter_complex
        "-map", "1:a?",      # Copia o áudio original do vídeo de entrada (se existir)
    ])

    # Parâmetros de Codificação NVENC e Áudio com VBR e Quantização Adaptativa
    cmd.extend([
        "-c:v", "h264_nvenc",
        "-preset", task.preset,
        "-rc:v", "vbr",
        "-cq:v", str(task.cq),
        "-b:v", task.target_bitrate,
        "-maxrate", task.max_bitrate,
        "-bufsize", task.buf_size,
        "-spatial-aq", "1",
        "-temporal-aq", "1",
        "-c:a", "copy",
        "-movflags", "+faststart"
    ])

    # Arquivo de Saída
    cmd.append(task.output_path)
    return cmd


def execute_ffmpeg_worker(task: RenderTask) -> RenderResult:
    """
    Função de nível superior (top-level) executada em processos separados
    pelo ProcessPoolExecutor.
    """
    start_time = time.perf_counter()
    output_dir = os.path.dirname(task.output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    cmd = build_nvenc_ffmpeg_command(task)
    logger.info(f"Iniciando renderização da tarefa '{task.task_id}' -> {task.output_path}")

    try:
        # Executa o processo do FFmpeg isolado no worker
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        elapsed = time.perf_counter() - start_time
        logger.info(f"Tarefa '{task.task_id}' concluída em {elapsed:.2f}s")
        return RenderResult(
            task_id=task.task_id,
            output_path=task.output_path,
            success=True,
            elapsed_seconds=elapsed,
        )
    except subprocess.CalledProcessError as e:
        elapsed = time.perf_counter() - start_time
        err_msg = e.stderr[-500:] if e.stderr else str(e)
        logger.error(f"Erro na renderização da tarefa '{task.task_id}':\n{err_msg}")
        return RenderResult(
            task_id=task.task_id,
            output_path=task.output_path,
            success=False,
            elapsed_seconds=elapsed,
            error_message=err_msg,
        )
    except Exception as ex:
        elapsed = time.perf_counter() - start_time
        logger.exception(f"Exceção inesperada na tarefa '{task.task_id}': {ex}")
        return RenderResult(
            task_id=task.task_id,
            output_path=task.output_path,
            success=False,
            elapsed_seconds=elapsed,
            error_message=str(ex),
        )


# ==============================================================================
# 2. GERENCIADOR DE PROCESSAMENTO EM PARALELO ASSÍNCRONO
# ==============================================================================
class AsyncBatchVideoProcessor:
    """
    Gerencia a fila de exportação distribuindo os vídeos entre 4 workers paralelos
    (ProcessPoolExecutor), sem bloquear o Event Loop do asyncio (UI / Back-end).
    
    Notifica o progresso individual de cada arquivo assim que um worker termina.
    """
    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers
        self._executor = ProcessPoolExecutor(max_workers=self.max_workers)

    async def render_batch(
        self,
        tasks: List[RenderTask],
        on_progress: Optional[Callable[[RenderResult, int, int], Coroutine[Any, Any, None]]] = None,
    ) -> List[RenderResult]:
        """
        Executa uma lista de tarefas em lote de forma não bloqueante.
        
        :param tasks: Lista de RenderTask para processamento.
        :param on_progress: Corrotina opcional chamada imediatamente após
                            o término de cada arquivo individual.
                            Assinatura: async def on_progress(result, completed, total)
        :return: Lista com os resultados de todas as tarefas.
        """
        loop = asyncio.get_running_loop()
        total = len(tasks)
        completed = 0
        results: List[RenderResult] = []

        logger.info(f"Disparando lote de {total} vídeos com {self.max_workers} instâncias NVENC simultâneas.")

        # Despacha todas as tarefas para o pool de processos sem travar o loop
        # asyncio.wrap_future converte o Future do concurrent.futures em um asyncio.Future
        async_futures = [
            asyncio.wrap_future(self._executor.submit(execute_ffmpeg_worker, task))
            for task in tasks
        ]

        # Conforme cada worker termina (ordem de conclusão independente),
        # notificamos o frontend/UI em tempo real
        for coro in asyncio.as_completed(async_futures):
            res = await coro
            completed += 1
            results.append(res)

            # Notificação assíncrona para a UI atualizar barra de progresso individual
            if on_progress:
                try:
                    await on_progress(res, completed, total)
                except Exception as cb_err:
                    logger.warning(f"Erro no callback de progresso: {cb_err}")

        logger.info(f"Lote finalizado: {completed}/{total} processados.")
        return results

    def shutdown(self, wait: bool = True):
        """Finaliza o pool de processos liberando os recursos da GPU/RAM."""
        self._executor.shutdown(wait=wait)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.shutdown(wait=True)


# ==============================================================================
# EXEMPLO DE USO / INTEGRAÇÃO COM FRONTEND (FASTAPI / WEBSOCKET / UI)
# ==============================================================================
async def exemplo_uso():
    """
    Demonstração de execução assíncrona consumindo uma fila de vídeos.
    """
    # Callback assíncrono que simula emissão de evento via WebSocket para o frontend
    async def notificar_frontend(result: RenderResult, completed_count: int, total_count: int):
        percentual = (completed_count / total_count) * 100
        status_str = "SUCESSO" if result.success else f"FALHA: {result.error_message}"
        print(
            f"[WS Event] Arquivo '{result.task_id}' finalizado ({status_str}) em {result.elapsed_seconds:.2f}s | "
            f"Progresso Geral: {completed_count}/{total_count} ({percentual:.1f}%)"
        )

    # Exemplo de lote com tarefas configuradas
    lote_tarefas = [
        RenderTask(
            task_id=f"Lote_{i+1:02d}_23_09_2026",
            input_video_path=f"videos_brutos/video_{i+1}.mp4",
            template_path="templates/moldura_1080x1920.png",
            output_path=f"exportados/Lote_{i+1:02d}_23_09_2026.mp4",
            crop=CropArea(x=140, y=0, width=800, height=1420),
            position=OverlayPosition(x=140, y=250),
            cq=20,
            preset="p4",
        )
        for i in range(8)
    ]

    # Processador com 4 instâncias simultâneas na RTX 3090
    async with AsyncBatchVideoProcessor(max_workers=4) as processor:
        resultados = await processor.render_batch(lote_tarefas, on_progress=notificar_frontend)
        print(f"\nResumo Final: {len([r for r in resultados if r.success])} vídeos exportados com sucesso.")


if __name__ == "__main__":
    # Teste de execução
    asyncio.run(exemplo_uso())
