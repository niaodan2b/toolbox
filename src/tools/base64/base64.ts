/**
 * Base64 编解码纯函数，UTF-8 安全。
 */

export function encode(input: string): string {
  if (typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  // Fallback
  return btoa(unescape(encodeURIComponent(input)));
}

export function decode(input: string): string {
  const cleaned = input.trim();
  if (!cleaned) return "";
  try {
    const binary = atob(cleaned);
    if (typeof TextDecoder !== "undefined") {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
    return decodeURIComponent(escape(binary));
  } catch {
    throw new Error("非法的 Base64 字符串");
  }
}
