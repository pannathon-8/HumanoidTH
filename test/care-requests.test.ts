import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bearerToken,
  assertRequestQuota,
  assertRoomQuota,
  authorizeRoomRole,
  CareRequestError,
  createAccessToken,
  deleteExpiredCareRequestRooms,
  deleteCareRequestRoomAsSender,
  matchAccessToken,
  sameRequestInput,
  requestHasOriginMismatch,
  requireSenderRoomRole,
  readJsonBody,
  transitionFor,
  validateAction,
  validateEmptyRoomBody,
  validateRequestInput,
} from "../lib/care-requests";

const validInput = {
  clientRequestId: "9a260a2a-20c1-4dd1-8bbf-b4d6577e69b2",
  message: "  ช่วยหยิบแก้วน้ำ  ",
  category: "assistance",
  place: "  ห้องทดลอง  ",
  channel: "text",
};

test("origin validation uses the requested Host behind Next's internal URL", () => {
  assert.equal(requestHasOriginMismatch(new Request("http://localhost:3000/api", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } })), false);
  assert.equal(requestHasOriginMismatch(new Request("http://localhost:3000/api", { headers: { host: "127.0.0.1:3000", origin: "https://different.example" } })), true);
  assert.equal(requestHasOriginMismatch(new Request("http://localhost:3000/api", { headers: { origin: "null" } })), true);
});

function expectError(action: () => unknown, status: number) {
  assert.throws(action, (error) => error instanceof CareRequestError && error.status === status);
}

test("request input trims text, normalizes an empty place, and rejects untrusted fields", () => {
  assert.deepEqual(validateRequestInput(validInput), {
    clientRequestId: validInput.clientRequestId,
    message: "ช่วยหยิบแก้วน้ำ",
    category: "assistance",
    place: "ห้องทดลอง",
    channel: "text",
  });
  assert.equal(validateRequestInput({ ...validInput, place: " " }).place, null);
  for (const body of [
    { ...validInput, message: " " },
    { ...validInput, message: "ก".repeat(501) },
    { ...validInput, category: "admin" },
    { ...validInput, channel: "email" },
    { ...validInput, place: "x".repeat(101) },
    { ...validInput, status: "DONE" },
    { ...validInput, clientRequestId: "not-a-uuid" },
  ]) expectError(() => validateRequestInput(body), 400);
  expectError(() => validateRequestInput(null), 400);
});

test("request IDs make retries idempotent only when the request content matches", () => {
  const first = validateRequestInput(validInput);
  assert.equal(sameRequestInput(first, validateRequestInput({ ...validInput, message: "ช่วยหยิบแก้วน้ำ" })), true);
  assert.equal(sameRequestInput(first, validateRequestInput({ ...validInput, message: "ช่วยหยิบขวดน้ำ" })), false);
});

test("room creation and action payloads accept only their declared shapes", () => {
  assert.doesNotThrow(() => validateEmptyRoomBody({}));
  expectError(() => validateEmptyRoomBody({ receiverToken: "client-supplied" }), 400);
  assert.equal(validateAction({ action: "accept" }), "accept");
  expectError(() => validateAction({ action: "accept", status: "DONE" }), 400);
  expectError(() => validateAction({ action: "invented" }), 400);
});

test("access tokens are random, hash matched, and bearer credentials are required", () => {
  const first = createAccessToken();
  const second = createAccessToken();
  assert.equal(first.token.length, 64);
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash.length, 64);
  assert.equal(matchAccessToken(first.token, first.hash), true);
  assert.equal(matchAccessToken(second.token, first.hash), false);
  assert.equal(matchAccessToken(first.token, "bad-hash"), false);
  expectError(() => bearerToken(new Request("https://careloop.test/api")), 401);
  expectError(() => bearerToken(new Request("https://careloop.test/api", { headers: { authorization: "Bearer invalid" } })), 403);
});

