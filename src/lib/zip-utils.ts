/**
 * Utilitário de criação de arquivo ZIP 100% no navegador/cliente (zero dependências externas).
 * Gera arquivos ZIP válidos e compatíveis com Windows Explorer, WinRAR, 7-Zip e macOS.
 */

// Tabela de CRC32 pré-computada para performance máxima
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function calculateCrc32(data: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    const tableVal = CRC_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = (crc >>> 8) ^ tableVal;
  }
  return (crc ^ -1) >>> 0;
}

export interface ZipFileInput {
  name: string;
  data: Uint8Array | Blob;
}

/**
 * Cria um Blob ZIP contendo todos os arquivos fornecidos.
 */
export async function createZip(files: ZipFileInput[]): Promise<Blob> {
  const fileEntries: {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }[] = [];

  const encoder = new TextEncoder();
  let currentOffset = 0;

  const parts: any[] = [];

  // 1. Processa cada arquivo e cria o Local File Header + Dados
  for (const file of files) {
    let dataBytes: Uint8Array;
    if (file.data instanceof Blob) {
      const buffer = await file.data.arrayBuffer();
      dataBytes = new Uint8Array(buffer);
    } else {
      dataBytes = file.data;
    }

    const nameBytes = encoder.encode(file.name.replace(/\\/g, "/"));
    const crc = calculateCrc32(dataBytes);
    const size = dataBytes.length;

    // Header Local (30 bytes) + Nome do arquivo
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Assinatura Local File Header: "PK\x03\x04"
    view.setUint16(4, 20, true);         // Versão mínima necessária (2.0)
    view.setUint16(6, 0x0800, true);     // Flags (UTF-8)
    view.setUint16(8, 0, true);          // Compressão: 0 (Stored/Sem compressão para máxima velocidade com vídeo já comprimido)
    view.setUint16(10, 0, true);         // Hora DOS
    view.setUint16(12, 0, true);         // Data DOS
    view.setUint32(14, crc, true);       // CRC-32
    view.setUint32(18, size, true);      // Tamanho comprimido
    view.setUint32(22, size, true);      // Tamanho descompactado
    view.setUint16(26, nameBytes.length, true); // Comprimento do nome
    view.setUint16(28, 0, true);         // Comprimento do campo extra

    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(dataBytes);

    fileEntries.push({
      nameBytes,
      dataBytes,
      crc,
      size,
      offset: currentOffset,
    });

    currentOffset += localHeader.length + size;
  }

  // 2. Cria o Diretório Central (Central Directory)
  const centralDirStart = currentOffset;
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(cdHeader.buffer);

    view.setUint32(0, 0x02014b50, true); // Assinatura Central Directory: "PK\x01\x02"
    view.setUint16(4, 20, true);         // Versão feita por
    view.setUint16(6, 20, true);         // Versão mínima
    view.setUint16(8, 0x0800, true);     // Flags (UTF-8)
    view.setUint16(10, 0, true);         // Método de compressão (0 = Stored)
    view.setUint16(12, 0, true);         // Hora DOS
    view.setUint16(14, 0, true);         // Data DOS
    view.setUint32(16, entry.crc, true); // CRC-32
    view.setUint32(20, entry.size, true);// Tamanho comprimido
    view.setUint32(24, entry.size, true);// Tamanho descompactado
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);         // Campo extra
    view.setUint16(32, 0, true);         // Comentário
    view.setUint16(34, 0, true);         // Número do disco inicial
    view.setUint16(36, 0, true);         // Atributos internos
    view.setUint32(38, 0, true);         // Atributos externos
    view.setUint32(42, entry.offset, true); // Offset do Header Local

    cdHeader.set(entry.nameBytes, 46);

    parts.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // 3. Fim do Diretório Central (End of Central Directory Record - 22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, 0x06054b50, true); // Assinatura EOCD: "PK\x05\x06"
  eocdView.setUint16(4, 0, true);          // Número do disco
  eocdView.setUint16(6, 0, true);          // Disco do diretório central
  eocdView.setUint16(8, fileEntries.length, true);  // Entradas neste disco
  eocdView.setUint16(10, fileEntries.length, true); // Total de entradas
  eocdView.setUint32(12, centralDirSize, true);     // Tamanho do diretório central
  eocdView.setUint32(16, centralDirStart, true);    // Offset do início do diretório central
  eocdView.setUint16(20, 0, true);                  // Comprimento do comentário (0)

  parts.push(eocd);

  return new Blob(parts, { type: "application/zip" });
}

/**
 * Dispara o download de um Blob no navegador.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
