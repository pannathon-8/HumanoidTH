import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type CareRequestRole = "sender" | "receiver";
export type CareRequestCategory = "assistance" | "communication" | "task" | "other";
export type CareRequestChannel = "text" | "preset" | "voice";
export type CareRequestAction = "accept" | "complete" | "cancel" | "decline";

export const CARE_REQUEST_LIMITS = {
  activeRooms: 100,
  requestsPerRoom: 20,
  totalRequests: 1_000,
  activeRequestHours: 24,
  roomPayloadBytes: 64,
  requestPayloadBytes: 4_096,
} as const;

export type NewCareRequest = {
  clientRequestId: string;
  message: string;
  category: CareRequestCategory;
  place: string | null;
  channel: CareRequestChannel;
};

export class CareRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function createAccessToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashAccessToken(token) };
}

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function matchAccessToken(token: string, storedHash: string) {
  const candidate = Buffer.from(hashAccessToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function authorizeRoomRole(token: string, senderHash: string, receiverHash: string): CareRequestRole {
  if (matchAccessToken(token, senderHash)) return "sender";
  if (matchAccessToken(token, receiverHash)) return "receiver";
  throw new CareRequestError(403, "รหัสเข้าห้องไม่ถูกต้อง");
}

export function requireSenderRoomRole(role: CareRequestRole) {
  if (role !== "sender") throw new CareRequestError(403, "เฉพาะผู้ส่งคำขอเท่านั้นที่จัดการช่องทางนี้ได้");
}

export function assertRoomQuota(activeRooms: number) {
  if (activeRooms >= CARE_REQUEST_LIMITS.activeRooms) throw new CareRequestError(429, "ขณะนี้มีช่องทางทดลองครบจำนวนแล้ว กรุณาลองใหม่ภายหลัง");
}

export function assertRequestQuota(requestsInRoom: number, totalRequests: number) {
  if (requestsInRoom >= CARE_REQUEST_LIMITS.requestsPerRoom || totalRequests >= CARE_REQUEST_LIMITS.totalRequests) {
    throw new CareRequestError(429, "ช่องทางทดลองนี้รับคำขอครบจำนวนแล้ว");
  }
}

type ExpiredRoomDelegate = {
  deleteMany(args: { where: { expiresAt: { lte: Date } } }): Promise<{ count: number }>;
};

export function deleteExpiredCareRequestRooms(delegate: ExpiredRoomDelegate, now = new Date()) {
  return delegate.deleteMany({ where: { expiresAt: { lte: now } } });
}

type CareRequestRoomDeleteDelegate = {
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
};

export async function deleteCareRequestRoomAsSender(
  input: { roomId: string; token: string; senderHash: string; receiverHash: string; expiresAt: Date },
  delegate: CareRequestRoomDeleteDelegate,
  now = new Date(),
) {
  const role = authorizeRoomRole(input.token, input.senderHash, input.receiverHash);
  requireSenderRoomRole(role);
  if (input.expiresAt.getTime() <= now.getTime()) throw new CareRequestError(410, "ห้องคำขอนี้หมดอายุแล้ว");
  const result = await delegate.deleteMany({ where: { id: input.roomId } });
  if (result.count !== 1) throw new CareRequestError(404, "ไม่พบห้องคำขอ");
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) throw new CareRequestError(401, "ต้องเข้าสู่ห้องคำขอก่อน");
  const match = /^Bearer ([A-Fa-f0-9]{64})$/.exec(header);
  if (!match) throw new CareRequestError(403, "รหัสเข้าห้องไม่ถูกต้อง");
  return match[1];
}

export function isSafeRoomId(id: string) {
  return /^[A-Za-z0-9_-]{1,100}$/.test(id);
}

export async function readJsonBody(request: Request, maxBytes = 4_096): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new CareRequestError(413, "ข้อมูลคำขอยาวเกินไป");
  }
  if (!request.body) throw new CareRequestError(400, "รูปแบบข้อมูลไม่ถูกต้อง");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new CareRequestError(413, "ข้อมูลคำขอยาวเกินไป");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof CareRequestError) throw error;
    throw new CareRequestError(400, "รูปแบบข้อมูลไม่ถูกต้อง");
  }
}

