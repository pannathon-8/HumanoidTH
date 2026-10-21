"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { searchRobots, type SearchRobot, type SearchSource } from "@/lib/problem-search";

type Props = {
  robots: SearchRobot[];
  sources: SearchSource[];
  available: boolean;
  evidenceUnavailable: boolean;
};

const examples = ["อยากเรียนเขียนโค้ดด้วยหุ่นยนต์", "ต้องการสื่อสารทางไกล", "อยากหาหุ่นยนต์ช่วยด้านการเคลื่อนไหว"];

export default function CareLoopSearch({ robots, sources, available, evidenceUnavailable }: Props) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const canSearch = available && robots.length > 0;
  const results = useMemo(() => searchRobots(robots, sources, submitted), [robots, sources, submitted]);

  function search(value: string) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 500) {
      setError(trimmed ? "กรุณาเขียนไม่เกิน 500 ตัวอักษร" : "ลองเล่าว่าอยากให้หุ่นยนต์ช่วยเรื่องอะไร");
      input.current?.focus();
      return;
    }
    setError("");
    setSubmitted(trimmed);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSearch) search(query);
  }

  return (
    <section className="careloop panel" aria-labelledby="careloop-title" lang="th">
      <p className="careloop-eyebrow">CareLoop AI</p>
      <h2 id="careloop-title">ค้นหาหุ่นยนต์จากปัญหา</h2>
      <p>คุณอยากให้หุ่นยนต์ช่วยเรื่องอะไร? เริ่มจากความต้องการของคุณได้ทุกช่วงวัย โดยไม่ต้องรู้ชื่อรุ่นก่อน</p>
      <form onSubmit={submit}>
        <label htmlFor="careloop-problem">ปัญหาหรือสิ่งที่ต้องการ</label>
        <textarea
          ref={input}
          id="careloop-problem"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setError(""); }}
          rows={3}
          maxLength={500}
          disabled={!canSearch}
          placeholder="เช่น อยากเรียนเขียนโค้ดด้วยหุ่นยนต์ หรืออยากติดต่อคนในบ้านจากระยะไกล"
          aria-describedby={`careloop-privacy${error ? " careloop-error" : ""}`}
          aria-invalid={!!error}
        />
        <p id="careloop-privacy" className="muted careloop-help">ไม่ต้องกรอกอายุหรือข้อมูลส่วนตัว โปรดไม่ใส่ชื่อ อาการ หรือประวัติสุขภาพ คำค้นประมวลผลในหน้านี้และไม่ถูกส่งไปยังบริการ AI</p>
        {error && <p id="careloop-error" className="careloop-error" role="alert">{error}</p>}
        <div className="careloop-actions">
          <button className="primary" type="submit" disabled={!canSearch}>ค้นหาจากปัญหา</button>
          {submitted && <button type="button" onClick={() => { setQuery(""); setSubmitted(""); setError(""); input.current?.focus(); }}>ล้างการค้นหา</button>}
        </div>
      </form>
      <div className="careloop-examples" aria-label="ตัวอย่างปัญหา">
        <span className="muted">ลองค้นหา:</span>
        {examples.map((example) => <button key={example} type="button" disabled={!canSearch} onClick={() => { setQuery(example); search(example); }}>{example}</button>)}
      </div>
      {!available && <p className="notice" role="status">ยังเชื่อมต่อข้อมูลหุ่นยนต์ไม่ได้ กรุณาลองใหม่ภายหลัง</p>}
      {available && !robots.length && <p className="notice" role="status">ฐานข้อมูลยังไม่มีรุ่นหุ่นยนต์ให้ค้นหา กรุณาเพิ่มข้อมูลที่มีแหล่งอ้างอิงก่อน</p>}
      <div aria-live="polite" aria-atomic="true">
        {submitted && available && <p className="careloop-status">{results.length ? `พบข้อมูลที่เกี่ยวข้อง ${results.length} รายการ` : "ยังไม่พบข้อมูลที่เกี่ยวข้อง"}</p>}
      </div>
      {submitted && available && <div data-testid="careloop-results">
        <p className="muted">ค้นจากคำและหมวดความต้องการภาษาไทยหรืออังกฤษที่ระบบรองรับ ผลอาจตรงเพียงบางส่วนของโจทย์ และยังไม่ได้ยืนยันว่าหุ่นยนต์ตอบทุกข้อจำกัดหรือเหมาะกับบุคคลนั้น</p>
        {evidenceUnavailable && <p className="notice">ขณะนี้โหลดแหล่งอ้างอิงไม่ได้ ผลด้านล่างแสดงเฉพาะข้อมูลรุ่นที่มีอยู่</p>}
        {!results.length && <div className="empty">ลองแยกโจทย์ให้สั้นลง เช่น “การเรียน” หรือ “สื่อสารทางไกล” หากไม่มีข้อมูลเพียงพอ ระบบจะไม่สร้างรุ่นหรือความสามารถขึ้นมาแทน</div>}
        <div className="careloop-results">
          {results.map(({ robot, reasons, evidence }) => <article key={robot.id} className="card careloop-result">
            <h3>{robot.canonicalName}</h3>
            <p>{robot.description ?? "ยังไม่มีคำอธิบายรุ่น"}</p>
            <h4>เหตุผลที่พบรายการนี้</h4>
            <ul>{reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <h4>แหล่งข้อมูลที่เชื่อมกับรุ่น</h4>
            <p className="muted">ข้อความจากระเบียนต้นทาง ใช้ตรวจสอบต่อ ไม่ใช่การรับรองความสามารถทุกข้อในคำค้น</p>
            {evidence.length ? <ul className="careloop-evidence">{evidence.slice(0, 3).map((source) => <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a>
              <p>{source.excerpt ? `${source.excerpt.slice(0, 360)}${source.excerpt.length > 360 ? "…" : ""}` : "แหล่งนี้ยังไม่มีข้อความหลักฐานในระเบียน"}</p>
              <small className="muted">{source.platform ?? "ยังไม่ระบุประเภทแหล่ง"}{source.publishedAt ? ` · ${String(source.publishedAt).slice(0, 10)}` : " · ยังไม่ระบุวันที่เผยแพร่"}</small>
            </li>)}</ul> : <p className="notice">ยังไม่พบแหล่งหลักฐานที่เชื่อมกับรุ่นนี้อย่างชัดเจนในข้อมูลที่โหลด ควรตรวจเพิ่มเติมก่อนนำไปใช้</p>}
            <p className="careloop-unknown"><strong>ยังต้องตรวจเพิ่มเติม:</strong> ราคา การจัดซื้อ การเข้าถึงที่เหมาะกับผู้ใช้ ความปลอดภัย และผลลัพธ์ต่อสุขภาวะ ยังไม่มีข้อมูลที่ยืนยันในผลค้นหานี้</p>
            <a href={`#robot-${robot.id}`}>ดูรายการรุ่นในฐานข้อมูลด้านล่าง</a>
          </article>)}
        </div>
      </div>}
    </section>
  );
}
