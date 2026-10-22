import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SCENARIOS,
  createSession,
  getSessionMessage,
  summarizeSession,
  transitionSession,
  type LabAction,
  type ScenarioId,
} from "../lib/interaction-lab";

const scenarioIds: ScenarioId[] = ["learning", "communication", "daily-help"];

test("all scenarios support offer, confirmation, and simulated completion", () => {
  assert.deepEqual(SCENARIOS.map(({ id }) => id), scenarioIds);
  for (const scenarioId of scenarioIds) {
    const idle = createSession(scenarioId, 100);
    assert.equal(idle.phase, "idle");
    assert.equal(idle.events.length, 0);
    const offer = transitionSession(idle, "start", 110);
    assert.equal(offer.phase, "offer");
    assert.equal(offer.startedAt, 110);
    assert.equal(transitionSession(offer, "confirm", 120), offer, "offer must not bypass confirmation");
    const confirm = transitionSession(offer, "accept", 120);
    assert.equal(confirm.phase, "confirm");
    assert.equal(transitionSession(confirm, "confirm", 130).phase, "completed");
    assert.match(SCENARIOS.find((item) => item.id === scenarioId)!.completion, /จำลอง/);
  }
});

test("decline and stop produce terminal outcomes with end times", () => {
  const offer = transitionSession(createSession("learning", 0), "start", 5);
  const declined = transitionSession(offer, "decline", 10);
  assert.equal(declined.phase, "declined");
  assert.equal(declined.endedAt, 10);
  const confirming = transitionSession(offer, "accept", 8);
  const cancelled = transitionSession(confirming, "stop", 12);
  assert.equal(cancelled.phase, "cancelled");
  assert.equal(cancelled.endedAt, 12);
  assert.equal(transitionSession(offer, "stop", 11).phase, "cancelled");
});

test("repeat and unclear preserve phase, count repeats, and provide useful prompts", () => {
  let offer = transitionSession(createSession("communication", 0), "start", 1);
  const repeatOffer = transitionSession(offer, "repeat", 2);
  assert.equal(repeatOffer.phase, "offer");
  assert.equal(repeatOffer.repeatCount, 1);
  assert.match(getSessionMessage(repeatOffer), /อยาก/);
  const unclearOffer = transitionSession(repeatOffer, "unclear", 3);
  assert.equal(unclearOffer.repeatCount, 1);
  assert.equal(getSessionMessage(unclearOffer), "เลือกได้เลย: ต้องการ / ไม่ต้องการ / หยุด");
  const confirm = transitionSession(unclearOffer, "accept", 4);
  const repeatedConfirm = transitionSession(confirm, "repeat", 5);
  assert.equal(repeatedConfirm.phase, "confirm");
  const unclearConfirm = transitionSession(repeatedConfirm, "unclear", 6);
  assert.equal(unclearConfirm.phase, "confirm");
  assert.equal(getSessionMessage(unclearConfirm), "เลือกได้เลย: ยืนยัน / ย้อนกลับ / หยุด");
  assert.equal(transitionSession(unclearConfirm, "confirm", 7).phase, "completed");
  offer = transitionSession(createSession("daily-help", 0), "start", 1);
  assert.equal(transitionSession(offer, "unclear", 2).phase, "offer");
});

test("scenario copy gives concrete, clearly simulated goals", () => {
  const learning = SCENARIOS.find((scenario) => scenario.id === "learning")!;
  const communication = SCENARIOS.find((scenario) => scenario.id === "communication")!;
  const dailyHelp = SCENARIOS.find((scenario) => scenario.id === "daily-help")!;
  assert.match(learning.description, /เขียนโปรแกรม.*หุ่นยนต์/);
  assert.match(learning.completion, /จำลอง/);
  assert.match(communication.description, /ขอให้.*ติดต่อ.*บุคคลที่ไว้วางใจ/);
  assert.match(communication.completion, /ไม่มีการติดต่อบุคคลจริง/);
  assert.match(dailyHelp.description, /ขอความช่วยเหลือ.*งานประจำวัน/);
  assert.match(dailyHelp.completion, /จำลอง/);
});

test("back returns to offer and permits a fresh confirmation", () => {
  const offer = transitionSession(createSession("daily-help", 0), "start", 1);
  const confirm = transitionSession(offer, "accept", 2);
  const back = transitionSession(confirm, "back", 3);
  assert.equal(back.phase, "offer");
  assert.equal(transitionSession(back, "accept", 4).phase, "confirm");
});

test("sessions and events are immutable, replay is independent, and terminal actions are ignored", () => {
  const idle = createSession("learning", 0);
  const offer = transitionSession(idle, "start", 1);
  assert.equal(idle.phase, "idle");
  assert.equal(idle.startedAt, null);
  assert.equal(idle.events.length, 0);
  assert.notEqual(offer, idle);
  const completed = transitionSession(transitionSession(offer, "accept", 2), "confirm", 3);
  for (const action of ["start", "accept", "repeat", "stop"] as LabAction[]) {
    assert.equal(transitionSession(completed, action, 4), completed);
  }
  assert.equal(transitionSession(idle, "accept", 1), idle);
  const replay = createSession("learning", 10);
  assert.equal(replay.phase, "idle");
  assert.equal(replay.events.length, 0);
});

test("event timestamps never move backward and summaries use active or final time", () => {
  const offer = transitionSession(createSession("learning", 10), "start", 20);
  const repeated = transitionSession(offer, "repeat", 15);
  assert.deepEqual(repeated.events.map((event) => event.at), [20, 20]);
  const activeSummary = summarizeSession(repeated);
  assert.deepEqual(activeSummary, { durationMs: 0, repeatCount: 1, eventCount: 2, outcome: "offer" });
  const ended = transitionSession(repeated, "decline", 30);
  assert.deepEqual(summarizeSession(ended), { durationMs: 10, repeatCount: 1, eventCount: 3, outcome: "declined" });
});

test("invalid scenario ids and nonfinite timestamps are rejected", () => {
  assert.throws(() => createSession("other" as ScenarioId, 0), TypeError);
  assert.throws(() => createSession("learning", Number.NaN), TypeError);
  assert.throws(() => createSession("learning", Number.POSITIVE_INFINITY), TypeError);
  assert.throws(() => transitionSession(createSession("learning", 0), "start", Number.NaN), TypeError);
});
