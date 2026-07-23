export const GOOGLE_STATE_COOKIE = "tenex_google_oauth";
export const GOOGLE_SESSION_COOKIE = "tenex_google_session";

export type GoogleOAuthState = {
  state: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
};

export type GoogleSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
  scope?: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sessionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function seal<T>(payload: T) {
  const key = await sessionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  const value = new Uint8Array(iv.length + encrypted.byteLength);
  value.set(iv);
  value.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64Url(value);
}

export async function unseal<T>(value: string | undefined): Promise<T | null> {
  if (!value) return null;
  try {
    const bytes = base64UrlToBytes(value);
    if (bytes.length <= 12) return null;
    const key = await sessionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return JSON.parse(decoder.decode(decrypted)) as T;
  } catch {
    return null;
  }
}

export function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function parseCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const pair of header.split(";")) {
    const [key, ...parts] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return undefined;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean; path?: string },
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    `Path=${options.path ?? "/"}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

