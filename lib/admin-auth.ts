const SESSION_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function toBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function configuredAdmin() {
  const email = process.env.ADMIN_BASIC_USER?.trim().toLowerCase();
  const password = process.env.ADMIN_BASIC_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  return email && password && secret ? { email, password, secret } : null;
}

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

export function isAdminLoginConfigured() {
  return configuredAdmin() !== null;
}

export function publicAccountRole(role: string): "USER" | "RESEARCHER" {
  return role === "RESEARCHER" ? "RESEARCHER" : "USER";
}

export function verifyAdminCredentials(email: string, password: string) {
  const admin = configuredAdmin();
  return Boolean(admin && email.trim().toLowerCase() === admin.email && password === admin.password);
}

export async function createAdminSession(email: string) {
  const admin = configuredAdmin();
  if (!admin || email.trim().toLowerCase() !== admin.email) throw new Error("Admin login is not configured.");
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ email: admin.email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  return `${payload}.${await signature(payload, admin.secret)}`;
}

export async function verifyAdminSession(token: string | undefined) {
  const admin = configuredAdmin();
  if (!admin || !token) return false;
  const [payload, suppliedSignature, ...extra] = token.split(".");
  if (!payload || !suppliedSignature || extra.length) return false;
  try {
    const expected = await signature(payload, admin.secret);
    const expectedBytes = fromBase64Url(expected);
    const suppliedBytes = fromBase64Url(suppliedSignature);
    if (expectedBytes.length !== suppliedBytes.length || !crypto.subtle) return false;
    let mismatch = 0;
    for (let i = 0; i < expectedBytes.length; i++) mismatch |= expectedBytes[i] ^ suppliedBytes[i];
    if (mismatch !== 0) return false;
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { email?: unknown; exp?: unknown };
    return session.email === admin.email && typeof session.exp === "number" && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function authorizeAdminAction(token: string | undefined, email: string | undefined, role: string | undefined) {
  if (!(await verifyAdminSession(token)) || role !== "ADMIN" || !email) return false;
  return email.trim().toLowerCase() === configuredAdmin()?.email;
}

export const adminSessionCookie = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SECONDS
};
