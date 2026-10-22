"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCircle2, Send, XCircle } from "lucide-react";
import SpeechInput from "./SpeechInput";

type Role = "sender" | "receiver";
type Status = "PENDING" | "ACCEPTED" | "DONE" | "CANCELLED" | "DECLINED";
type Category = "assistance" | "communication" | "task" | "other";
type Channel = "text" | "preset" | "voice";
type Auth = { roomId: string; token: string; receiverToken?: string; expiresAt?: string };
type RequestItem = {
  id: string; message: string; category: Category; place: string; channel: Channel; status: Status;
  createdAt: string; updatedAt: string;
  events: Array<{ action: string; actor: Role; createdAt: string }>;
};
type Draft = { message: string; category: Category; place: string; channel: Channel; clientRequestId: string };
const categories: Record<Category, string> = { assistance: "ขอความช่วยเหลือ", communication: "อยากติดต่อหรือพูดคุย", task: "ขอให้ช่วยทำงาน", other: "อื่น ๆ" };
const statuses: Record<Status, string> = { PENDING: "ส่งแล้ว · รอผู้รับ", ACCEPTED: "ผู้รับตอบรับแล้ว", DONE: "ผู้รับแจ้งว่าดำเนินการแล้ว", CANCELLED: "ผู้ส่งยกเลิกแล้ว", DECLINED: "ผู้รับไม่สะดวกช่วย" };
const actions: Record<string, string> = { created: "ส่งคำขอ", accept: "ตอบรับคำขอ", complete: "แจ้งดำเนินการแล้ว", cancel: "ยกเลิกคำขอ", decline: "แจ้งไม่สะดวกช่วย" };
const presets: Array<{ message: string; category: Category }> = [
  { message: "ช่วยมาหาหน่อย ตอนนี้ไม่สะดวกพูด", category: "assistance" },
  { message: "อยากคุยด้วย กรุณาติดต่อกลับเมื่อสะดวก", category: "communication" },
  { message: "ช่วยนำอุปกรณ์มาให้หน่อย", category: "task" }
];

function storedAuth(value: unknown): Auth | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.roomId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(record.roomId) ||
    typeof record.token !== "string" || !/^[a-f0-9]{64}$/.test(record.token)) return null;
  return { roomId: record.roomId, token: record.token,
    receiverToken: typeof record.receiverToken === "string" && /^[a-f0-9]{64}$/.test(record.receiverToken) ? record.receiverToken : undefined,
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : undefined };
}

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

