export interface SpeechRecognitionResultEvent {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
export type SpeechRecognitionState = "idle" | "listening";

interface SpeechRecognitionCallbacks {
  onTranscript: (transcript: string) => void;
  onError: (error: string) => void;
  onState?: (state: SpeechRecognitionState) => void;
}

export function createSpeechRecognitionController(
  Recognition: SpeechRecognitionConstructor | undefined,
  callbacks: SpeechRecognitionCallbacks,
) {
  let recognition: SpeechRecognitionLike | undefined;
  let disposed = false;
  let { onTranscript, onError, onState } = callbacks;

  const clearEvents = (active: SpeechRecognitionLike) => {
    active.onresult = null;
    active.onerror = null;
    active.onend = null;
  };

  return {
    start(): boolean {
      if (disposed) return false;
      if (!Recognition) {
        onError("unsupported");
        return false;
      }

      recognition?.abort();
      const active = new Recognition();
      recognition = active;
      active.lang = "th-TH";
      active.interimResults = false;
      active.continuous = false;
      active.onresult = (event) => {
        if (recognition !== active || disposed) return;
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal) {
            const transcript = result[0].transcript.trim();
            if (transcript) onTranscript(transcript);
          }
        }
      };
      active.onerror = (event) => {
        if (recognition === active && !disposed) onError(event.error);
      };
      active.onend = () => {
        if (recognition === active && !disposed) onState?.("idle");
      };
      try {
        active.start();
        onState?.("listening");
        return true;
      } catch {
        clearEvents(active);
        recognition = undefined;
        onState?.("idle");
        onError("start-failed");
        return false;
      }
    },
    stop() {
      recognition?.stop();
    },
    cancel() {
      if (!recognition) return;
      const active = recognition;
      recognition = undefined;
      clearEvents(active);
      active.abort();
      onState?.("idle");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (recognition) {
        const active = recognition;
        recognition = undefined;
        clearEvents(active);
        active.abort();
      }
      onTranscript = () => {};
      onError = () => {};
      onState = undefined;
    },
  };
}
