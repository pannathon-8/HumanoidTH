export type GoalCategory = "learning" | "communication" | "assistance" | "routine" | "custom";
export type ConstraintId = "no-speech" | "no-hearing" | "short-text" | "large-controls" | "other";
export type OtherAdaptation = "text-buttons" | "short-prompts" | "step-by-step";
export type TrialMode = "voice" | "text";

export interface PlanInput {
  category: GoalCategory;
  goalText: string;
  contextText: string;
  constraints: ConstraintId[];
  otherConstraint: string;
  otherAdaptation: OtherAdaptation;
  customSteps: string[];
}

export interface PlanStep {
  id: string;
  question: string;
  shortQuestion: string;
  choices: { id: string; label: string }[];
  correctChoiceId?: string;
}

export interface TrialPlan {
  input: PlanInput;
  title: string;
  steps: PlanStep[];
  adaptations: string[];
}

export interface TrialEvent {
  type: "start" | "answer" | "repeat" | "switch-channel" | "back" | "stop";
  at: number;
  stepIndex: number;
  mode: TrialMode;
  choiceId?: string;
  nextMode?: TrialMode;
  outcome: "started" | "advanced" | "blocked" | "repeated" | "switched" | "back" | "completed" | "cancelled";
}

export interface TrialState {
  plan: TrialPlan;
  initialMode: TrialMode;
  mode: TrialMode;
  phase: "ready" | "running" | "completed" | "cancelled";
  stepIndex: number;
  answers: Record<string, string>;
  events: TrialEvent[];
  startedAt: number | null;
  endedAt: number | null;
  repeatCount: number;
  switchCount: number;
  blockedCount: number;
  lastMessage: string;
}

export type TrialAction =
  | { type: "start" | "repeat" | "back" | "stop"; at: number }
  | { type: "answer"; choiceId: string; at: number }
  | { type: "switch-channel"; mode: TrialMode; at: number };

const goalCategories: readonly GoalCategory[] = ["learning", "communication", "assistance", "routine", "custom"];
const constraintIds: readonly ConstraintId[] = ["no-speech", "no-hearing", "short-text", "large-controls", "other"];
const otherAdaptations: readonly OtherAdaptation[] = ["text-buttons", "short-prompts", "step-by-step"];
const trialModes: readonly TrialMode[] = ["voice", "text"];
const terminalPhases = new Set<TrialState["phase"]>(["completed", "cancelled"]);

const categoryTitles: Record<GoalCategory, string> = {
  learning: "ฝึกเรียนรู้",
  communication: "ฝึกสื่อสาร",
  assistance: "ฝึกขอความช่วยเหลือ",
  routine: "ฝึกกิจวัตร",
  custom: "แผนที่คุณกำหนด",
};

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function validateInput(input: PlanInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["กรุณากรอกข้อมูลแผนให้ครบ"];
  if (!isOneOf(input.category, goalCategories)) errors.push("เลือกประเภทเป้าหมายที่ถูกต้อง");
  if (typeof input.goalText !== "string" || input.goalText.trim().length < 1 || input.goalText.trim().length > 500) errors.push("เป้าหมายต้องมีความยาว 1–500 ตัวอักษร");
  if (typeof input.contextText !== "string" || input.contextText.trim().length > 200) errors.push("บริบทต้องไม่เกิน 200 ตัวอักษร");
  if (!Array.isArray(input.constraints) || input.constraints.some((item) => !isOneOf(item, constraintIds))) {
    errors.push("เลือกข้อจำกัดจากรายการที่กำหนด");
  } else if (new Set(input.constraints).size !== input.constraints.length) {
    errors.push("ข้อจำกัดแต่ละข้อเลือกซ้ำไม่ได้");
  }
  if (typeof input.otherConstraint !== "string" || input.otherConstraint.trim().length > 200) errors.push("ข้อจำกัดอื่นต้องไม่เกิน 200 ตัวอักษร");
  if (!isOneOf(input.otherAdaptation, otherAdaptations)) errors.push("เลือกวิธีปรับแผนที่ถูกต้อง");
  if (!Array.isArray(input.customSteps) || input.customSteps.some((step) => typeof step !== "string" || step.trim().length < 1 || step.trim().length > 160)) {
    errors.push("แต่ละขั้นตอนต้องมีความยาว 1–160 ตัวอักษร");
  } else if (input.customSteps.length > 5) {
    errors.push("กำหนดขั้นตอนได้ไม่เกิน 5 ขั้น");
  }
  if (Array.isArray(input.constraints) && input.constraints.includes("other") && typeof input.otherConstraint === "string" && input.otherConstraint.trim().length < 1) {
    errors.push("โปรดอธิบายข้อจำกัดอื่น 1–200 ตัวอักษร");
  }
  if (input.category === "custom" && Array.isArray(input.customSteps) && (input.customSteps.length < 2 || input.customSteps.length > 5)) {
    errors.push("เป้าหมายที่กำหนดเองต้องมี 2–5 ขั้นตอน");
  }
  if (input.category !== "custom" && Array.isArray(input.customSteps) && input.customSteps.length > 0) {
    errors.push("ขั้นตอนที่เขียนเองใช้กับเป้าหมายที่กำหนดเองเท่านั้น");
  }
  return errors;
}

