import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPlan, createTrial, transitionTrial, type PlanInput, type TrialMode, type TrialState } from "../lib/interaction-plan";
import { appendStudy, MAX_STUDIES, parseStudies, TRIAL_HISTORY_KEY, type SavedStudy } from "../lib/trial-history";

const input: PlanInput = {
  category: "custom",
  goalText: "จัดโต๊ะทดลอง",
  contextText: "ในห้องเรียน",
  constraints: ["other"],
  otherConstraint: "ใช้ตัวอักษรใหญ่",
  otherAdaptation: "short-prompts",
  customSteps: ["วางเครื่องมือ", "ตรวจความเรียบร้อย"],
};

function terminalTrial(mode: TrialMode): TrialState {
  const result = buildPlan(input);
  assert.ok(result.plan, result.errors.join(", "));
  let state = transitionTrial(createTrial(result.plan, mode), { type: "start", at: 100 });
  let at = 101;
  while (state.phase === "running") {
    const choices = state.plan.steps[state.stepIndex].choices;
    const choice = state.stepIndex === state.plan.steps.length - 1
      ? choices.find(({ id }) => id === "confirm")!
      : choices[0];
    state = transitionTrial(state, { type: "answer", choiceId: choice.id, at: at++ });
  }
  assert.equal(state.phase, "completed");
  return state;
}

function study(id = "study-1"): SavedStudy {
  return { id, createdAt: 200, input, trials: [terminalTrial("voice"), terminalTrial("text")], feedback: "ตัวอักษรใหญ่ช่วยได้" };
}

test("history key and a valid custom study survive serialization with private extras removed", () => {
  assert.equal(TRIAL_HISTORY_KEY, "careloop.adaptive-trials.v1");
  const source = study();
  const withExtra = { ...source, privateNote: "อย่าบันทึก", input: { ...input, privateNote: "อย่าบันทึก" } };
  const saved = appendStudy([], withExtra as SavedStudy);
  const parsed = parseStudies(JSON.stringify(saved));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].input, input);
  assert.equal("privateNote" in parsed[0], false);
  assert.equal("privateNote" in parsed[0].input, false);
  assert.deepEqual(parsed[0].trials, source.trials);
});

test("a study with one completed channel round-trips while a second run is still pending", () => {
  const singleRun = { ...study(), trials: [terminalTrial("voice")] };
  const saved = appendStudy([], singleRun);
  assert.deepEqual(parseStudies(JSON.stringify(saved)), [singleRun]);
});

test("parser rejects forged terminal summaries, altered event outcomes, and changed rebuilt plans", () => {
  const valid = study();
  const forged = structuredClone(valid);
  forged.trials[0].phase = "completed";
  forged.trials[0].endedAt = null;
  const alteredEvent = structuredClone(valid);
  alteredEvent.trials[0].events[1].outcome = "completed";
  const changedInput = structuredClone(valid);
  changedInput.input.goalText = "เป้าหมายอื่น";
  const negativeTime = structuredClone(valid);
  negativeTime.createdAt = -1;
  for (const value of [forged, alteredEvent, changedInput, negativeTime]) assert.deepEqual(parseStudies(JSON.stringify([value])), []);
});

test("malformed, oversized, duplicate-id, and over-limit inputs are safely bounded", () => {
  assert.deepEqual(parseStudies(null), []);
  assert.deepEqual(parseStudies("{"), []);
  assert.deepEqual(parseStudies(" ".repeat(1024 * 1024 + 1)), []);
  assert.deepEqual(parseStudies(JSON.stringify([study(), { ...study(), feedback: "duplicate" }])), []);
  const many = Array.from({ length: MAX_STUDIES + 3 }, (_, index) => study(`id-${index}`));
  assert.deepEqual(parseStudies(JSON.stringify(many)).map(({ id }) => id), many.slice(0, MAX_STUDIES).map(({ id }) => id));
});

test("append puts newest first, de-duplicates by id, drops oldest to fit, and rejects one oversized study", () => {
  const original = study("same");
  const replacement = { ...study("same"), feedback: "updated" };
  assert.equal(appendStudy([original], replacement)[0].feedback, "updated");
  const capped = appendStudy(Array.from({ length: MAX_STUDIES }, (_, index) => study(`id-${index}`)), study("new"));
  assert.equal(capped.length, MAX_STUDIES);
  assert.equal(capped[0].id, "new");
  assert.equal(capped.at(-1)?.id, `id-${MAX_STUDIES - 2}`);
  assert.throws(() => appendStudy([], { ...study(), feedback: "x".repeat(1024 * 1024) }), RangeError);
  assert.equal(appendStudy(Array.from({ length: MAX_STUDIES }, (_, index) => study(`old-${index}`)), study("new" )).length, MAX_STUDIES);
});
