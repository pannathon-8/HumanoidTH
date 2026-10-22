import { createRoot } from "react-dom/client";
import CareLoopSearch from "../app/robots/CareLoopSearch";
import AdaptiveLab from "../app/robots/lab/AdaptiveLab";
import data from "./seed-snapshot.json";

const robots = data.robots;
const path = window.location.pathname.replace(/\/$/, "") || "/";
const lab = path === "/robots/lab";
const requests = path.startsWith("/robots/requests");

function Demo() {
  return <div className="demo-shell">
    <header className="demo-header"><div><a href="/robots" className="demo-brand">CareLoop AI</a><p>ค้นจากปัญหา · ทดลองปฏิสัมพันธ์ · เก็บผลเพื่อพัฒนาต่อ</p></div>
      <nav aria-label="เมนูหลัก"><a href="/robots" aria-current={!lab && !requests ? "page" : undefined}>ค้นหาหุ่นยนต์</a><a href="/robots/lab" aria-current={lab ? "page" : undefined}>ทดลองและปรับวิธีโต้ตอบ</a><a href="https://github.com/pannathon-8/HumanoidTH" target="_blank" rel="noreferrer">โค้ดและคู่มือ ↗</a></nav></header>
    <main>
      <section className="demo-intro"><p className="careloop-eyebrow">HRI Wellness Living Lab · Working prototype</p><h1>{requests ? "ระบบรับส่งคำขอ" : lab ? "ลองวิธีโต้ตอบที่เหมาะกับคุณ" : "เริ่มจากสิ่งที่คุณอยากให้หุ่นยนต์ช่วย"}</h1>
        <p>{lab ? "เลือกโจทย์และข้อจำกัด ทดลองหนึ่งรอบ ปรับช่องทางตอบ แล้วลองภารกิจเดิมอีกครั้ง ผลที่บันทึกช่วยให้นักพัฒนารู้ว่าควรปรับตรงไหน" : "สำรวจรุ่นจากข้อมูลที่มี อ่านเหตุผลและข้อจำกัด แล้วทดลองแนวทางปฏิสัมพันธ์บนเว็บก่อนนำไปพัฒนากับอุปกรณ์จริง"}</p>
      </section>
      <aside className="demo-disclosure">เดโมนี้ใช้ส่วนค้นหาและพื้นที่ทดลองจาก Fork HumanoidTH เดียวกัน พร้อม snapshot ข้อมูลตั้งต้น {robots.length} รุ่น การทดลองอยู่ในเบราว์เซอร์ ไม่มีการควบคุมหุ่นยนต์หรือเรียก AI สร้างสถานการณ์ และยังไม่ใช่ผลการศึกษาผู้ใช้</aside>
      {requests ? <section className="panel"><h2>โค้ดระบบคำขออยู่ใน Fork สำหรับรันพร้อมฐานข้อมูล</h2><p>เว็บเดโมสาธารณะนี้เปิดเฉพาะ Search และ Lab ระบบรับส่งข้อความระหว่างผู้ส่งกับผู้รับต้องใช้เซิร์ฟเวอร์และ PostgreSQL จึงไม่เปิดรับข้อความส่วนตัวผ่านหน้านี้</p><p><a href="https://github.com/pannathon-8/HumanoidTH/blob/main/docs/careloop/REAL_REQUESTS.md">ดูวิธีรันระบบรับส่งคำขอและข้อจำกัด</a></p><a href="/robots/lab">กลับไปทดลองปฏิสัมพันธ์ →</a></section>
        : lab ? <AdaptiveLab robots={robots} requestedId={new URLSearchParams(window.location.search).get("robot") || ""} databaseAvailable={true} />
        : <><CareLoopSearch robots={robots} sources={data.sources} available={true} evidenceUnavailable={false} /><section className="panel"><h2>รายการรุ่นในข้อมูลตั้งต้น</h2><p className="muted">แหล่งข้อมูลเดิมยังมีช่องว่าง การอยู่ในรายการไม่ใช่การรับรองความเหมาะสม ราคา ความปลอดภัย หรือผลด้านสุขภาวะ</p><div className="cards">{robots.map(robot => <article className="card" id={`robot-${robot.id}`} key={robot.id}><h3>{robot.canonicalName}</h3><p>{robot.description}</p><p className="badge">{robot.robotType}</p>{robot.officialUrl && <p><a href={robot.officialUrl} target="_blank" rel="noreferrer">แหล่งข้อมูลต้นทาง ↗</a></p>}</article>)}</div></section></>}
    </main>
    <footer className="demo-footer"><p>Search ใช้การจับคู่คำและหมวดความต้องการ ส่วน Lab ใช้แม่แบบที่ตรวจสอบได้ เส้นทางเสียงระบุเป็นการจำลองอย่างชัดเจน ผลทดลองเก็บเฉพาะเมื่อเลือกบันทึก และลบหรือส่งออกได้ในเครื่องนี้</p><a href="https://github.com/pannathon-8/HumanoidTH/blob/main/docs/careloop/README.md">คู่มือและขอบเขตการทำงาน</a></footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
