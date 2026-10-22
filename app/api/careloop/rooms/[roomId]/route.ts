import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authorizeRoomRole,
  bearerToken,
  CareRequestError,
  deleteCareRequestRoomAsSender,
  deleteExpiredCareRequestRooms,
  isSafeRoomId,
  requestHasOriginMismatch,
  requireSenderRoomRole,
} from "@/lib/care-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ roomId: string }>;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  try {
    if (requestHasOriginMismatch(request)) throw new CareRequestError(403, "ไม่อนุญาตคำขอจากเว็บไซต์นี้");
    const { roomId } = await params;
    if (!isSafeRoomId(roomId)) throw new CareRequestError(404, "ไม่พบห้องคำขอ");
    const token = bearerToken(request);
    const room = await prisma.careRequestRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new CareRequestError(404, "ไม่พบห้องคำขอ");
    requireSenderRoomRole(authorizeRoomRole(token, room.senderTokenHash, room.receiverTokenHash));
    if (room.expiresAt.getTime() <= Date.now()) {
      await deleteExpiredCareRequestRooms(prisma.careRequestRoom);
      throw new CareRequestError(410, "ห้องคำขอนี้หมดอายุแล้ว");
    }
    await deleteCareRequestRoomAsSender({
      roomId: room.id,
      token,
      senderHash: room.senderTokenHash,
      receiverHash: room.receiverTokenHash,
      expiresAt: room.expiresAt,
    }, prisma.careRequestRoom);
    return json({ deleted: true });
  } catch (error) {
    if (error instanceof CareRequestError) return json({ error: error.message }, error.status);
    return json({ error: "ลบช่องทางคำขอไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}
