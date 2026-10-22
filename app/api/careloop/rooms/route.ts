import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CareRequestError,
  CARE_REQUEST_LIMITS,
  assertRoomQuota,
  createAccessToken,
  deleteExpiredCareRequestRooms,
  readJsonBody,
  requestHasOriginMismatch,
  validateEmptyRoomBody,
} from "@/lib/care-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (requestHasOriginMismatch(request)) throw new CareRequestError(403, "ไม่อนุญาตคำขอจากเว็บไซต์นี้");
    validateEmptyRoomBody(await readJsonBody(request, CARE_REQUEST_LIMITS.roomPayloadBytes));
    const sender = createAccessToken();
    const receiver = createAccessToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CARE_REQUEST_LIMITS.activeRequestHours * 60 * 60 * 1_000);
    const room = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731846205) IS NULL AS locked`;
      await deleteExpiredCareRequestRooms(tx.careRequestRoom, now);
      const activeRooms = await tx.careRequestRoom.count({ where: { expiresAt: { gt: now } } });
      assertRoomQuota(activeRooms);
      return tx.careRequestRoom.create({
        data: { senderTokenHash: sender.hash, receiverTokenHash: receiver.hash, expiresAt },
        select: { id: true, expiresAt: true },
      });
    });
    return json({ roomId: room.id, senderToken: sender.token, receiverToken: receiver.token, expiresAt: room.expiresAt.toISOString() }, 201);
  } catch (error) {
    if (error instanceof CareRequestError) return json({ error: error.message }, error.status);
    return json({ error: "บันทึกห้องคำขอไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}