function promptStep(id: string, question: string, shortQuestion: string, choices: PlanStep["choices"], correctChoiceId?: string): PlanStep {
  return correctChoiceId === undefined ? { id, question, shortQuestion, choices } : { id, question, shortQuestion, choices, correctChoiceId };
}

export function buildPlan(input: PlanInput): { plan: TrialPlan | null; errors: string[] } {
  const errors = validateInput(input);
  if (errors.length > 0) return { plan: null, errors };
  const clean: PlanInput = {
    category: input.category,
    goalText: input.goalText.trim(),
    contextText: input.contextText.trim(),
    constraints: [...input.constraints],
    otherConstraint: input.otherConstraint.trim(),
    otherAdaptation: input.otherAdaptation,
    customSteps: input.customSteps.map((step) => step.trim()),
  };
  const context = clean.contextText ? ` (${clean.contextText})` : "";
  const goal = clean.goalText;
  let steps: PlanStep[];
  switch (clean.category) {
    case "learning":
      steps = [
        promptStep("skill", `สำหรับ${goal}${context} อยากเริ่มฝึกทักษะเขียนโปรแกรมหุ่นยนต์เรื่องใด?`, "อยากฝึกคำสั่งใด?", [
          { id: "move", label: "คำสั่งเดินหน้า" }, { id: "turn", label: "คำสั่งเลี้ยว" },
        ]),
        promptStep("order", `โจทย์ตัวอย่างของ${goal}กำหนดให้หุ่นยนต์เดินหน้าแล้วเลี้ยว ควรเรียงคำสั่งอย่างไร?`, "เรียงคำสั่งอย่างไร?", [
          { id: "forward-turn", label: "เดินหน้า แล้วเลี้ยว" }, { id: "turn-forward", label: "เลี้ยว แล้วเดินหน้า" },
        ], "forward-turn"),
      ];
      break;
    case "communication":
      steps = [
        promptStep("recipient", `สำหรับ${goal}${context} อยากขอให้ติดต่อบุคคลกลุ่มใด?`, "ติดต่อใคร?", [
          { id: "family", label: "ครอบครัว" }, { id: "friend", label: "เพื่อนที่ไว้ใจ" }, { id: "staff", label: "ผู้ดูแลที่ไว้ใจ" },
        ]),
        promptStep("message", `อยากให้ข้อความเกี่ยวกับ${goal} บอกเรื่องใด?`, "ข้อความเรื่องอะไร?", [
          { id: "request", label: "ขอความช่วยเหลือ" }, { id: "update", label: "แจ้งข้อมูล" },
        ]),
      ];
      break;
    case "assistance":
      steps = [
        promptStep("need", `สำหรับ${goal}${context} ตอนนี้ต้องการความช่วยเหลือเรื่องใด?`, "ต้องการช่วยเรื่องใด?", [
          { id: "prepare", label: "เตรียมของหรืออุปกรณ์" }, { id: "task", label: "ทำงานประจำวัน" },
        ]),
        promptStep("helper", `อยากขอให้ใครช่วยเรื่อง${goal}?`, "ขอให้ใครช่วย?", [
          { id: "trusted-person", label: "คนที่ไว้ใจ" }, { id: "caregiver", label: "ผู้ดูแล" },
        ]),
      ];
      break;
    case "routine":
      steps = [
        promptStep("task", `สำหรับ${goal}${context} อยากวางแผนทำกิจวัตรเรื่องใด?`, "ทำกิจวัตรอะไร?", [
          { id: "prepare", label: "เตรียมสิ่งของ" }, { id: "tidy", label: "จัดพื้นที่" },
        ]),
        promptStep("time", `อยากทำ${goal} ในช่วงเวลาใด?`, "ทำช่วงเวลาใด?", [
          { id: "morning", label: "ตอนเช้า" }, { id: "later", label: "ช่วงอื่นที่สะดวก" },
        ]),
      ];
      break;
    case "custom":
      steps = clean.customSteps.map((text, index) => promptStep(
        `custom-${index + 1}`,
        `ขั้นที่ ${index + 1} สำหรับ${goal}${context}: ${text}`,
        text,
        [{ id: "done", label: "ทำขั้นนี้แล้ว" }, { id: "need-help", label: "ต้องการความช่วยเหลือ" }],
      ));
      break;
  }
  if (clean.constraints.includes("other") && clean.otherAdaptation === "step-by-step") {
    const taskSteps = steps;
    steps = taskSteps.flatMap((step, index) => index < taskSteps.length - 1
      ? [step, promptStep(
          `checkpoint-${index + 1}`,
          `จุดทบทวนสำหรับ${goal}${context}: พร้อมไปขั้นถัดไป หรืออยากขอความช่วยเหลือก่อน?`,
          "ทำต่อหรือขอความช่วยเหลือ?",
          [{ id: "continue", label: "ทำต่อ" }, { id: "need-help", label: "ขอความช่วยเหลือ" }],
        )]
      : [step]);
  }
  steps.push(promptStep("confirm", `ยืนยันจบการทดลองจำลอง “${goal}”${context} ไหม?`, "ยืนยันจบการทดลองไหม?", [
    { id: "confirm", label: "ยืนยันจบการทดลอง" }, { id: "cancel", label: "ยกเลิก" },
  ]));
  const adaptations: string[] = [];
  if (clean.constraints.includes("no-speech")) adaptations.push("ใช้การแตะเลือกแทนการพูด");
  if (clean.constraints.includes("no-hearing")) adaptations.push("แสดงข้อความแทนการใช้เสียง");
  if (clean.constraints.includes("short-text")) adaptations.push("ใช้ข้อความและคำถามสั้น");
  if (clean.constraints.includes("large-controls")) adaptations.push("เลือกคำตอบแบบปุ่มใหญ่ได้");
  if (clean.constraints.includes("other")) {
    adaptations.push(`ปรับตามข้อจำกัด: ${clean.otherConstraint}`);
    adaptations.push(({ "text-buttons": "ใช้ปุ่มข้อความ", "short-prompts": "ใช้คำถามสั้น", "step-by-step": "เพิ่มจุดทบทวนระหว่างขั้น ให้เลือกทำต่อหรือขอความช่วยเหลือ" } as const)[clean.otherAdaptation]);
  }
  return { plan: { input: clean, title: `${categoryTitles[clean.category]}: ${goal}`, steps, adaptations }, errors: [] };
}

