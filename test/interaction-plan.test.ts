import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPlan,
  createTrial,
  getTrialPrompt,
  summarizeTrial,
  transitionTrial,
  type PlanInput,
  type TrialAction,
} from "../lib/interaction-plan";

const baseInput: PlanInput = {
  category: "learning",
  goalText: "ฝึกใช้คำสั่งหุ่นยนต์",
  contextText: "ในห้องเรียน",
  constraints: [],
  otherConstraint: "",
  otherAdaptation: "text-buttons",
  customSteps: [],
};
const makePlan = (input = baseInput) => {
  const result = buildPlan(input);
  assert.ok(result.plan, result.errors.join(", "));
  return result.plan;
};
const started = (plan = makePlan(), mode: "voice" | "text" = "voice") =>
  transitionTrial(createTrial(plan, mode), { type: "start", at: 1 });
const answer = (state: ReturnType<typeof started>, choiceId: string, at: number) =>
  transitionTrial(state, { type: "answer", choiceId, at });

test("every goal category has distinct concrete steps and uses the user's goal and context", () => {
  const categories = ["learning", "communication", "assistance", "routine", "custom"] as const;
  const plans = categories.map((category) => buildPlan({
    ...baseInput,
    category,
    goalText: category === "custom" ? "จัดโต๊ะอุปกรณ์ทดลอง" : `เป้าหมาย ${category}`,
    contextText: "ใช้ที่บ้าน",
    customSteps: category === "custom" ? ["ตรวจสายไฟ", "จัดเซนเซอร์"] : [],
  }));
  assert.ok(plans.every(({ plan }) => plan));
  assert.equal(new Set(plans.map(({ plan }) => plan!.steps[0].question)).size, categories.length);
  assert.match(plans[0].plan!.title + plans[0].plan!.steps.map((step) => step.question).join(" "), /เป้าหมาย learning|ฝึกใช้คำสั่งหุ่นยนต์/);
  assert.match(plans[0].plan!.title + plans[0].plan!.steps.map((step) => step.question).join(" "), /ใช้ที่บ้าน/);
  assert.match(plans[4].plan!.steps.map((step) => step.question).join(" "), /ตรวจสายไฟ|จัดเซนเซอร์/);
});

test("plan validation rejects invalid enums, malformed arrays, and missing other details", () => {
  assert.ok(buildPlan({ ...baseInput, category: "unknown" as PlanInput["category"] }).errors.length > 0);
  assert.ok(buildPlan({ ...baseInput, constraints: ["not-real"] as unknown as PlanInput["constraints"] }).errors.length > 0);
  assert.ok(buildPlan({ ...baseInput, category: "custom", customSteps: ["ขั้นเดียว"] }).errors.length > 0);
  assert.ok(buildPlan({ ...baseInput, constraints: ["other"], otherConstraint: "", otherAdaptation: "nope" as PlanInput["otherAdaptation"] }).errors.length > 0);
  assert.ok(buildPlan({ ...baseInput, goalText: " " }).errors.length > 0);
});

test("custom steps become user-written questions with done and need-help choices", () => {
  const plan = makePlan({ ...baseInput, category: "custom", goalText: "จัดโต๊ะทำงาน", customSteps: ["วางเครื่องมือให้ครบ", "ตรวจพื้นที่ให้เรียบร้อย"] });
  assert.match(plan.steps[0].question, /วางเครื่องมือให้ครบ/);
  assert.deepEqual(plan.steps[0].choices.map(({ id }) => id), ["done", "need-help"]);
  assert.equal(plan.steps.at(-1)?.id, "confirm");
  assert.deepEqual(plan.steps.at(-1)?.choices.map(({ id }) => id), ["confirm", "cancel"]);
});

test("constraint adaptations affect response modes, while counters wait for an actual trial", () => {
  const result = buildPlan({ ...baseInput, constraints: ["no-speech", "short-text"] });
  assert.ok(result.plan);
  assert.ok(result.plan.adaptations.length >= 2);
  const trial = started(result.plan);
  assert.equal(trial.blockedCount, 0);
  const blocked = answer(trial, trial.plan.steps[0].choices[0].id, 2);
  assert.equal(blocked.blockedCount, 1);
  assert.equal(blocked.stepIndex, 0);
});

test("other constraint requires text and a selected adaptation that appears in the plan", () => {
  const result = buildPlan({ ...baseInput, constraints: ["other"], otherConstraint: "ต้องใช้ตัวอักษรขนาดใหญ่", otherAdaptation: "step-by-step" });
  assert.ok(result.plan);
  assert.ok(result.plan.adaptations.some((text) => /จุดทบทวน.*ขอความช่วยเหลือ/.test(text)));
  assert.ok(result.plan.title.includes("ฝึกใช้คำสั่งหุ่นยนต์"));
});

