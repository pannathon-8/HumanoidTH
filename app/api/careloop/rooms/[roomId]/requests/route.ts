import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  bearerToken,
  assertRequestQuota,
  authorizeRoomRole,
  CARE_REQUEST_LIMITS,
  CareRequestError,
  deleteExpiredCareRequestRooms,
  isSafeRoomId,
  readJsonBody,
  requestHasOriginMismatch,
  sameRequestInput,
  validateRequestInput,
} from "@/lib/care-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ roomId: string }>;
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize(request: Request, roomId: string) {
  if (!isSafeRoomId(roomId)) throw new CareRequestError(404, "ไม่พบห้องคำขอ");
  const token = bearerToken(request);
  const room = await prisma.careRequestRoom.findUnique({ where: { id: roomId } });
  if (!room) throw new CareRequestError(404, "ไม่พบห้องคำขอ");
  const role = authorizeRoomRole(token, room.senderTokenHash, room.receiverTokenHash);
  if (room.expiresAt.getTime() <= Date.now()) {
    await deleteExpiredCareRequestRooms(prisma.careRequestRoom);
    throw new CareRequestError(410, "ห้องคำขอนี้หมดอายุแล้ว");
  }
  return { room, role };
}

function publicRequest(item: {
  id: string; message: string; category: string; place: string | null; channel: string; status: string;
  createdAt: Date; updatedAt: Date; events: { action: string; actor: string; createdAt: Date }[];
}) {
  return {
    id: item.id,
    message: item.message,
    category: item.category,
    place: item.place,
    channel: item.channel,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    events: item.events.map((event) => ({ action: event.action, actor: event.actor, createdAt: event.createdAt.toISOString() })),
  };
}

export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const { roomId } = await params;
    const { room, role } = await authorize(request, roomId);
    const requests = await prisma.careRequest.findMany({
      where: { roomId: room.id },
      include: { events: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
      take: CARE_REQUEST_LIMITS.requestsPerRoom,
    });
    return json({ role, expiresAt: room.expiresAt.toISOString(), requests: requests.map(publicRequest) });
  } catch (error) {
    if (error instanceof CareRequestError) return json({ error: error.message }, error.status);
    return json({ error: "โหลดรายการคำขอไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}

export async function POST(request: Request, { params }: { params: Params }) {
  let roomId: string | undefined;
  let input: ReturnType<typeof validateRequestInput> | undefined;
  try {
    if (requestHasOriginMismatch(request)) throw new CareRequestError(403, "ไม่อนุญาตคำขอจากเว็บไซต์นี้");
    ({ roomId } = await params);
    const { room, role } = await authorize(request, roomId);
    if (role !== "sender") throw new CareRequestError(403, "เฉพาะผู้ส่งคำขอเท่านั้นที่สร้างรายการได้");
    const validatedInput = validateRequestInput(await readJsonBody(request, CARE_REQUEST_LIMITS.requestPayloadBytes));
    input = validatedInput;
    const existing = await prisma.careRequest.findUnique({
      where: { roomId_clientRequestId: { roomId: room.id, clientRequestId: validatedInput.clientRequestId } },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (existing) {
      if (!sameRequestInput(validatedInput, existing)) throw new CareRequestError(409, "รหัสรายการนี้ใช้กับข้อความอื่นแล้ว");
      return json({ request: publicRequest(existing) });
    }
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731846205) IS NULL AS locked`;
      const now = new Date();
      await deleteExpiredCareRequestRooms(tx.careRequestRoom, now);
      const currentRoom = await tx.careRequestRoom.findFirst({
        where: { id: room.id, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (!currentRoom) throw new CareRequestError(410, "ห้องคำขอนี้หมดอายุแล้ว");
      const duplicate = await tx.careRequest.findUnique({
        where: { roomId_clientRequestId: { roomId: room.id, clientRequestId: validatedInput.clientRequestId } },
        include: { events: { orderBy: { createdAt: "asc" } } },
      });
      if (duplicate) {
        if (!sameRequestInput(validatedInput, duplicate)) throw new CareRequestError(409, "รหัสรายการนี้ใช้กับข้อความอื่นแล้ว");
        return duplicate;
      }
      const [requestsInRoom, totalRequests] = await Promise.all([
        tx.careRequest.count({ where: { roomId: room.id } }),
        tx.careRequest.count(),
      ]);
      assertRequestQuota(requestsInRoom, totalRequests);
      return tx.careRequest.create({
        data: {
          ...validatedInput,
          roomId: room.id,
          events: { create: { action: "created", actor: "sender" } },
        },
        include: { events: { orderBy: { createdAt: "asc" } } },
      });
    });
    return json({ request: publicRequest(created) }, 201);
  } catch (error) {
    if (error instanceof CareRequestError) return json({ error: error.message }, error.status);
    if (roomId && input && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      try {
        const room = await prisma.careRequestRoom.findUnique({ where: { id: roomId } });
        const existing = room && await prisma.careRequest.findUnique({
          where: { roomId_clientRequestId: { roomId: room.id, clientRequestId: input.clientRequestId } },
          include: { events: { orderBy: { createdAt: "asc" } } },
        });
        if (existing) {
          if (!sameRequestInput(input, existing)) throw new CareRequestError(409, "รหัสรายการนี้ใช้กับข้อความอื่นแล้ว");
          return json({ request: publicRequest(existing) });
        }
      } catch (retryError) {
        if (retryError instanceof CareRequestError) return json({ error: retryError.message }, retryError.status);
      }
    }
    return json({ error: "บันทึกคำขอไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}