export function createTrial(plan: TrialPlan, mode: TrialMode): TrialState {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 1 || !isOneOf(mode, trialModes)) throw new TypeError("แผนหรือช่องทางไม่ถูกต้อง");
  return {
    plan, initialMode: mode, mode, phase: "ready", stepIndex: 0, answers: {}, events: [],
    startedAt: null, endedAt: null, repeatCount: 0, switchCount: 0, blockedCount: 0, lastMessage: "พร้อมเริ่มการทดลองจำลอง",
  };
}

function validAction(action: unknown): action is TrialAction {
  if (!action || typeof action !== "object" || Array.isArray(action)) return false;
  const candidate = action as Record<string, unknown>;
  if (!Number.isFinite(candidate.at)) return false;
  if (candidate.type === "start" || candidate.type === "repeat" || candidate.type === "back" || candidate.type === "stop") return true;
  if (candidate.type === "answer") return typeof candidate.choiceId === "string";
  return candidate.type === "switch-channel" && isOneOf(candidate.mode, trialModes);
}

function appendEvent(state: TrialState, action: TrialAction, outcome: TrialEvent["outcome"], stepIndex = state.stepIndex, mode = state.mode): TrialEvent[] {
  const priorAt = state.events.at(-1)?.at;
  const at = priorAt === undefined ? action.at : Math.max(priorAt, action.at);
  const event: TrialEvent = { type: action.type, at, stepIndex, mode, outcome };
  if (action.type === "answer") event.choiceId = action.choiceId;
  if (action.type === "switch-channel") event.nextMode = action.mode;
  return [...state.events, event];
}