test("step-by-step adds review checkpoints between user steps that can pause for help", () => {
  const plan = makePlan({
    ...baseInput,
    category: "custom",
    goalText: "จัดโต๊ะทำงาน",
    constraints: ["other"],
    otherConstraint: "อยากตรวจทีละช่วง",
    otherAdaptation: "step-by-step",
    customSteps: ["วางอุปกรณ์", "ตรวจความเรียบร้อย", "เก็บของเข้าที่"],
  });
  const checkpoint = plan.steps.find(({ id }) => id === "checkpoint-1");
  assert.ok(checkpoint);
  assert.deepEqual(checkpoint.choices.map(({ id }) => id), ["continue", "need-help"]);
  assert.match(plan.adaptations.join(" "), /จุดทบทวน.*ขอความช่วยเหลือ/);
  assert.deepEqual(plan.steps.filter(({ id }) => id.startsWith("checkpoint-")).map(({ id }) => id), ["checkpoint-1", "checkpoint-2"]);

  let trial = started(plan);
  trial = answer(trial, "done", 2);
  assert.equal(trial.stepIndex, 1);
  trial = answer(trial, "need-help", 3);
  assert.equal(trial.stepIndex, 1);
  assert.equal(trial.blockedCount, 1);
  trial = answer(trial, "continue", 4);
  assert.equal(trial.stepIndex, 2);
});

test("learning command order names the example being practiced", () => {
  const plan = makePlan();
  const orderStep = plan.steps.find(({ id }) => id === "order");
  assert.ok(orderStep);
  assert.match(orderStep.question, /โจทย์ตัวอย่างของ.*เดินหน้าแล้วเลี้ยว/);
  assert.equal(orderStep.correctChoiceId, "forward-turn");
});

test("all goal, constraint, and initial-channel combinations complete through explicit confirmation", () => {
  const categories = ["learning", "communication", "assistance", "routine", "custom"] as const;
  const constraintSets: PlanInput["constraints"][] = [
    [], ["no-speech"], ["no-hearing"], ["short-text"], ["large-controls"],
    ["other"], ["other"], ["other"], ["no-speech", "no-hearing", "short-text", "large-controls"],
  ];
  const otherAdaptations = ["text-buttons", "short-prompts", "step-by-step"] as const;
  let combinations = 0;
  for (const category of categories) {
    for (const constraints of constraintSets) {
      for (const initialMode of ["voice", "text"] as const) {
        const otherIndex = constraints.includes("other") ? constraintSets.filter((items) => items.includes("other")).indexOf(constraints) : -1;
        const { plan, errors } = buildPlan({
          ...baseInput,
          category,
          goalText: `เป้าหมาย ${category}`,
          constraints,
          otherConstraint: constraints.includes("other") ? "ต้องการการปรับ" : "",
          otherAdaptation: otherIndex >= 0 ? otherAdaptations[otherIndex] : "text-buttons",
          customSteps: category === "custom" ? ["ทำขั้นหนึ่ง", "ทำขั้นสอง"] : [],
        });
        assert.ok(plan, errors.join(", "));
        let trial = started(plan, initialMode);
        const voiceBlocked = initialMode === "voice" && (
          constraints.includes("no-speech") || constraints.includes("no-hearing") ||
          (constraints.includes("other") && otherAdaptations[otherIndex] === "text-buttons")
        );
        if (voiceBlocked) {
          const firstChoice = plan.steps[0].choices.find(({ id }) => id !== "need-help" && id !== "cancel")!;
          trial = answer(trial, firstChoice.id, 2);
          assert.equal(trial.blockedCount, 1, `${category}/${constraints.join("+")}/${initialMode} must record voice block`);
          trial = transitionTrial(trial, { type: "switch-channel", mode: "text", at: 3 });
        }
        for (let stepNumber = 0; trial.phase === "running" && stepNumber < plan.steps.length + 2; stepNumber++) {
          const step = plan.steps[trial.stepIndex];
          assert.ok(step, `${category}/${constraints.join("+")}/${trial.mode} must have a current step`);
          const choice = step.id === "confirm"
            ? "confirm"
            : step.choices.find(({ id }) => id === (step.correctChoiceId ?? undefined))?.id ??
              step.choices.find(({ id }) => id !== "need-help" && id !== "cancel")!.id;
          trial = answer(trial, choice, 4 + stepNumber);
        }
        assert.equal(trial.phase, "completed", `${category}/${constraints.join("+")}/${initialMode} must reach completion`);
        combinations++;
      }
    }
  }
  assert.equal(combinations, 90);
});

test("text mode uses short prompts and repeat also shortens the current prompt", () => {
  const trial = started(makePlan({ ...baseInput, constraints: ["short-text"] }), "text");
  assert.equal(getTrialPrompt(trial), trial.plan.steps[0].shortQuestion);
  const voice = started();
  const repeated = transitionTrial(voice, { type: "repeat", at: 2 });
  assert.equal(getTrialPrompt(repeated), voice.plan.steps[0].shortQuestion);
  assert.equal(repeated.repeatCount, 1);
});

