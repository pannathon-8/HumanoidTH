import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSpeechRecognitionController,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEvent,
} from "../lib/request-voice";

class FakeRecognition implements SpeechRecognitionLike {
  lang = "";
  interimResults = true;
  continuous = true;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
}

const eventWith = (transcript: string, isFinal: boolean): SpeechRecognitionResultEvent => ({
  results: [{ isFinal, 0: { transcript } }],
});

test("starts Thai final-only recognition and sends its trimmed transcript", () => {
  const transcripts: string[] = [];
  let recognition: FakeRecognition | undefined;
  const controller = createSpeechRecognitionController(
    class extends FakeRecognition { constructor() { super(); recognition = this; } },
    { onTranscript: (value) => transcripts.push(value), onError: () => {} },
  );

  controller.start();
  assert.equal(recognition?.lang, "th-TH");
  assert.equal(recognition?.interimResults, false);
  assert.equal(recognition?.continuous, false);
  recognition?.onresult?.(eventWith("  ช่วยหยิบของ  ", false));
  assert.deepEqual(transcripts, []);
  recognition?.onresult?.(eventWith("  ช่วยหยิบของ  ", true));
  assert.deepEqual(transcripts, ["ช่วยหยิบของ"]);
});

test("reports recognition errors and aborts when disposed", () => {
  const errors: string[] = [];
  let recognition: FakeRecognition | undefined;
  const controller = createSpeechRecognitionController(
    class extends FakeRecognition { constructor() { super(); recognition = this; } },
    { onTranscript: () => {}, onError: (error) => errors.push(error) },
  );
  controller.start();
  recognition?.onerror?.({ error: "not-allowed" });
  assert.deepEqual(errors, ["not-allowed"]);
  controller.dispose();
  assert.equal(recognition?.aborted, true);
  recognition?.onresult?.(eventWith("ไม่ควรเพิ่ม", true));
});

test("reports unsupported browsers without creating a recognizer", () => {
  const errors: string[] = [];
  const controller = createSpeechRecognitionController(undefined, {
    onTranscript: () => {},
    onError: (error) => errors.push(error),
  });
  assert.equal(controller.start(), false);
  assert.deepEqual(errors, ["unsupported"]);
});
test("cancel aborts active recognition and ignores late results while remaining reusable", () => {
  const transcripts: string[] = [];
  let recognition: FakeRecognition | undefined;
  const controller = createSpeechRecognitionController(
    class extends FakeRecognition { constructor() { super(); recognition = this; } },
    { onTranscript: (value) => transcripts.push(value), onError: () => {} },
  );
  controller.start();
  const lateResult = recognition?.onresult;
  controller.cancel();
  assert.equal(recognition?.aborted, true);
  lateResult?.(eventWith("สายเกินไป", true));
  assert.deepEqual(transcripts, []);
  assert.equal(controller.start(), true);
});
