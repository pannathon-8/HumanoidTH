"use client";

import { useEffect, useRef, useState } from "react";
import {
  createSpeechRecognitionController,
  type SpeechRecognitionConstructor,
  type SpeechRecognitionState,
} from "../../../lib/request-voice";

interface SpeechInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const errorMessages: Record<string, string> = {
  "not-allowed": "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน ตรวจสอบสิทธิ์ไมโครโฟนของเบราว์เซอร์แล้วลองอีกครั้ง",
  "service-not-allowed": "เบราว์เซอร์ไม่อนุญาตให้ใช้บริการรู้จำเสียง คุณยังพิมพ์หรือเลือกข้อความสำเร็จรูปได้",
  "audio-capture": "ไม่พบไมโครโฟนหรือเปิดไมโครโฟนไม่ได้ คุณยังพิมพ์หรือเลือกข้อความสำเร็จรูปได้",
  network: "บริการรู้จำเสียงเชื่อมต่อไม่ได้ โปรดลองอีกครั้งหรือพิมพ์ข้อความแทน",
  unsupported: "เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง คุณยังพิมพ์หรือเลือกข้อความสำเร็จรูปได้",
  "start-failed": "เริ่มรับเสียงไม่สำเร็จ โปรดลองอีกครั้งหรือพิมพ์ข้อความแทน",
};

export default function SpeechInput({ onTranscript, disabled = false }: SpeechInputProps) {
  const onTranscriptRef = useRef(onTranscript);
  const disabledRef = useRef(disabled);
  const controllerRef = useRef<ReturnType<typeof createSpeechRecognitionController> | null>(null);
  const [supported, setSupported] = useState(false);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<SpeechRecognitionState>("idle");
  const [message, setMessage] = useState("");
  disabledRef.current = disabled;

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const browserWindow = window as SpeechRecognitionWindow;
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    setSupported(Boolean(Recognition));
    controllerRef.current = createSpeechRecognitionController(Recognition, {
      onTranscript: (transcript) => {
        if (!disabledRef.current) onTranscriptRef.current(transcript);
      },
      onError: (error) => setMessage(errorMessages[error] ?? "รับรู้เสียงไม่สำเร็จ โปรดลองอีกครั้งหรือพิมพ์ข้อความแทน"),
      onState: (nextState) => setState(nextState),
    });

    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (disabled) controllerRef.current?.cancel();
  }, [disabled]);

  const start = () => {
    setMessage("");
    controllerRef.current?.start();
  };

  const stop = () => controllerRef.current?.stop();

  return (
    <section aria-label="ป้อนคำขอด้วยเสียง" className="request-speech-input">
      <label className="request-speech-consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled || !supported}
          onChange={(event) => setConsent(event.currentTarget.checked)}
        />
        <span>
          ฉันยินยอมให้เบราว์เซอร์รับเสียงเพื่อแปลงเป็นข้อความ เสียงอาจถูกประมวลผลโดยผู้ให้บริการเบราว์เซอร์
          {" "}
          <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API" target="_blank" rel="noreferrer">
            อ่านข้อมูลการประมวลผลเสียง
          </a>
        </span>
      </label>

      {supported ? (
        state === "listening" ? (
          <button className="request-speech-button" type="button" onClick={stop} disabled={disabled}>
            หยุดรับเสียง
          </button>
        ) : (
          <button className="request-speech-button" type="button" onClick={start} disabled={!consent || disabled}>
            เริ่มพูดเป็นข้อความ
          </button>
        )
      ) : (
        <p role="status">{errorMessages.unsupported}</p>
      )}
      {message && <p role="status">{message}</p>}
      {state === "listening" && <p role="status">กำลังรับเสียงภาษาไทย…</p>}
    </section>
  );
}
