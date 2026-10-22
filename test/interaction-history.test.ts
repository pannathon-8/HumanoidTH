import assert from "node:assert/strict";
import test from "node:test";
import { createSession, transitionSession, type LabSession } from "../lib/interaction-lab.js";
import { addSavedRun, parseSavedRuns, type SavedLabRun } from "../lib/interaction-history.js";

function runThrough(actions: Array<["start" | "accept" | "decline" | "repeat" | "unclear" | "back" | "confirm" | "stop", number]>): LabSession {
  let session = createSession("learning", 100);
  for (const [action, at] of actions) session = transitionSession(session, action, at);
  return session;
}

function savedRun(id: string, session: LabSession = runThrough([["start", 100], ["accept", 110], ["confirm", 120]])): SavedLabRun {
  return { id, robotId: "robot-1", robotName: "Milo", context: "school", session };
}

test("parses reconstructed completed and stopped sessions with robot and context", () => {
  const completed = savedRun("complete");
  const stopped = savedRun("stop", runThrough([["start", 200], ["stop", 210]]));
  assert.deepEqual(parseSavedRuns(JSON.stringify([completed, stopped])), [completed, stopped]);
});

test("rejects forged terminal states that bypass the replayed interaction", () => {
  const forged = savedRun("forged");
  forged.session = { ...forged.session, phase: "completed", events: [{ action: "confirm", at: 120, from: "confirm", to: "completed" }] };
  assert.deepEqual(parseSavedRuns(JSON.stringify([forged])), []);
});

test("rejects invalid replay, out of order events, and unknown scenarios", () => {
  const valid = savedRun("valid");
  const invalidAction = structuredClone(valid);
  invalidAction.id = "invalid-action";
  invalidAction.session.events[1].action = "confirm";
  const outOfOrder = structuredClone(valid);
  outOfOrder.id = "out-of-order";
  outOfOrder.session.events[1].at = 90;
  const unknown = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
  unknown.id = "unknown";
  (unknown.session as Record<string, unknown>).scenarioId = "unknown";
  assert.deepEqual(parseSavedRuns(JSON.stringify([invalidAction, outOfOrder, unknown])), []);
});

test("rejects malformed JSON and payloads larger than one megabyte", () => {
  assert.deepEqual(parseSavedRuns("{"), []);
  assert.deepEqual(parseSavedRuns(" ".repeat(1024 * 1024 + 1)), []);
});

test("drops unknown properties and rejects excessive or malformed event history", () => {
  const valid = savedRun("extra");
  const withExtras = { ...valid, secret: "discard", session: { ...valid.session, secret: "discard" } };
  const parsed = parseSavedRuns(JSON.stringify([withExtras]));
  assert.deepEqual(parsed, [valid]);
  assert.equal("secret" in parsed[0], false);

  const tooMany = savedRun("too-many");
  tooMany.session.events = Array.from({ length: 2001 }, (_, i) => ({ action: "repeat", at: i, from: "offer", to: "offer" }));
  assert.deepEqual(parseSavedRuns(JSON.stringify([tooMany])), []);
});

test("rejects duplicate ids and keeps additions newest first, deduplicated, and bounded", () => {
  const first = savedRun("same");
  const duplicate = savedRun("same", runThrough([["start", 300], ["decline", 310]]));
  assert.deepEqual(parseSavedRuns(JSON.stringify([first, duplicate])), []);
  const runs = Array.from({ length: 22 }, (_, i) => savedRun(`run-${i}`));
  const updated = addSavedRun(runs, savedRun("run-0", runThrough([["start", 500], ["stop", 510]])));
  assert.equal(updated.length, 20);
  assert.equal(updated[0].session.phase, "cancelled");
  assert.equal(updated.filter((run) => run.id === "run-0").length, 1);
  assert.equal(updated.at(-1)?.id, "run-19");
});

test("keeps serialized history within one megabyte while retaining the newest valid run", () => {
  let longSession = createSession("learning", 0);
  longSession = transitionSession(longSession, "start", 0);
  for (let i = 1; i <= 1500; i += 1) longSession = transitionSession(longSession, "repeat", i);
  longSession = transitionSession(longSession, "stop", 1501);
  const longRun = savedRun("newest-long", longSession);
  let history: SavedLabRun[] = [];
  for (let i = 0; i < 20; i += 1) history = addSavedRun(history, savedRun(`old-${i}`, longSession));
  history = addSavedRun(history, longRun);

  const serialized = JSON.stringify(history);
  assert.ok(new TextEncoder().encode(serialized).byteLength <= 1024 * 1024);
  assert.equal(history[0].id, "newest-long");
  assert.deepEqual(parseSavedRuns(serialized), history);
});

test("rejects a single run that cannot fit in the persistent byte limit", () => {
  const oversized = savedRun("oversized");
  oversized.robotName = "x".repeat(1024 * 1024);
  assert.throws(() => addSavedRun([], oversized), RangeError);
});
