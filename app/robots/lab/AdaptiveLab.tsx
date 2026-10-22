"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Square, Volume2, MousePointer2 } from "lucide-react";
import {
  buildPlan, createTrial, getTrialPrompt, summarizeTrial, transitionTrial,
  type ConstraintId, type GoalCategory, type OtherAdaptation, type PlanInput,
  type TrialAction, type TrialMode, type TrialPlan, type TrialState
} from "@/lib/interaction-plan";
import { appendStudy, parseStudies, TRIAL_HISTORY_KEY, type SavedStudy } from "@/lib/trial-history";
import { HISTORY_KEY, parseSavedRuns, type SavedLabRun } from "@/lib/interaction-history";
import { summarizeSession } from "@/lib/interaction-lab";
import { searchRobots, type SearchRobot } from "@/lib/problem-search";
import { consumeLabGoal } from "@/lib/careloop-lab-handoff";

const categories: Array<{ id: GoalCategory; label: string; example: string }> = [
  { id: "learning", label: "การเรียนรู้", example: "อยากฝึกคิดลำดับคำสั่งด้วยหุ่นยนต์" },
  { id: "communication", label: "การสื่อสาร", example: "อยากขอให้ติดต่อคนที่ไว้วางใจ" },
  { id: "assistance", label: "ขอความช่วยเหลือ", example: "อยากขอความช่วยเหลือเรื่องงานที่ทำอยู่" },
  { id: "routine", label: "กิจวัตรประจำวัน", example: "อยากวางแผนกิจกรรมที่ต้องทำ" },
  { id: "custom", label: "อื่น ๆ — กำหนดโจทย์ของคุณ", example: "" }
];
const constraints: Array<{ id: ConstraintId; label: string }> = [
  { id: "no-speech", label: "ไม่สะดวกพูด" }, { id: "no-hearing", label: "ไม่สะดวกฟัง" },
  { id: "short-text", label: "ต้องการข้อความสั้น" }, { id: "large-controls", label: "ต้องการปุ่มใหญ่" },
  { id: "other", label: "อื่น ๆ — ระบุเพิ่มเติม" }
];
const modeLabels: Record<TrialMode, string> = { voice: "เส้นทางเสียงจำลอง", text: "ปุ่มข้อความ" };
const eventLabels: Record<string, string> = { start: "เริ่ม", answer: "ตอบ", repeat: "ขอคำถามสั้น", "switch-channel": "เปลี่ยนช่องทาง", back: "ย้อนกลับ", stop: "หยุด" };
const outcomeLabels: Record<string, string> = { started: "เริ่มทดลอง", advanced: "ไปขั้นต่อไป", blocked: "ติดขัด ยังไปต่อไม่ได้", repeated: "แสดงคำถามสั้น", switched: "เปลี่ยนวิธีตอบ", back: "กลับไปทบทวน", completed: "จบขั้นตอนจำลอง", cancelled: "ยกเลิกหรือหยุด" };
const initialInput: PlanInput = {
  category: "learning", goalText: categories[0].example, contextText: "",
  constraints: [], otherConstraint: "", otherAdaptation: "text-buttons", customSteps: ["", ""]
};