export default function RequestExchange({ mode }: { mode: Role }) {
  const storageKey = `careloop.requests.${mode}.v1`;
  const [auth, setAuth] = useState<Auth | null>(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category>("assistance");
  const [place, setPlace] = useState("");
  const [channel, setChannel] = useState<Channel>("text");
  const [review, setReview] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [expired, setExpired] = useState(false);
  const [origin, setOrigin] = useState("");
  const [lastRead, setLastRead] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      let next: Auth | null = null;
      if (mode === "receiver") {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        if (fragment.has("room") || fragment.has("key")) {
          next = storedAuth({ roomId: fragment.get("room"), token: fragment.get("key") });
          if (!next) setNotice("ลิงก์ผู้รับไม่ครบหรือไม่ถูกต้อง ขอให้ผู้ส่งคัดลอกลิงก์ใหม่");
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
      if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else next = storedAuth(JSON.parse(sessionStorage.getItem(storageKey) ?? "null"));
      setAuth(next);
    } catch { setNotice("อ่านช่องทางเดิมไม่ได้ กรุณาเปิดลิงก์ผู้รับใหม่หรือสร้างช่องทางใหม่"); }
    setReady(true);
  }, [mode, storageKey]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!auth) return;
    try {
      const response = await fetch(`/api/careloop/rooms/${encodeURIComponent(auth.roomId)}/requests`, {
        headers: { Authorization: `Bearer ${auth.token}` }, cache: "no-store", signal
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 410) setExpired(true);
        throw new Error(data.error ?? "อ่านคำขอไม่ได้");
      }
      if (data.role !== mode || !Array.isArray(data.requests)) throw new Error("สิทธิ์ของช่องทางไม่ตรงกับหน้านี้");
      setItems(data.requests); setLastRead(new Date().toISOString()); setConnectionError("");
    } catch (error) {
      if (signal?.aborted) return;
      setConnectionError(error instanceof Error ? error.message : "เชื่อมต่อไม่ได้ กรุณาลองใหม่");
    }
  }, [auth, mode]);

  useEffect(() => {
    if (!auth) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(controller.signal); if (!controller.signal.aborted) timer = setTimeout(poll, 2000); };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [auth, refresh]);

  async function createRoom() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/careloop/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "สร้างช่องทางไม่ได้");
      const next = storedAuth({ roomId: data.roomId, token: data.senderToken, receiverToken: data.receiverToken, expiresAt: data.expiresAt });
      if (!next || !next.receiverToken) throw new Error("ข้อมูลช่องทางไม่ครบ กรุณาลองใหม่");
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { setNotice("ช่องทางพร้อมแล้ว แต่เบราว์เซอร์ไม่เก็บสิทธิ์ไว้หลังรีเฟรช"); }
      setItems([]); setAuth(next); setExpired(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "สร้างช่องทางไม่ได้"); }
    finally { setBusy(false); }
  }

  async function deleteRoom() {
    if (!auth || mode !== "sender" || busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/careloop/rooms/${encodeURIComponent(auth.roomId)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${auth.token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "ลบช่องทางไม่ได้");
      try { sessionStorage.removeItem(storageKey); } catch { /* Room deletion still clears the in-memory credentials. */ }
      setAuth(null); setItems([]); setReview(null); setExpired(false);
      setNotice("ลบช่องทางและข้อมูลคำขอแล้ว");
    } catch (error) { setNotice(error instanceof Error ? error.message : "ลบช่องทางไม่ได้"); }
    finally { setBusy(false); }
  }

  function reviewDraft() {
    if (!message.trim() || message.trim().length > 500 || place.trim().length > 100) {
      setNotice("เขียนคำขอ 1–500 ตัวอักษร และจุดนัดหมายไม่เกิน 100 ตัวอักษร"); return;
    }
    if (!crypto.randomUUID) { setNotice("เบราว์เซอร์นี้สร้างรหัสคำขอไม่ได้ กรุณาเปิดผ่าน localhost หรือ HTTPS"); return; }
    setReview({ message: message.trim(), place: place.trim(), category, channel, clientRequestId: crypto.randomUUID() });
    setNotice("");
  }

  async function send() {
    if (!auth || !review || busy || expired) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/careloop/rooms/${auth.roomId}/requests`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` }, body: JSON.stringify(review)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "ส่งไม่สำเร็จ กรุณาลองใหม่");
      setItems(previous => [data.request, ...previous.filter(item => item.id !== data.request.id)]);
      setReview(null); setMessage(""); setPlace(""); setChannel("text");
      setNotice("ส่งคำขอแล้ว รอผู้รับเปิดหน้ารับคำขอและตอบรับ");
      void refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "ส่งไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }

  async function change(item: RequestItem, action: "accept" | "complete" | "cancel" | "decline") {
    if (!auth || busy || expired) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/careloop/rooms/${auth.roomId}/requests/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "เปลี่ยนสถานะไม่ได้");
      setItems(previous => previous.map(old => old.id === item.id ? data.request : old));
      setNotice("บันทึกสถานะแล้ว อีกฝั่งจะเห็นสถานะนี้เมื่อเชื่อมต่อได้");
    } catch (error) { setNotice(error instanceof Error ? error.message : "เปลี่ยนสถานะไม่ได้"); void refresh(); }
    finally { setBusy(false); }
  }

  const receiverLink = auth?.receiverToken ? `${origin}/robots/requests/receive#room=${encodeURIComponent(auth.roomId)}&key=${auth.receiverToken}` : "";
  return <div className="interaction-lab request-app" lang="th">
    <Link href="/robots" className="lab-back">← กลับไปค้นหาหุ่นยนต์</Link>
    <p className="careloop-eyebrow">CareLoop · {mode === "sender" ? "ฝั่งผู้ส่ง" : "ฝั่งผู้รับ"}</p>
    <h1>{mode === "sender" ? "ส่งคำขอให้คนรับได้จริง" : "รับและตอบรับคำขอ"}</h1>
    <p className="lab-intro">{mode === "sender" ? "พูด พิมพ์ หรือเลือกข้อความ แล้วตรวจคำขอก่อนส่ง ผู้รับตอบรับจากอีกหน้าหนึ่ง และคุณติดตามสถานะได้ที่นี่" : "เปิดหน้านี้ไว้เพื่อดูคำขอจากผู้ส่ง กดตอบรับเมื่อคุณพร้อมช่วย และแจ้งเมื่อดำเนินการแล้ว"}</p>
    <p className="notice">คำขอส่งผ่านเว็บนี้ ผู้รับต้องเปิดหน้ารับคำขอจึงจะเห็น ไม่มีการส่งโทรศัพท์ อีเมล หรือสั่งหุ่นยนต์อัตโนมัติ</p>

    {mode === "sender" && <section className="panel request-room" aria-labelledby="request-room-title">
      <h2 id="request-room-title">1 เชื่อมกับผู้รับ</h2>
      {!auth || expired ? <><p>สร้างลิงก์ส่วนตัวให้คนที่คุณต้องการส่งคำขอถึง ลิงก์มีอายุ 24 ชั่วโมง</p><button className="primary" disabled={!ready || busy} onClick={createRoom}>สร้างช่องทางกับผู้รับ</button></> : <>
        <p><CheckCircle2 size={18} aria-hidden="true" /> ช่องทางพร้อมแล้ว ให้ผู้รับเปิดลิงก์ก่อนทดลองส่ง</p>
        <div className="lab-response"><a className="request-link" href={receiverLink} target="_blank" rel="noopener noreferrer">เปิดหน้าผู้รับ</a>
          <button onClick={async () => { try { await navigator.clipboard.writeText(receiverLink); setNotice("คัดลอกลิงก์ผู้รับแล้ว ส่งให้เฉพาะคนที่คุณต้องการให้เห็นคำขอ"); } catch { setNotice("คัดลอกไม่ได้ ใช้ลิงก์เปิดหน้าผู้รับ หรือคัดลอกจากช่องลิงก์ด้านล่าง"); } }}>คัดลอกลิงก์ผู้รับ</button></div>
        <button className="danger" disabled={busy} onClick={deleteRoom}>ลบช่องทางและข้อมูลคำขอ</button>
        <details><summary>แสดงลิงก์ส่วนตัวเพื่อคัดลอกเอง</summary><input aria-label="ลิงก์ส่วนตัวผู้รับ" readOnly value={receiverLink} /></details>
        <p className="lab-privacy">ผู้ที่มีลิงก์นี้อ่านและตอบรับคำขอในช่องทางนี้ได้ ไม่ใส่ลิงก์ลงในเอกสารสาธารณะ {auth.expiresAt ? `หมดอายุ ${time(auth.expiresAt)}` : ""}</p>
        {origin.includes("127.0.0.1") || origin.includes("localhost") ? <p className="lab-privacy">ตอนนี้เว็บเปิดเฉพาะเครื่องนี้ ลิงก์นี้ใช้ลองสองหน้าบนเครื่องเดียวกัน การใช้ต่างเครื่องต้องเปิดผ่านเซิร์ฟเวอร์ที่ทั้งสองฝ่ายเข้าถึงได้</p> : null}
      </>}
    </section>}

    {mode === "receiver" && ready && !auth && <section className="panel"><h2>เปิดจากลิงก์ของผู้ส่ง</h2><p>ขอให้ผู้ส่งกด “คัดลอกลิงก์ผู้รับ” แล้วเปิดลิงก์นั้นในหน้านี้ คุณจะเห็นเฉพาะคำขอในช่องทางที่ได้รับสิทธิ์</p></section>}

    {mode === "sender" && <section className="panel request-compose" aria-labelledby="request-compose-title">
      <h2 id="request-compose-title">2 เขียนสิ่งที่ต้องการ</h2>
      <fieldset disabled={!!review || busy}>
        <legend>เลือกข้อความ หรือพิมพ์เองได้ทุกเรื่อง</legend>
        <div className="lab-response">{presets.map(preset => <button key={preset.message} onClick={() => { setMessage(preset.message); setCategory(preset.category); setChannel("preset"); }}>{preset.message}</button>)}</div>
        <label className="lab-label" htmlFor="request-category">ประเภทคำขอ</label>
        <select id="request-category" value={category} onChange={e => setCategory(e.target.value as Category)}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="lab-label" htmlFor="request-message">ข้อความถึงผู้รับ</label>
        <textarea id="request-message" maxLength={500} rows={4} value={message} onChange={e => { setMessage(e.target.value); setChannel("text"); }} placeholder="บอกสิ่งที่อยากให้ช่วยหรืออยากสื่อสาร" />
        <small>{message.length}/500 ตัวอักษร</small>
        <label className="lab-label" htmlFor="request-place">จุดที่ให้มาพบหรือบริบทเพิ่มเติม (ไม่บังคับ)</label>
        <input id="request-place" maxLength={100} value={place} onChange={e => setPlace(e.target.value)} placeholder="เช่น โต๊ะกิจกรรม หรือหน้าห้อง" />
      </fieldset>
      <SpeechInput disabled={!!review || busy} onTranscript={text => { setMessage(previous => `${previous}${previous ? " " : ""}${text}`); setChannel("voice"); }} />
      {!review && <button className="primary lab-start" disabled={busy || !message.trim()} onClick={reviewDraft}>ตรวจคำขอก่อนส่ง</button>}
      {review && <section className="request-review" aria-labelledby="request-review-title"><h3 id="request-review-title">ตรวจคำขอนี้ก่อนส่ง</h3><p><strong>{categories[review.category]}</strong></p><p className="request-message">{review.message}</p>{review.place && <p>จุดนัดหมาย: {review.place}</p>}<p>ข้อความนี้จะถูกเก็บบนเซิร์ฟเวอร์ และผู้ที่มีลิงก์ผู้รับของคุณจะอ่านได้</p><div className="lab-response"><button className="primary" disabled={busy || !auth || expired} onClick={send}><Send size={18} aria-hidden="true" /> ยืนยันส่งคำขอ</button><button disabled={busy} onClick={() => setReview(null)}>กลับไปแก้ไข</button></div>{!auth && <p className="notice">สร้างช่องทางกับผู้รับด้านบนก่อนส่ง</p>}</section>}
    </section>}

    {notice && <p className="notice" role="status">{notice}</p>}
    {auth && <section className="panel request-list" aria-labelledby="request-list-title">
      <div className="request-list-header"><h2 id="request-list-title"><Bell size={22} aria-hidden="true" /> {mode === "sender" ? "คำขอที่ส่งและสถานะจริง" : "คำขอที่ได้รับ"}</h2><button onClick={() => void refresh()} disabled={busy}>ตรวจสถานะตอนนี้</button></div>
      {connectionError && <p role="alert" className="notice">{connectionError} ข้อมูลด้านล่างอาจยังไม่อัปเดต</p>}
      {lastRead && <p className="lab-privacy">ตรวจข้อมูลล่าสุด {time(lastRead)} · หน้านี้ตรวจสถานะซ้ำอัตโนมัติ</p>}
      {!items.length && <p className="muted">{mode === "sender" ? "ยังไม่มีคำขอที่ส่ง" : "ยังไม่มีคำขอ เปิดหน้านี้รอผู้ส่งได้"}</p>}
      {items.map(item => <article key={item.id} className={`request-card request-${item.status.toLowerCase()}`}>
        <p className="badge" role="status">{statuses[item.status]}</p><p className="request-message">{item.message}</p>
        <p>{categories[item.category]}{item.place ? ` · ${item.place}` : ""}</p>
        <p className="lab-privacy">ส่งเมื่อ {time(item.createdAt)} · อัปเดต {time(item.updatedAt)}</p>
        <div className="lab-response">
          {mode === "receiver" && item.status === "PENDING" && <><button className="primary" disabled={busy || expired} onClick={() => change(item, "accept")}>รับคำขอ</button><button disabled={busy || expired} onClick={() => change(item, "decline")}>ไม่สะดวกช่วย</button></>}
          {mode === "receiver" && item.status === "ACCEPTED" && <button className="primary" disabled={busy || expired} onClick={() => change(item, "complete")}>แจ้งว่าดำเนินการแล้ว</button>}
          {mode === "sender" && (item.status === "PENDING" || item.status === "ACCEPTED") && <button disabled={busy || expired} onClick={() => change(item, "cancel")}><XCircle size={18} aria-hidden="true" /> ยกเลิกคำขอนี้</button>}
        </div>
        <details><summary>ประวัติการส่งและตอบรับ</summary><ol>{item.events.map((event, index) => <li key={index}>{time(event.createdAt)} · {event.actor === "sender" ? "ผู้ส่ง" : "ผู้รับ"} {actions[event.action] ?? event.action}</li>)}</ol></details>
      </article>)}
      <p className="lab-privacy">สถานะเกิดจากผู้ส่งหรือผู้รับกดรายงานผ่านเว็บ ไม่ใช่เซนเซอร์ยืนยันการทำงานของหุ่นยนต์</p>
    </section>}
    <p className="lab-privacy"><Link href="/robots/lab">พื้นที่ศึกษารูปแบบปฏิสัมพันธ์เดิม</Link> · ระบบค้นหาและข้อมูลหุ่นยนต์เดิมยังใช้งานได้</p>
  </div>;
}
