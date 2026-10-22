import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  bearerToken,
  authorizeRoomRole,
  CARE_REQUEST_LIMITS,
  CareRequestError,
  deleteExpiredCareRequestRooms,
  isSafeRoomId,
  readJsonBody,
  requestHasOriginMismatch,
  validateAction,
  transitionFor,
} from "@/lib/care-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ roomId: string; requestId: string }>;
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    if (requestHasOriginMismatch(request)) throw new CareRequestError(403, "ไม่อนุญาตคำขอจากเว็บไซต์นี้");
    const action = validateAction(await readJsonBody(request, CARE_REQUEST_LIMITS.roomPayloadBytes));
    const { roomId, requestId } = await params;
    if (!isSafeRoomId(roomId) || !isSafeRoomId(requestId)) throw new CareRequestError(404, "ไม่พบคำขอนี้");
    const token = bearerToken(request);
    const room = await prisma.careRequestRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new CareRequestError(404, "ไม่พบห้องคำขอ");
    const role = authorizeRoomRole(token, room.senderTokenHash, room.receiverTokenHash);
    if (room.expiresAt.getTime() <= Date.now()) {
      await deleteExpiredCareRequestRooms(prisma.careRequestRoom);
      throw new CareRequestError(410, "ห้องคำขอนี้หมดอายุแล้ว");
    }

    const current = await prisma.careRequest.findFirst({ where: { id: requestId, roomId: room.id }, select: { status: true } });
    if (!current) throw new CareRequestError(404, "ไม่พบคำขอนี้");
    const transition = transitionFor(role, current.status, action);
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.careRequest.updateMany({
        where: { id: requestId, roomId: room.id, status: transition.expectedStatus },
        data: { status: transition.nextStatus },
      });
      if (result.count !== 1) throw new CareRequestError(409, "คำขอนี้เปลี่ยนสถานะไปแล้ว");
      await tx.careRequestEvent.create({
        data: { requestId, action: transition.eventAction, actor: transition.actor },
      });
      return tx.careRequest.findFirstOrThrow({
        where: { id: requestId, roomId: room.id },
        include: { events: { orderBy: { createdAt: "asc" } } },
      });
    });
    return json({ request: {
      id: updated.id,
      message: updated.message,
      category: updated.category,
      place: updated.place,
      channel: updated.channel,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      events: updated.events.map((event) => ({ action: event.action, actor: event.actor, createdAt: event.createdAt.toISOString() })),
    } });
  } catch (error) {
    if (error instanceof CareRequestError) return json({ error: error.message }, error.status);
    return json({ error: "เปลี่ยนสถานะคำขอไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}