export default function AdaptiveLab({ robots, requestedId, databaseAvailable }: {
  robots: SearchRobot[]; requestedId: string; databaseAvailable: boolean;
}) {
  const [input, setInput] = useState<PlanInput>(initialInput);
  const [plan, setPlan] = useState<TrialPlan | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [trials, setTrials] = useState<TrialState[]>([]);
  const [feedback, setFeedback] = useState("");
  const [studies, setStudies] = useState<SavedStudy[]>([]);
  const [legacy, setLegacy] = useState<SavedLabRun[]>([]);
  const [opened, setOpened] = useState<SavedStudy | null>(null);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [clearRequested, setClearRequested] = useState(false);
  const prompt = useRef<HTMLHeadingElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const running = trial?.phase === "running";
  const eventLimit = (trial?.events.length ?? 0) >= 1999;
  const currentStep = !plan ? 1 : trials.length ? 3 : 2;
  const linkedRobot = robots.find(r => r.id === requestedId);
  const matches = plan ? searchRobots(robots, [], plan.input.goalText).slice(0, 3).map(r => r.robot) : [];
  const related = linkedRobot ? [linkedRobot, ...matches.filter(r => r.id !== linkedRobot.id)] : matches;

  useEffect(() => {
    try {
      setStudies(parseStudies(localStorage.getItem(TRIAL_HISTORY_KEY)));
      setLegacy(parseSavedRuns(localStorage.getItem(HISTORY_KEY)));
    } catch { setNotice("อ่านประวัติในเครื่องไม่ได้ ยังทดลองโดยไม่บันทึกได้"); }
    try {
      const goalText = consumeLabGoal(sessionStorage);
      if (goalText) setInput(previous => ({ ...previous, category: "custom", goalText, customSteps: ["", ""] }));
    } catch { /* Browser storage may be unavailable. */ }
  }, []);

  function prepare() {
    const result = buildPlan({ ...input, customSteps: input.category === "custom" ? input.customSteps : [] });
    setErrors(result.errors);
    if (!result.plan) return;
    setPlan(result.plan);
    setTrial(null); setTrials([]); setSaved(false); setFeedback(""); setNotice("");
    requestAnimationFrame(() => previewHeading.current?.focus());
  }

  function start(mode: TrialMode) {
    if (!plan || running || trials.length >= 2 || trials.some(item => item.initialMode === mode)) return;
    setTrial(transitionTrial(createTrial(plan, mode), { type: "start", at: Date.now() }));
    setSaved(false); setNotice("");
    requestAnimationFrame(() => prompt.current?.focus());
  }

  function act(action: TrialAction) {
    if (!trial) return;
    const next = transitionTrial(trial, action);
    setTrial(next);
    if (next !== trial && (next.phase === "completed" || next.phase === "cancelled")) {
      setTrials(previous => [...previous.filter(item => item.initialMode !== next.initialMode), next]);
      setSaved(false);
    }
    requestAnimationFrame(() => prompt.current?.focus());
  }

  function currentStudy(): SavedStudy | null {
    if (!plan || !trials.length || running) return null;
    return { id: crypto.randomUUID(), createdAt: Date.now(), input: plan.input, trials, feedback: feedback.trim() };
  }

  function save() {
    try {
      const study = currentStudy();
      if (!study) return;
      const next = appendStudy(parseStudies(localStorage.getItem(TRIAL_HISTORY_KEY)), study);
      localStorage.setItem(TRIAL_HISTORY_KEY, JSON.stringify(next));
      setStudies(next); setSaved(true); setNotice("บันทึกโจทย์ แผน ผลทดลอง และความคิดเห็นไว้ในเบราว์เซอร์นี้แล้ว");
    } catch { setNotice("บันทึกไม่ได้ พื้นที่เก็บข้อมูลอาจเต็มหรือถูกปิด ผลยังอยู่ในหน้านี้"); }
  }

  function download() {
    try {
      const study = currentStudy();
      if (!study) return;
      const blob = new Blob([JSON.stringify({ format: "careloop-adaptive-study-v1", study }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "careloop-experiment.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("ส่งออกเป็นไฟล์ในเครื่องแล้ว ตรวจข้อความก่อนแบ่งปันกับผู้อื่น");
    } catch { setNotice("ส่งออกไม่ได้ ผลยังแสดงในหน้านี้"); }
  }

  function clearHistory() {
    try {
      localStorage.removeItem(TRIAL_HISTORY_KEY); setStudies([]); setOpened(null);
      setClearRequested(false); setSaved(false); setNotice("ลบประวัติการเปรียบเทียบแล้ว ประวัติรุ่นก่อนยังคงอยู่");
    } catch { setNotice("ลบประวัติไม่ได้ กรุณาตรวจการอนุญาตพื้นที่เก็บข้อมูล"); }
  }

  function results(items: TrialState[]) {
    return <div className="lab-comparison-table"><table>
      <caption>ผลจากการทดลองโจทย์เดียวกัน</caption>
      <thead><tr><th>วิธีเริ่มต้น</th><th>ผล</th><th>เวลา</th><th>ติดขัด</th><th>ขอซ้ำ</th><th>เปลี่ยนช่องทาง</th></tr></thead>
      <tbody>{items.map(item => {
        const s = summarizeTrial(item);
        return <tr key={item.initialMode}><th scope="row">{modeLabels[item.initialMode]}{item.mode !== item.initialMode && <small> → {modeLabels[item.mode]}</small>}</th>
          <td data-label="ผล">{item.phase === "completed" ? "จบขั้นตอน" : "หยุด / ยกเลิก"}</td><td data-label="เวลา">{(s.durationMs / 1000).toFixed(1)} วินาที</td>
          <td data-label="ติดขัดในต้นแบบ">{s.blockedCount}</td><td data-label="ขอซ้ำ">{s.repeatCount}</td><td data-label="เปลี่ยนช่องทาง">{s.switchCount}</td></tr>;
      })}</tbody>
    </table></div>;
  }

  function timeline(item: TrialState) {
    return <details className="lab-timeline"><summary>ดูเหตุการณ์ · {modeLabels[item.initialMode]}</summary>
      <ol>{item.events.map((event, index) => <li key={index}>
        <span>+{((event.at - (item.startedAt ?? event.at)) / 1000).toFixed(1)} วินาที · ขั้น {event.stepIndex + 1} · {modeLabels[event.mode]}</span>
        <strong>{eventLabels[event.type]}{event.choiceId ? `: ${item.plan.steps[event.stepIndex]?.choices.find(c => c.id === event.choiceId)?.label ?? event.choiceId}` : ""}</strong>
        <span>{outcomeLabels[event.outcome]}</span>
      </li>)}</ol>
    </details>;
  }

  return <div className="interaction-lab adaptive-lab" lang="th">
    <Link href="/robots" className="lab-back">← กลับไปค้นหาหุ่นยนต์</Link>
    <p className="lab-entry">ต้องการส่งข้อความให้คนรับและตอบรับจริง? <Link href="/robots/requests">เปิดหน้าส่งคำขอใช้งานจริง →</Link></p>
    <p className="careloop-eyebrow">CareLoop AI · ระบบที่ 2</p>
    <h1>โจทย์ต่างกัน วิธีโต้ตอบก็ต่างได้</h1>
    <p className="lab-intro">เลือกหรือเขียนโจทย์ของคุณ บอกข้อจำกัด แล้วลองสองวิธีเพื่อค้นหาว่าติดตรงไหนและเปลี่ยนแล้วไปต่อได้หรือไม่ ทุกช่วงวัยเริ่มได้โดยไม่ต้องกรอกอายุ</p>
    <p className="notice"><strong>ต้นแบบบนเว็บ:</strong> เส้นทางเสียงเป็นการจำลองด้วยปุ่ม ยังไม่เปิดไมโครโฟนหรืออ่านเสียงจริง ไม่มีการติดต่อคนหรือควบคุมอุปกรณ์ ผลนี้ใช้ศึกษาวิธีโต้ตอบ ไม่รับรองความสามารถของหุ่นยนต์</p>
    <ol className="lab-steps" aria-label="ขั้นตอนการทดลอง">
      <li aria-current={currentStep === 1 ? "step" : undefined}>1 โจทย์และข้อจำกัด</li>
      <li aria-current={currentStep === 2 ? "step" : undefined}>2 ทดลองรอบแรก</li>
      <li aria-current={currentStep === 3 ? "step" : undefined}>3 ปรับวิธีและเปรียบเทียบรอบสอง</li>
    </ol>

    {!plan && <section className="panel adaptive-setup" aria-labelledby="adaptive-setup-title">
      <h2 id="adaptive-setup-title">คุณอยากทดลองอะไร?</h2>
      {linkedRobot && <p className="notice">เชื่อมจากการค้นหารุ่น <strong>{linkedRobot.canonicalName}</strong> · รุ่นนี้ใช้เป็นข้อมูลประกอบเท่านั้น ไม่ได้ควบคุมหุ่นยนต์จริง</p>}
      {input.category === "custom" && <p className="lab-privacy">โจทย์จากการค้นหาถูกเติมไว้ให้แล้ว คุณกำหนดขั้นตอนทดลองเองได้ก่อนเริ่ม</p>}
      <div className="adaptive-form-grid">
        <div>
          <label className="lab-label" htmlFor="goal-category">หมวดโจทย์</label>
          <select id="goal-category" value={input.category} onChange={e => {
            const category = e.target.value as GoalCategory;
            setInput(previous => ({ ...previous, category, goalText: categories.find(c => c.id === previous.category)?.example === previous.goalText ? categories.find(c => c.id === category)!.example : previous.goalText }));
          }}>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <label className="lab-label" htmlFor="goal-text">โจทย์หรือเป้าหมายของคุณ</label>
          <textarea id="goal-text" maxLength={500} rows={3} value={input.goalText} onChange={e => setInput({ ...input, goalText: e.target.value })} />
          <label className="lab-label" htmlFor="goal-context">บริบทที่อยากลอง (ไม่บังคับ)</label>
          <input id="goal-context" maxLength={200} value={input.contextText} placeholder="เช่น ห้องเรียน บ้าน หรือพื้นที่ส่วนรวม" onChange={e => setInput({ ...input, contextText: e.target.value })} />
          <p className="lab-privacy">ไม่ต้องใส่ชื่อ ที่อยู่จริง หรือประวัติสุขภาพ ข้อความนี้ประมวลผลในหน้าเว็บ ไม่ส่งไปบริการ AI</p>
        </div>
        <fieldset><legend>ข้อจำกัดหรือสิ่งที่ต้องการ · เลือกได้หลายข้อ</legend>
          {constraints.map(c => <label key={c.id} className="adaptive-constraint"><input type="checkbox" checked={input.constraints.includes(c.id)} onChange={e => setInput(previous => ({ ...previous, constraints: e.target.checked ? [...previous.constraints, c.id] : previous.constraints.filter(id => id !== c.id) }))} /><span>{c.label}</span></label>)}
          {input.constraints.includes("other") && <>
            <label className="lab-label" htmlFor="constraint-other">ข้อจำกัดอื่น ๆ ของคุณ</label>
            <textarea id="constraint-other" rows={2} maxLength={200} value={input.otherConstraint} onChange={e => setInput({ ...input, otherConstraint: e.target.value })} />
            <label className="lab-label" htmlFor="constraint-strategy">คุณอยากทดลองรับมือด้วยวิธีใด?</label>
            <select id="constraint-strategy" value={input.otherAdaptation} onChange={e => setInput({ ...input, otherAdaptation: e.target.value as OtherAdaptation })}>
              <option value="text-buttons">ตอบด้วยปุ่มข้อความ</option><option value="short-prompts">ใช้คำถามสั้น</option><option value="step-by-step">ทำทีละขั้นและย้อนกลับได้</option>
            </select>
            <p className="lab-privacy">เว็บยังไม่ตีความข้อจำกัดใหม่อัตโนมัติ คุณเป็นผู้เลือกวิธีที่จะทดลอง แล้วตรวจว่าแผนตอบโจทย์หรือไม่</p>
          </>}
        </fieldset>
      </div>
      {input.category === "custom" && <fieldset className="adaptive-custom"><legend>แบ่งงานของคุณเป็นขั้นตอน · อย่างน้อย 2 ขั้น</legend>
        <p>โจทย์นี้ยังไม่มีบทสำเร็จรูป เขียนสิ่งที่คนต้องทำแต่ละขั้นให้ชัด ต้นแบบจะให้เลือกว่าทำขั้นนั้นได้หรือขอความช่วยเหลือ ก่อนยืนยันจบงาน</p>
        {input.customSteps.map((step, index) => <div key={index} className="adaptive-step-row">
          <label htmlFor={`custom-step-${index}`}>ขั้นตอนที่ {index + 1}</label>
          <input id={`custom-step-${index}`} maxLength={160} value={step} onChange={e => setInput({ ...input, customSteps: input.customSteps.map((old, i) => i === index ? e.target.value : old) })} />
          {input.customSteps.length > 2 && <button onClick={() => setInput({ ...input, customSteps: input.customSteps.filter((_, i) => i !== index) })} aria-label={`นำขั้นตอนที่ ${index + 1} ออก`}>นำออก</button>}
        </div>)}
        {input.customSteps.length < 5 && <button onClick={() => setInput({ ...input, customSteps: [...input.customSteps, ""] })}>เพิ่มขั้นตอน</button>}
      </fieldset>}
      {errors.length > 0 && <div role="alert" className="notice"><strong>ตรวจข้อมูลก่อนเริ่ม</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
      <button className="primary lab-start" onClick={prepare}>ตรวจข้อมูลและสร้างแผนทดลอง</button>
    </section>}

    {plan && <>
      <section className="panel adaptive-preview" aria-labelledby="adaptive-preview-title">
        <h2 id="adaptive-preview-title" ref={previewHeading} tabIndex={-1}>แผนที่คุณกำลังจะทดลอง</h2>
        <p className="adaptive-goal"><strong>เป้าหมาย:</strong> {plan.input.goalText}</p>
        {plan.input.contextText && <p><strong>บริบท:</strong> {plan.input.contextText}</p>}
        {plan.input.constraints.includes("other") && <p><strong>ข้อจำกัดที่คุณเพิ่ม:</strong> {plan.input.otherConstraint}</p>}
        <ul>{plan.adaptations.map((text, i) => <li key={i}>{text}</li>)}</ul>
        <details open><summary>ขั้นตอนที่ระบบสร้างจากข้อมูลของคุณ</summary><ol>{plan.steps.map(step => <li key={step.id}><strong>{step.question}</strong><p className="muted">ตัวเลือก: {step.choices.map(c => c.label).join(" / ")}</p></li>)}</ol></details>
        <p>ระบบตรวจความครบถ้วนของข้อมูลก่อนสร้างแผน แต่ไม่ได้วิเคราะห์ความหมายด้วย AI หากขั้นตอนไม่ตรงงาน ให้แก้หมวด โจทย์ หรือเลือก “อื่น ๆ” แล้วกำหนดขั้นตอนเอง</p>
        <div className="lab-response">
          <button disabled={!!running} onClick={() => { setPlan(null); setTrial(null); setTrials([]); setSaved(false); }}>แก้โจทย์และเริ่มการเปรียบเทียบใหม่</button>
        </div>
      </section>

      <section className={`panel adaptive-stage ${plan.input.constraints.includes("large-controls") ? "large-controls" : ""}`} aria-labelledby="adaptive-stage-title">
        <div className="lab-stage-header"><Bot size={32} aria-hidden="true" /><h2 id="adaptive-stage-title">ทดลองโจทย์เดียวกันด้วยสองวิธี</h2></div>
        <p>{trials.length === 0 ? "รอบที่ 1 จาก 2: เลือกวิธีเริ่มต้น หลังจบรอบนี้ ระบบจะใช้โจทย์และข้อจำกัดชุดเดิมในรอบที่ 2 ด้วยอีกวิธี" : trials.length === 1 ? "รอบที่ 1 เสร็จแล้ว: เลือกอีกวิธีเพื่อทดลองโจทย์เดิมเป็นรอบที่ 2" : "ครบ 2 รอบแล้ว: ผลทั้งสองรอบใช้โจทย์และข้อจำกัดชุดเดียวกัน"}</p>
        {trials.length < 2 && <div className="lab-response">
          {!trials.some(item => item.initialMode === "voice") && <button disabled={!!running} onClick={() => start("voice")}><Volume2 size={18} aria-hidden="true" /> {trials.length ? "รอบที่ 2 · เส้นทางเสียงจำลอง" : "รอบที่ 1 · เส้นทางเสียงจำลอง"}</button>}
          {!trials.some(item => item.initialMode === "text") && <button className="primary" disabled={!!running} onClick={() => start("text")}><MousePointer2 size={18} aria-hidden="true" /> {trials.length ? "รอบที่ 2 · ปุ่มข้อความ" : "รอบที่ 1 · ปุ่มข้อความ"}</button>}
        </div>}
        {trial && <>
          <p className="badge">{modeLabels[trial.mode]} · ขั้น {Math.min(trial.stepIndex + 1, plan.steps.length)} / {plan.steps.length}</p>
          <div className="lab-dialogue" aria-live="polite" aria-atomic="true"><MessageCircle size={22} aria-hidden="true" />
            <h3 ref={prompt} tabIndex={-1}>{getTrialPrompt(trial)}</h3>
            {trial.lastMessage && <p className="notice">{trial.lastMessage}</p>}
          </div>
          {running && <>
            {trial.mode === "voice" && <p>กดปุ่ม “จำลองพูด” เพื่อทดสอบเส้นทางตอบด้วยเสียง ยังไม่มีการรับเสียงจริง หากข้อจำกัดทำให้เส้นทางนี้ติดขัด คุณเปลี่ยนเป็นปุ่มข้อความได้</p>}
            <div className="lab-response" aria-label="คำตอบในขั้นตอนนี้">
              {plan.steps[trial.stepIndex]?.choices.map(choice => <button key={choice.id} className="primary" disabled={eventLimit} onClick={() => act({ type: "answer", choiceId: choice.id, at: Date.now() })}>{trial.mode === "voice" ? "จำลองพูด: " : ""}{choice.label}</button>)}
            </div>
            <div className="lab-response">
              <button disabled={eventLimit} onClick={() => act({ type: "switch-channel", mode: trial.mode === "voice" ? "text" : "voice", at: Date.now() })}>{trial.mode === "voice" ? "เปลี่ยนเป็นปุ่มข้อความ" : "เปลี่ยนเป็นเสียงจำลอง"}</button>
              <button disabled={eventLimit} onClick={() => act({ type: "repeat", at: Date.now() })}>ขอคำถามแบบสั้น</button>
              <button disabled={eventLimit || trial.stepIndex === 0} onClick={() => act({ type: "back", at: Date.now() })}>ย้อนกลับหนึ่งขั้น</button>
              <button className="lab-stop" onClick={() => act({ type: "stop", at: Date.now() })}><Square size={16} aria-hidden="true" /> หยุดการทดลอง</button>
            </div>
            {eventLimit && <p className="notice">ถึงขีดจำกัดเหตุการณ์แล้ว กรุณาหยุดเพื่อดูผลและเริ่มรอบใหม่</p>}
          </>}
        </>}
      </section>

      {trials.length > 0 && <section className="panel lab-history" aria-labelledby="comparison-title">
        <h2 id="comparison-title">เปลี่ยนวิธีแล้วเกิดอะไรขึ้น?</h2>
        {results(trials)}
        {trials.length < 2 && <p className="notice">มีผลหนึ่งวิธีแล้ว ลองอีกวิธีด้านบนเพื่อเปรียบเทียบโจทย์เดียวกัน</p>}
        <p className="muted">ตัวเลขมาจากการกดในรอบนี้ เส้นทางเสียงยังเป็นการจำลอง เวลาและความคุ้นเคยอาจต่างกัน จึงยังสรุปไม่ได้ว่าวิธีใดเหมาะกับทุกคน การหยุดหรือปฏิเสธเป็นสิทธิ์ของผู้ใช้</p>
        {trials.map(item => <div key={item.initialMode}>{timeline(item)}</div>)}
        <label className="lab-label" htmlFor="study-feedback">ติดขัดตรงไหน หรืออยากให้ปรับอะไร? (ไม่บังคับ)</label>
        <textarea id="study-feedback" rows={3} maxLength={500} value={feedback} onChange={e => { setFeedback(e.target.value); setSaved(false); }} />
        <p className="lab-privacy">โจทย์ ข้อจำกัด และความคิดเห็นอาจเป็นข้อมูลส่วนตัว โปรดไม่ใส่ชื่อหรือประวัติสุขภาพ เก็บเฉพาะเมื่อคุณกดบันทึกในเบราว์เซอร์นี้ ไม่ส่งให้เจ้าของเว็บหรือบริการ AI โดยอัตโนมัติ</p>
        <div className="lab-response"><button className="primary" disabled={saved || !!running} onClick={save}>{saved ? "บันทึกผลแล้ว" : "บันทึกผลในเครื่องนี้"}</button><button disabled={!!running} onClick={download}>ส่งออกผล JSON สำหรับศึกษาต่อ</button></div>
      </section>}
      <section className="panel lab-history"><h2>ข้อมูลหุ่นยนต์สำหรับศึกษาต่อ</h2>
        <p>ข้อมูลส่วนนี้เป็นจุดเชื่อมกับฐานเดิม การเลือกรุ่นไม่ได้ทำให้หุ่นยนต์นั้นทำตามบททดลองได้ และผลทดลองนี้ยังไม่ใช่หลักฐานรับรองรุ่น</p>
        {related.length > 0 ? <ul>{related.map(robot => <li key={robot.id}><div><strong>{robot.canonicalName}</strong><p>{robot.description}</p><Link href={`/robots#robot-${robot.id}`}>เปิดระเบียนและแหล่งข้อมูล</Link></div></li>)}</ul> : <p className="muted">{databaseAvailable ? "ยังไม่พบรุ่นที่เชื่อมกับคำในโจทย์นี้ ค้นและตรวจหลักฐานเพิ่มเติมได้จากหน้าหุ่นยนต์" : "ยังโหลดข้อมูลรุ่นไม่ได้ การทดลองรูปแบบบนเว็บยังทำต่อได้"}</p>}
      </section>
    </>}

    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="panel lab-history" aria-labelledby="saved-studies-title">
      <h2 id="saved-studies-title">การทดลองที่บันทึกในเครื่องนี้</h2>
      {!studies.length && <p className="muted">ยังไม่มีผลเปรียบเทียบที่บันทึก</p>}
      <ul>{studies.map(study => <li key={study.id}><div><strong>{study.input.goalText}</strong><p>{study.trials.length} วิธี · {study.input.contextText || "ไม่ระบุบริบท"}</p></div><button onClick={() => setOpened(study)}>เปิดผลที่บันทึก</button></li>)}</ul>
      {studies.length > 0 && <button onClick={() => setClearRequested(true)}>ลบประวัติการเปรียบเทียบ</button>}
      {clearRequested && <div className="notice"><p>ลบผลเปรียบเทียบที่บันทึกในเบราว์เซอร์นี้หรือไม่?</p><button onClick={clearHistory}>ยืนยันลบประวัติการเปรียบเทียบ</button><button onClick={() => setClearRequested(false)}>เก็บประวัติไว้</button></div>}
      {opened && <section className="lab-review"><h3>{opened.input.goalText}</h3><p>{opened.input.contextText}</p><p>ข้อจำกัด: {opened.input.constraints.map(id => constraints.find(c => c.id === id)?.label).join(" / ") || "ไม่ระบุ"}</p>{results(opened.trials)}{opened.trials.map(item => <div key={item.initialMode}>{timeline(item)}</div>)}{opened.feedback && <p><strong>ความคิดเห็น:</strong> {opened.feedback}</p>}<button onClick={() => setOpened(null)}>ปิดผลย้อนหลัง</button></section>}
      {legacy.length > 0 && <details className="lab-timeline"><summary>ประวัติทดลองจากรุ่นก่อน · {legacy.length} รอบ</summary><ul>{legacy.map(run => <li key={run.id}>{run.robotName || "รูปแบบทั่วไป"} · {run.session.scenarioId} · {(summarizeSession(run.session).durationMs / 1000).toFixed(1)} วินาที</li>)}</ul></details>}
    </section>
  </div>;
}
