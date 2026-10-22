export type ScenarioId = "learning" | "communication" | "daily-help";
export type LabPhase = "idle" | "offer" | "confirm" | "completed" | "declined" | "cancelled";
export type LabAction = "start" | "accept" | "decline" | "repeat" | "unclear" | "back" | "confirm" | "stop";

export interface LabScenario {
  id: ScenarioId;
  title: string;
  description: string;
  offer: string;
  shortOffer: string;
  confirmation: string;
  shortConfirmation: string;
  completion: string;
}

export interface LabEvent {
  action: LabAction;
  at: number;
  from: LabPhase;
  to: LabPhase;
}

export interface LabSession {
  scenarioId: ScenarioId;
  phase: LabPhase;
  startedAt: number | null;
  endedAt: number | null;
  repeatCount: number;
  events: LabEvent[];
}

export const SCENARIOS: readonly LabScenario[] = [
  {
    id: "learning",
    title: "เรียนรู้สิ่งใหม่",
    description: "ลองทำกิจกรรมเขียนโปรแกรมที่มีหุ่นยนต์แนะนำทีละขั้นในสถานการณ์จำลอง",
    offer: "อยากลองทำกิจกรรมเขียนโปรแกรมที่มีหุ่นยนต์แนะนำไหม?",
    shortOffer: "อยากลองเขียนโปรแกรมไหม?",
    confirmation: "ยืนยันไหมว่าจะเริ่มกิจกรรมเรียนรู้จำลองนี้?",
    shortConfirmation: "เริ่มกิจกรรมจำลองไหม?",
    completion: "การจำลองจบแล้ว: เริ่มกิจกรรมเรียนรู้ตัวอย่างเรียบร้อย โดยไม่มีการเริ่มกิจกรรมจริง",
  },
  {
    id: "communication",
    title: "สื่อสารและพูดคุย",
    description: "ลองจำลองการขอให้ติดต่อบุคคลที่ไว้วางใจที่เลือกไว้ โดยจะไม่มีการติดต่อจริง",
    offer: "อยากจำลองการขอให้ติดต่อบุคคลที่ไว้วางใจไหม?",
    shortOffer: "อยากจำลองการขอติดต่อไหม?",
    confirmation: "ยืนยันไหมว่าจะเริ่มบทสนทนาจำลองนี้?",
    shortConfirmation: "เริ่มบทสนทนาจำลองไหม?",
    completion: "การจำลองจบแล้ว: เริ่มบทสนทนาตัวอย่างเรียบร้อย โดยไม่มีการติดต่อบุคคลจริง",
  },
  {
    id: "daily-help",
    title: "ช่วยเหลือในชีวิตประจำวัน",
    description: "ลองจำลองการขอความช่วยเหลือจากคนที่ไว้ใจสำหรับงานประจำวัน",
    offer: "อยากจำลองการขอความช่วยเหลือสำหรับงานประจำวันไหม?",
    shortOffer: "อยากขอความช่วยเหลือไหม?",
    confirmation: "ยืนยันไหมว่าจะเริ่มวางแผนจำลองนี้?",
    shortConfirmation: "เริ่มแผนจำลองไหม?",
    completion: "การจำลองจบแล้ว: เตรียมแผนตัวอย่างเรียบร้อย โดยไม่มีการสั่งงานอุปกรณ์จริง",
  },
];

const scenarioById = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));
const terminalPhases = new Set<LabPhase>(["completed", "declined", "cancelled"]);

function assertTimestamp(at: number): void {
  if (!Number.isFinite(at)) throw new TypeError("Timestamp must be finite");
}

export function createSession(scenarioId: ScenarioId, at: number): LabSession {
  assertTimestamp(at);
  if (!scenarioById.has(scenarioId)) throw new TypeError("Unknown interaction scenario");
  return { scenarioId, phase: "idle", startedAt: null, endedAt: null, repeatCount: 0, events: [] };
}

export function transitionSession(session: LabSession, action: LabAction, at: number): LabSession {
  assertTimestamp(at);
  const from = session.phase;
  if (terminalPhases.has(from)) return session;

  let to: LabPhase = from;
  if (from === "idle" && action === "start") to = "offer";
  else if (from === "offer") {
    if (action === "accept") to = "confirm";
    else if (action === "decline") to = "declined";
    else if (action !== "repeat" && action !== "unclear" && action !== "stop") return session;
  } else if (from === "confirm") {
    if (action === "confirm") to = "completed";
    else if (action === "back") to = "offer";
    else if (action !== "repeat" && action !== "unclear" && action !== "stop") return session;
  } else {
    return session;
  }
  if (action === "stop") to = "cancelled";

  const lastAt = session.events.at(-1)?.at;
  const eventAt = lastAt === undefined ? at : Math.max(at, lastAt);
  const event: LabEvent = { action, at: eventAt, from, to };
  return {
    ...session,
    phase: to,
    startedAt: session.startedAt ?? (action === "start" ? eventAt : null),
    endedAt: terminalPhases.has(to) ? eventAt : null,
    repeatCount: session.repeatCount + (action === "repeat" ? 1 : 0),
    events: [...session.events, event],
  };
}

export function getSessionMessage(session: LabSession): string {
  const scenario = scenarioById.get(session.scenarioId);
  if (!scenario) return "เลือกสถานการณ์ที่ต้องการลองได้เลย";
  const lastAction = session.events.at(-1)?.action;
  if (lastAction === "repeat") return session.phase === "confirm" ? scenario.shortConfirmation : scenario.shortOffer;
  if (lastAction === "unclear") {
    return session.phase === "confirm"
      ? "เลือกได้เลย: ยืนยัน / ย้อนกลับ / หยุด"
      : "เลือกได้เลย: ต้องการ / ไม่ต้องการ / หยุด";
  }
  switch (session.phase) {
    case "idle": return scenario.description;
    case "offer": return scenario.offer;
    case "confirm": return scenario.confirmation;
    case "completed": return scenario.completion;
    case "declined": return "ไม่เป็นไร ยกเลิกคำขอนี้แล้ว";
    case "cancelled": return "หยุดการจำลองแล้ว";
  }
}

export function summarizeSession(session: LabSession): {
  durationMs: number;
  repeatCount: number;
  eventCount: number;
  outcome: LabPhase;
} {
  const endpoint = session.endedAt ?? session.events.at(-1)?.at ?? session.startedAt;
  const durationMs = session.startedAt === null || endpoint === null || endpoint === undefined
    ? 0
    : Math.max(0, endpoint - session.startedAt);
  return { durationMs, repeatCount: session.repeatCount, eventCount: session.events.length, outcome: session.phase };
}
