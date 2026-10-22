"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, MessageCircle, Square, RotateCcw } from "lucide-react";
import {
  SCENARIOS, createSession, getSessionMessage, summarizeSession, transitionSession,
  type LabAction, type LabPhase, type LabSession, type ScenarioId
} from "@/lib/interaction-lab";
import {
  HISTORY_KEY, MAX_SAVED_RUNS, addSavedRun, parseSavedRuns,
  type LabContext, type SavedLabRun
} from "@/lib/interaction-history";

type Robot = { id: string; canonicalName: string };
const contexts: Record<LabContext, string> = { home: "ที่บ้าน", school: "ที่โรงเรียน / สถานศึกษา", community: "พื้นที่ส่วนรวม" };
const actionLabels: Record<LabAction, string> = {
  start: "เริ่มทดลอง", accept: "ต้องการ", decline: "ไม่ต้องการ", repeat: "ขอพูดซ้ำแบบสั้น",
  unclear: "ลองกรณีระบบไม่เข้าใจ", back: "ย้อนกลับ", confirm: "ยืนยัน", stop: "หยุด"
};
const phaseLabels: Record<LabPhase, string> = {
  idle: "พร้อมเริ่ม", offer: "กำลังถามความต้องการ", confirm: "รอการยืนยัน",
  completed: "ยืนยันผลจำลองแล้ว", declined: "เลือกไม่ดำเนินการ", cancelled: "หยุดโดยผู้ทดลอง"
};