test("custom short prompts keep the user's exact step instruction", () => {
  const instruction = "ตรวจสายไฟก่อนเริ่มทดลอง";
  const plan = makePlan({
    ...baseInput,
    category: "custom",
    goalText: "เตรียมอุปกรณ์ทดลอง",
    constraints: ["other"],
    otherConstraint: "ต้องการข้อความกระชับ",
    otherAdaptation: "short-prompts",
    customSteps: [instruction, "จัดเซนเซอร์ให้พร้อม"],
  });
  const trial = started(plan, "text");
  assert.equal(getTrialPrompt(trial), instruction);
});

test("wrong answers and need-help do not advance, and a valid answer can proceed", () => {
  const plan = makePlan({ ...baseInput, category: "custom", goalText: "เตรียมโต๊ะ", customSteps: ["วางเครื่องมือ", "เช็กความเรียบร้อย"] });
  let trial = started(plan);
  trial = answer(trial, "need-help", 2);
  assert.equal(trial.stepIndex, 0);
  assert.equal(trial.blockedCount, 1);
  trial = answer(trial, "done", 3);
  assert.equal(trial.stepIndex, 1);
  let learning = started();
  learning = answer(learning, learning.plan.steps[0].choices[0].id, 2);
  const wrong = learning.plan.steps[1].choices.find((choice) => choice.id !== learning.plan.steps[1].correctChoiceId)!.id;
  assert.equal(answer(learning, wrong, 3).stepIndex, 1);
});

test("switching from voice to text permits a no-speech trial to complete with final confirmation", () => {
  const plan = makePlan({ ...baseInput, constraints: ["no-speech"] });
  let trial = started(plan, "voice");
  trial = transitionTrial(trial, { type: "switch-channel", mode: "text", at: 2 });
  trial = answer(trial, trial.plan.steps[0].choices[0].id, 3);
  assert.equal(trial.stepIndex, 1);
  const confirmIndex = trial.plan.steps.findIndex(({ id }) => id === "confirm");
  while (trial.stepIndex < confirmIndex) trial = answer(trial, trial.plan.steps[trial.stepIndex].choices[0].id, 4 + trial.stepIndex);
  assert.equal(trial.phase, "running");
  trial = answer(trial, "confirm", 20);
  assert.equal(trial.phase, "completed");
  assert.equal(trial.switchCount, 1);
});

test("final confirmation cannot be bypassed, and cancel ends the trial", () => {
  const plan = makePlan();
  const confirmation = plan.steps.at(-1)!;
  assert.match(confirmation.question, /ยืนยันจบการทดลอง/);
  assert.match(confirmation.choices[0].label, /ยืนยันจบการทดลอง/);
  let trial = started(plan);
  trial = transitionTrial(trial, { type: "stop", at: 2 });
  assert.equal(trial.phase, "cancelled");
  assert.equal(trial.endedAt, 2);
  assert.equal(transitionTrial(trial, { type: "start", at: 3 }), trial);
});

test("back removes later answers and resumes the previous step", () => {
  const plan = makePlan();
  let trial = started(plan);
  const first = trial.plan.steps[0];
  trial = answer(trial, first.choices[0].id, 2);
  assert.equal(trial.stepIndex, 1);
  trial = transitionTrial(trial, { type: "back", at: 3 });
  assert.equal(trial.stepIndex, 0);
  assert.equal(trial.answers[first.id], undefined);
});

test("timestamps are monotonic, summaries use real event metrics, and event limit reserves stop", () => {
  let trial = started();
  trial = transitionTrial(trial, { type: "repeat", at: 0 });
  assert.deepEqual(trial.events.map(({ at }) => at), [1, 1]);
  assert.equal(summarizeTrial(trial).repeatCount, 1);
  for (let i = 0; i < 2_000; i++) trial = transitionTrial(trial, { type: "repeat", at: i + 2 });
  assert.equal(trial.events.length, 1_999);
  const stopped = transitionTrial(trial, { type: "stop", at: 3_000 });
  assert.equal(stopped.events.length, 2_000);
  assert.equal(stopped.phase, "cancelled");
});

test("invalid runtime actions and choices cannot change the state", () => {
  const trial = started();
  assert.equal(transitionTrial(trial, { type: "answer", choiceId: "made-up", at: 2 }), trial);
  assert.equal(transitionTrial(trial, { type: "switch-channel", mode: "fax" as "text", at: 2 }), trial);
  assert.equal(transitionTrial(trial, { type: "answer", choiceId: "confirm", at: 2 }), trial);
  assert.equal(transitionTrial(trial, { type: "repeat", at: Number.NaN }), trial);
  for (const action of ["start", "answer", "repeat", "switch-channel", "back", "stop"] as TrialAction["type"][]) {
    const completed = { ...trial, phase: "completed" as const };
    const next = transitionTrial(completed, action === "answer" ? { type: "answer", choiceId: "cancel", at: 2 } : action === "switch-channel" ? { type: "switch-channel", mode: "text", at: 2 } : { type: action, at: 2 } as TrialAction);
    assert.equal(next, completed);
  }
});



