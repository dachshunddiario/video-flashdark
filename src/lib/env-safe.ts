/**
 * Utilitários seguros para ambientes edge, serverless (Lovable/Cloudflare) e desktop/Node local.
 */
export function safeCwd(): string {
  if (typeof process !== "undefined" && typeof process.cwd === "function") {
    try {
      return process.cwd();
    } catch {
      return ".";
    }
  }
  return ".";
}

export function isNodeEnvironment(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}