export function validateEmptyRoomBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
    throw new CareRequestError(400, "ข้อมูลสร้างห้องต้องเป็นวัตถุว่าง");
  }
}

export function validateRequestInput(body: unknown): NewCareRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CareRequestError(400, "ข้อมูลคำขอไม่ถูกต้อง");
  }
  const input = body as Record<string, unknown>;
  const allowedKeys = new Set(["clientRequestId", "message", "category", "place", "channel"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new CareRequestError(400, "มีข้อมูลคำขอที่ไม่รองรับ");
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (typeof input.clientRequestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.clientRequestId)) {
    throw new CareRequestError(400, "รหัสรายการคำขอไม่ถูกต้อง");
  }
  if (!message || [...message].length > 500) throw new CareRequestError(400, "ข้อความต้องมี 1 ถึง 500 ตัวอักษร");
  if (!["assistance", "communication", "task", "other"].includes(String(input.category))) {
    throw new CareRequestError(400, "ประเภทคำขอไม่ถูกต้อง");
  }
  if (!["text", "preset", "voice"].includes(String(input.channel))) {
    throw new CareRequestError(400, "ช่องทางคำขอไม่ถูกต้อง");
  }
  let place: string | null = null;
  if (input.place !== undefined && input.place !== null) {
    if (typeof input.place !== "string") throw new CareRequestError(400, "สถานที่ไม่ถูกต้อง");
    place = input.place.trim() || null;
    if (place && [...place].length > 100) throw new CareRequestError(400, "สถานที่ต้องไม่เกิน 100 ตัวอักษร");
  }
  return {
    clientRequestId: input.clientRequestId,
    message,
    category: input.category as CareRequestCategory,
    place,
    channel: input.channel as CareRequestChannel,
  };
}

export function sameRequestInput(
  left: NewCareRequest,
  right: { message: string; category: string; place: string | null; channel: string },
) {
  return left.message === right.message && left.category === right.category && left.place === right.place && left.channel === right.channel;
}

export function validateAction(body: unknown): CareRequestAction {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CareRequestError(400, "ข้อมูลการเปลี่ยนสถานะไม่ถูกต้อง");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !["accept", "complete", "cancel", "decline"].includes(String(input.action))) {
    throw new CareRequestError(400, "คำสั่งเปลี่ยนสถานะไม่ถูกต้อง");
  }
  return input.action as CareRequestAction;
}

export function transitionFor(role: CareRequestRole, status: string, action: CareRequestAction) {
  const transitions: Record<CareRequestAction, { role: CareRequestRole; from: string; to: string }> = {
    accept: { role: "receiver", from: "PENDING", to: "ACCEPTED" },
    complete: { role: "receiver", from: "ACCEPTED", to: "DONE" },
    cancel: { role: "sender", from: status, to: "CANCELLED" },
    decline: { role: "receiver", from: "PENDING", to: "DECLINED" },
  };
  const transition = transitions[action];
  if (role !== transition.role) throw new CareRequestError(403, "ไม่มีสิทธิ์ทำรายการนี้");
  if (action === "cancel" ? !["PENDING", "ACCEPTED"].includes(status) : status !== transition.from) {
    throw new CareRequestError(409, "คำขอนี้เปลี่ยนสถานะไปแล้ว");
  }
  return { expectedStatus: status, nextStatus: transition.to, actor: role, eventAction: action };
}

export function requestHasOriginMismatch(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    // Next.js may use an internal server hostname in request.url. The Host
    // header identifies the address that the browser actually requested.
    const host = request.headers.get("host") ?? target.host;
    return source.host !== host || source.protocol !== target.protocol;
  } catch {
    return true;
  }
}