test("room credentials authorize only their sender or receiver role", () => {
  const sender = createAccessToken();
  const receiver = createAccessToken();
  assert.equal(authorizeRoomRole(sender.token, sender.hash, receiver.hash), "sender");
  assert.equal(authorizeRoomRole(receiver.token, sender.hash, receiver.hash), "receiver");
  expectError(() => authorizeRoomRole("0".repeat(64), sender.hash, receiver.hash), 403);
  expectError(() => requireSenderRoomRole("receiver"), 403);
  assert.doesNotThrow(() => requireSenderRoomRole("sender"));
});

test("expired room cleanup deletes room rows using an inclusive expiry cutoff", async () => {
  const now = new Date("2026-10-22T00:00:00.000Z");
  let deletedCount = 0;
  const result = await deleteExpiredCareRequestRooms({
    async deleteMany({ where }) {
      assert.equal(where.expiresAt.lte, now);
      deletedCount = 2;
      return { count: deletedCount };
    },
  }, now);
  assert.equal(result.count, 2);
  assert.equal(deletedCount, 2);
});

test("sender room deletion removes the room and rejects receiver credentials", async () => {
  const sender = createAccessToken();
  const receiver = createAccessToken();
  const expiresAt = new Date(Date.now() + 60_000);
  const rows = new Set(["room-1"]);
  const delegate = {
    async deleteMany({ where }: { where: { id: string } }) {
      const count = Number(rows.delete(where.id));
      return { count };
    },
  };
  await assert.rejects(
    deleteCareRequestRoomAsSender({ roomId: "room-1", token: receiver.token, senderHash: sender.hash, receiverHash: receiver.hash, expiresAt }, delegate),
    (error) => error instanceof CareRequestError && error.status === 403,
  );
  assert.equal(rows.has("room-1"), true);
  await deleteCareRequestRoomAsSender({ roomId: "room-1", token: sender.token, senderHash: sender.hash, receiverHash: receiver.hash, expiresAt }, delegate);
  assert.equal(rows.has("room-1"), false);
  await assert.rejects(
    deleteCareRequestRoomAsSender({ roomId: "room-1", token: sender.token, senderHash: sender.hash, receiverHash: receiver.hash, expiresAt: new Date(Date.now() - 1) }, delegate),
    (error) => error instanceof CareRequestError && error.status === 410,
  );
});

test("room and request creation enforce global demo quotas", () => {
  assert.doesNotThrow(() => assertRoomQuota(99));
  expectError(() => assertRoomQuota(100), 429);
  assert.doesNotThrow(() => assertRequestQuota(19, 999));
  expectError(() => assertRequestQuota(20, 0), 429);
  expectError(() => assertRequestQuota(0, 1_000), 429);
});

test("request bodies are bounded while streaming even without a content-length header", async () => {
  const request = new Request("https://careloop.test/api", { method: "POST", body: "x".repeat(4_097) });
  await assert.rejects(readJsonBody(request), (error) => error instanceof CareRequestError && error.status === 413);
});

test("only the allowed actor can perform each status transition", () => {
  assert.deepEqual(transitionFor("receiver", "PENDING", "accept"), {
    expectedStatus: "PENDING", nextStatus: "ACCEPTED", actor: "receiver", eventAction: "accept",
  });
  assert.equal(transitionFor("receiver", "ACCEPTED", "complete").nextStatus, "DONE");
  assert.equal(transitionFor("sender", "ACCEPTED", "cancel").nextStatus, "CANCELLED");
  assert.equal(transitionFor("receiver", "PENDING", "decline").nextStatus, "DECLINED");
  expectError(() => transitionFor("sender", "PENDING", "accept"), 403);
  expectError(() => transitionFor("sender", "ACCEPTED", "complete"), 403);
  expectError(() => transitionFor("receiver", "PENDING", "complete"), 409);
  expectError(() => transitionFor("receiver", "DONE", "decline"), 409);
  expectError(() => transitionFor("sender", "DECLINED", "cancel"), 409);
});