export default function InteractionLab({ robots, requestedId, databaseAvailable }: {
  robots: Robot[]; requestedId: string; databaseAvailable: boolean;
}) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("learning");
  const [context, setContext] = useState<LabContext>("home");
  const [robotId, setRobotId] = useState(robots.some(r => r.id === requestedId) ? requestedId : "");
  const [session, setSession] = useState<LabSession>(() => createSession("learning", 0));
  const [runs, setRuns] = useState<SavedLabRun[]>([]);
  const [review, setReview] = useState<SavedLabRun | null>(null);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const response = useRef<HTMLHeadingElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const active = session.phase === "offer" || session.phase === "confirm";
  const ended = ["completed", "declined", "cancelled"].includes(session.phase);
  const eventLimitReached = session.events.length >= 1999;
  const scenario = SCENARIOS.find(s => s.id === scenarioId)!;
  const selectedRobot = robots.find(r => r.id === robotId);

  useEffect(() => {
    try { setRuns(parseSavedRuns(localStorage.getItem(HISTORY_KEY))); }
    catch { setMessage("อ่านประวัติในเครื่องไม่ได้ คุณยังทดลองได้โดยไม่บันทึก"); }
    setStorageReady(true);
  }, []);

  function act(action: LabAction) {
    setSession(previous => previous.events.length >= 1999 && action !== "stop"
      ? previous : transitionSession(previous, action, Date.now()));
    setMessage("");
    requestAnimationFrame(() => response.current?.focus());
  }

  function newRun() {
    setSession(createSession(scenarioId, Date.now()));
    setSaved(false);
    setMessage("");
    requestAnimationFrame(() => startButton.current?.focus());
  }

  function saveRun() {
    if (!ended || saved || !storageReady) return;
    try {
      const run: SavedLabRun = {
        id: crypto.randomUUID(), robotId: selectedRobot?.id ?? null,
        robotName: selectedRobot?.canonicalName ?? null, context, session
      };
      // Re-read before saving so another tab's saved runs are retained.
      const next = addSavedRun(parseSavedRuns(localStorage.getItem(HISTORY_KEY)), run);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      setRuns(next);
      setSaved(true);
      setMessage("บันทึกผลในเบราว์เซอร์นี้แล้ว เปิดดูย้อนหลังได้ด้านล่าง");
    } catch { setMessage("บันทึกไม่ได้ พื้นที่เก็บข้อมูลอาจเต็มหรือถูกปิด ผลการทดลองยังแสดงอยู่ในหน้านี้"); }
  }

  function clearHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY);
      setRuns([]);
      setReview(null);
      setConfirmClear(false);
      setMessage("ลบประวัติที่บันทึกในเบราว์เซอร์นี้แล้ว");
    } catch { setMessage("ลบประวัติไม่ได้ กรุณาตรวจการอนุญาตพื้นที่เก็บข้อมูลของเบราว์เซอร์"); }
  }

  function renderResult(result: LabSession) {
    const summary = summarizeSession(result);
    return <>
      <dl className="lab-metrics">
        <div><dt>ผลการทดลอง</dt><dd>{phaseLabels[summary.outcome]}</dd></div>
        <div><dt>เวลาจนจบ</dt><dd>{(summary.durationMs / 1000).toFixed(1)} วินาที</dd></div>
        <div><dt>ขอพูดซ้ำ</dt><dd>{summary.repeatCount} ครั้ง</dd></div>
        <div><dt>เหตุการณ์</dt><dd>{summary.eventCount} รายการ</dd></div>
      </dl>
      <p className="muted">วัดจากการกดบนต้นแบบครั้งนี้ การเลือกปฏิเสธหรือหยุดเป็นสิทธิ์ของผู้ใช้ ไม่ใช่ผลสอบตก และตัวเลขนี้ไม่ใช่ผลประเมินหุ่นยนต์จริง</p>
      <details className="lab-timeline" open>
        <summary>ลำดับเหตุการณ์ที่เกิดขึ้นจริงบนเว็บ</summary>
        <ol>{result.events.map((event, index) => <li key={index}>
          <span>+{((event.at - (result.startedAt ?? event.at)) / 1000).toFixed(1)} วินาที</span>
          <strong>{actionLabels[event.action]}</strong>
          <span>{phaseLabels[event.to]}</span>
        </li>)}</ol>
      </details>
    </>;
  }

  return <div className="interaction-lab" lang="th">
    <Link href="/robots" className="lab-back">← กลับไปค้นหาหุ่นยนต์</Link>
    <p className="careloop-eyebrow">CareLoop AI · ระบบที่ 2</p>
    <h1>ทดลองสถานการณ์ปฏิสัมพันธ์</h1>
    <p className="lab-intro">สวมบทผู้ใช้ ลองตอบ เปลี่ยนใจ หรือหยุด แล้วดูว่าลำดับการช่วยเหลือเคารพการตัดสินใจของคุณหรือไม่</p>
    <p className="notice"><strong>พื้นที่ทดลองบนเว็บ:</strong> บทสนทนาเป็นรูปแบบที่เราเสนอ ยังไม่ยืนยันว่าหุ่นยนต์รุ่นที่เลือกทำได้ ไม่มีการโทร ส่งข้อความ หรือสั่งอุปกรณ์จริง</p>

    <ol className="lab-steps" aria-label="ขั้นตอนการทดลอง">
      <li aria-current={session.phase === "idle" ? "step" : undefined}>1 เลือกสถานการณ์</li>
      <li aria-current={active ? "step" : undefined}>2 ลองโต้ตอบ</li>
      <li aria-current={ended ? "step" : undefined}>3 ดูผลและบันทึก</li>
    </ol>

    <div className="lab-layout">
      <section className="panel lab-setup" aria-labelledby="lab-setup-title">
        <h2 id="lab-setup-title">เลือกสิ่งที่อยากทดลอง</h2>
        <fieldset disabled={session.phase !== "idle"}>
          <legend>สถานการณ์</legend>
          {SCENARIOS.map(item => <label className={`lab-scenario ${scenarioId === item.id ? "selected" : ""}`} key={item.id}>
            <input type="radio" name="scenario" value={item.id} checked={scenarioId === item.id}
              onChange={() => { setScenarioId(item.id); setSession(createSession(item.id, 0)); }} />
            <span><strong>{item.title}</strong><small>{item.description}</small></span>
          </label>)}
          <label className="lab-label" htmlFor="lab-context">บริบทที่ใช้จินตนาการ</label>
          <select id="lab-context" value={context} onChange={e => setContext(e.target.value as LabContext)}>
            {Object.entries(contexts).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <label className="lab-label" htmlFor="lab-robot">รุ่นหุ่นยนต์ที่ใช้เป็นข้อมูลประกอบ</label>
          <select id="lab-robot" value={robotId} onChange={e => setRobotId(e.target.value)}>
            <option value="">ทดลองรูปแบบทั่วไป โดยยังไม่เลือกรุ่น</option>
            {robots.map(robot => <option value={robot.id} key={robot.id}>{robot.canonicalName}</option>)}
          </select>
        </fieldset>
        {!databaseAvailable && <p className="notice">โหลดรายการรุ่นไม่ได้ ยังทดลองสถานการณ์ทั่วไปได้โดยไม่อ้างอิงรุ่น</p>}
        {databaseAvailable && requestedId && !robots.some(r => r.id === requestedId) && <p className="notice">ไม่พบรุ่นจากลิงก์นี้ กรุณาเลือกรุ่นจากรายการ หรือทดลองแบบทั่วไป</p>}
        <p className="muted">ทุกรุ่นทดลองบทนี้ได้ในฐานะแนวคิด ข้อมูลสเปกและหลักฐานของรุ่นยังต้องตรวจแยกในหน้าค้นหา</p>
        {selectedRobot && <Link href={`/robots#robot-${selectedRobot.id}`}>อ่านระเบียนของ {selectedRobot.canonicalName}</Link>}
        {session.phase === "idle" && <button ref={startButton} className="primary lab-start" onClick={() => act("start")}>เริ่มทดลอง</button>}
        {session.phase !== "idle" && <p className="lab-locked">{active ? "หยุดการทดลองก่อนเปลี่ยนสถานการณ์" : "กดเริ่มรอบใหม่เพื่อเปลี่ยนสถานการณ์"}</p>}
      </section>

      <section className="panel lab-stage" aria-labelledby="lab-stage-title">
        <div className="lab-stage-header"><Bot size={34} aria-hidden="true" /><div><span className="badge">ตัวแทนหุ่นยนต์จำลอง</span><h2 id="lab-stage-title">{scenario.title}</h2></div></div>
        <p className="muted">{contexts[context]} · {selectedRobot?.canonicalName ?? "ยังไม่ผูกกับหุ่นยนต์รุ่นใด"}</p>
        <div className="lab-dialogue" aria-live="polite" aria-atomic="true">
          <MessageCircle size={22} aria-hidden="true" />
          <h3 ref={response} tabIndex={-1}>{getSessionMessage(session)}</h3>
          <p className="lab-phase">{phaseLabels[session.phase]}</p>
        </div>
        {active && <div className="lab-response" aria-label="คำตอบของผู้ทดลอง">
          {session.phase === "offer" ? <>
            <button className="primary" disabled={eventLimitReached} onClick={() => act("accept")}>ต้องการ</button>
            <button disabled={eventLimitReached} onClick={() => act("decline")}>ไม่ต้องการ</button>
          </> : <>
            <button className="primary" disabled={eventLimitReached} onClick={() => act("confirm")}><CheckCircle2 size={18} aria-hidden="true" /> ยืนยันผลจำลอง</button>
            <button disabled={eventLimitReached} onClick={() => act("back")}>ย้อนกลับไปเลือกใหม่</button>
          </>}
          <button disabled={eventLimitReached} onClick={() => act("repeat")}>ขอพูดซ้ำแบบสั้น</button>
          <button disabled={eventLimitReached} onClick={() => act("unclear")}>ลองกรณีระบบไม่เข้าใจ</button>
          <button className="lab-stop" onClick={() => act("stop")}><Square size={16} aria-hidden="true" /> หยุดการทดลอง</button>
        </div>}
        {active && eventLimitReached && <p className="notice">รอบนี้ถึงขีดจำกัดเหตุการณ์แล้ว กรุณากดหยุดเพื่อดูผลและเริ่มรอบใหม่</p>}
        {ended && <>
          <div className="lab-result" data-testid="lab-result">{renderResult(session)}</div>
          <div className="lab-response">
            <button className="primary" disabled={saved || !storageReady} onClick={saveRun}>{saved ? "บันทึกผลแล้ว" : "บันทึกผลในเครื่องนี้"}</button>
            <button onClick={newRun}><RotateCcw size={16} aria-hidden="true" /> เริ่มรอบใหม่</button>
          </div>
        </>}
        <p className="lab-privacy">คำตอบมีเฉพาะปุ่ม ไม่ขอชื่อหรือประวัติสุขภาพ ประวัติจะเก็บในเบราว์เซอร์เฉพาะเมื่อกดบันทึก สูงสุด {MAX_SAVED_RUNS} รอบล่าสุด ไม่ส่งผลทดลองไปยังเซิร์ฟเวอร์หรือบริการ AI</p>
        {message && <p role="status" className="notice">{message}</p>}
      </section>
    </div>

    <section className="panel lab-history" aria-labelledby="lab-history-title">
      <h2 id="lab-history-title">ผลที่บันทึกในเครื่องนี้</h2>
      {runs.length > 0 && <button onClick={() => setConfirmClear(true)}>ลบประวัติในเครื่องนี้</button>}
      {confirmClear && <div className="notice" role="group" aria-label="ยืนยันลบประวัติ">
        <p>ลบผลที่บันทึกทุกรอบในเบราว์เซอร์นี้หรือไม่?</p>
        <div className="lab-response"><button onClick={clearHistory}>ยืนยันลบประวัติ</button><button onClick={() => setConfirmClear(false)}>เก็บประวัติไว้</button></div>
      </div>}
      {!runs.length && <p className="muted">ยังไม่มีผลที่บันทึก ลองสถานการณ์แล้วกดบันทึกเพื่อเปิดดูย้อนหลัง แม้รีเฟรชหน้า</p>}
      <ul>{runs.map(run => <li key={run.id}>
        <div><strong>{SCENARIOS.find(s => s.id === run.session.scenarioId)?.title}</strong><p>{contexts[run.context]} · {run.robotName ?? "รูปแบบทั่วไป"} · {phaseLabels[run.session.phase]}</p></div>
        <button onClick={() => setReview(run)} aria-pressed={review?.id === run.id}>ดูผลรอบนี้</button>
      </li>)}</ul>
      {review && <section className="lab-review" aria-label="รายละเอียดผลย้อนหลัง">
        <h3>ผลย้อนหลัง · {SCENARIOS.find(s => s.id === review.session.scenarioId)?.title}</h3>
        <p>{contexts[review.context]} · {review.robotName ?? "รูปแบบทั่วไป"}</p>
        {renderResult(review.session)}
        <button onClick={() => setReview(null)}>ปิดผลย้อนหลัง</button>
      </section>}
    </section>
  </div>;
}