export function transitionTrial(state: TrialState, action: TrialAction): TrialState {
  if (!state || !validAction(action) || terminalPhases.has(state.phase)) return state;
  if (state.events.length >= 1_999 && action.type !== "stop") return state;
  if (state.phase === "ready" && action.type !== "start") return state;
  if (state.phase === "running" && action.type === "start") return state;
  if (action.type === "switch-channel" && action.mode === state.mode) return state;
  if (action.type === "back" && (state.phase !== "running" || state.stepIndex <= 0)) return state;
  if (action.type === "answer" && state.phase !== "running") return state;
  if (action.type === "answer" && !state.plan.steps[state.stepIndex]?.choices.some(({ id }) => id === action.choiceId)) return state;
  if (action.type === "switch-channel" && state.phase !== "running") return state;
  if (action.type === "repeat" && state.phase !== "running") return state;

  if (action.type === "start") {
    return { ...state, phase: "running", startedAt: eventTime(state, action.at), lastMessage: "เริ่มการทดลองจำลองแล้ว", events: appendEvent(state, action, "started") };
  }
  if (action.type === "stop") {
    const endedAt = eventTime(state, action.at);
    return { ...state, phase: "cancelled", endedAt, lastMessage: "หยุดการทดลองจำลองแล้ว", events: appendEvent(state, action, "cancelled") };
  }
  if (action.type === "repeat") {
    return { ...state, repeatCount: state.repeatCount + 1, lastMessage: "ทวนคำถามแบบสั้น", events: appendEvent(state, action, "repeated") };
  }
  if (action.type === "switch-channel") {
    return { ...state, mode: action.mode, switchCount: state.switchCount + 1, lastMessage: action.mode === "text" ? "เปลี่ยนเป็นช่องทางข้อความแล้ว" : "เปลี่ยนเป็นช่องทางเสียงจำลองแล้ว", events: appendEvent(state, action, "switched") };
  }
  if (action.type === "back") {
    const stepIndex = state.stepIndex - 1;
    const answers = { ...state.answers };
    for (const step of state.plan.steps.slice(stepIndex)) delete answers[step.id];
    return { ...state, stepIndex, answers, lastMessage: "กลับไปทบทวนขั้นก่อนหน้า", events: appendEvent(state, action, "back") };
  }

  if (action.type !== "answer") return state;
  const step = state.plan.steps[state.stepIndex];
  const choice = step.choices.find(({ id }) => id === action.choiceId)!;
  const voiceUnavailable = state.mode === "voice" && (
    state.plan.input.constraints.includes("no-speech") || state.plan.input.constraints.includes("no-hearing") ||
    (state.plan.input.constraints.includes("other") && state.plan.input.otherAdaptation === "text-buttons")
  );
  if (voiceUnavailable || choice.id === "need-help" || (step.correctChoiceId !== undefined && choice.id !== step.correctChoiceId)) {
    return { ...state, blockedCount: state.blockedCount + 1, lastMessage: voiceUnavailable ? "ช่องทางนี้ไม่เหมาะกับข้อจำกัด ลองเปลี่ยนเป็นข้อความ" : choice.id === "need-help" ? "บันทึกว่าต้องการความช่วยเหลือ ขั้นนี้ยังไม่ผ่าน" : "คำตอบนี้ยังไม่ผ่าน ลองอีกครั้งได้", events: appendEvent(state, action, "blocked") };
  }
  if (step.id === "confirm") {
    if (choice.id === "cancel") return { ...state, phase: "cancelled", endedAt: eventTime(state, action.at), lastMessage: "ยกเลิกการทดลองจำลองแล้ว", events: appendEvent(state, action, "cancelled") };
    return { ...state, phase: "completed", endedAt: eventTime(state, action.at), answers: { ...state.answers, [step.id]: choice.id }, lastMessage: "การทดลองจำลองเสร็จสิ้น", events: appendEvent(state, action, "completed") };
  }
  return { ...state, stepIndex: state.stepIndex + 1, answers: { ...state.answers, [step.id]: choice.id }, lastMessage: "ผ่านขั้นนี้แล้ว", events: appendEvent(state, action, "advanced") };
}

function eventTime(state: TrialState, at: number): number {
  return Math.max(at, state.events.at(-1)?.at ?? at);
}

export function getTrialPrompt(state: TrialState): string {
  if (terminalPhases.has(state.phase)) return state.lastMessage;
  const step = state.plan.steps[state.stepIndex];
  if (!step) return state.lastMessage;
  const lastEvent = state.events.at(-1);
  const shortText = state.mode === "text" && (
    state.plan.input.constraints.includes("short-text") ||
    (state.plan.input.constraints.includes("other") && state.plan.input.otherAdaptation === "short-prompts")
  );
  return lastEvent?.type === "repeat" || shortText ? step.shortQuestion : step.question;
}

export function summarizeTrial(state: TrialState): {
  durationMs: number;
  repeatCount: number;
  switchCount: number;
  blockedCount: number;
  eventCount: number;
  outcome: TrialState["phase"];
} {
  const endpoint = state.endedAt ?? state.events.at(-1)?.at ?? state.startedAt;
  const durationMs = state.startedAt === null || endpoint === null || endpoint === undefined ? 0 : Math.max(0, endpoint - state.startedAt);
  return { durationMs, repeatCount: state.repeatCount, switchCount: state.switchCount, blockedCount: state.blockedCount, eventCount: state.events.length, outcome: state.phase };
}

