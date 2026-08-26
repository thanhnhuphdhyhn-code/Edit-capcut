export type CueStatus = "pending" | "analyzed" | "fitted" | "needs-review" | "rendered";

export type SubtitleCue = {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  audioUri: string | null;
  estimatedDurationMs: number | null;
  audioDurationMs: number | null;
  effectiveSpeed: number;
  status: CueStatus;
};

export type ParseResult = {
  cues: SubtitleCue[];
  errors: string[];
};

export type AutoFitOptions = {
  enabled: boolean;
  baseSpeed: number;
  maxSpeed: number;
};

const TIMECODE = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s+-->\s+(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function asMilliseconds(hours: string, minutes: string, seconds: string, milliseconds: string) {
  const normalizedMilliseconds = milliseconds.padEnd(3, "0").slice(0, 3);
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000 +
    Number(normalizedMilliseconds)
  );
}

export function parseSrt(source: string): ParseResult {
  const blocks = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean);

  const cues: SubtitleCue[] = [];
  const errors: string[] = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timeLineIndex = lines.findIndex((line) => TIMECODE.test(line.trim()));
    if (timeLineIndex === -1) {
      errors.push(`Khối ${blockIndex + 1}: không tìm thấy mốc thời gian SRT hợp lệ.`);
      return;
    }

    const match = lines[timeLineIndex].trim().match(TIMECODE);
    if (!match) {
      errors.push(`Khối ${blockIndex + 1}: mốc thời gian không hợp lệ.`);
      return;
    }

    const startMs = asMilliseconds(match[1], match[2], match[3], match[4]);
    const endMs = asMilliseconds(match[5], match[6], match[7], match[8]);
    const text = lines.slice(timeLineIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();

    if (!text) {
      errors.push(`Khối ${blockIndex + 1}: chưa có nội dung đọc.`);
      return;
    }
    if (endMs <= startMs) {
      errors.push(`Khối ${blockIndex + 1}: thời điểm kết thúc phải sau thời điểm bắt đầu.`);
      return;
    }

    cues.push({
      id: `cue-${startMs}-${endMs}-${blockIndex}`,
      index: cues.length + 1,
      startMs,
      endMs,
      text,
      audioUri: null,
      estimatedDurationMs: null,
      audioDurationMs: null,
      effectiveSpeed: 1,
      status: "pending",
    });
  });

  return { cues, errors };
}

export function parsePlainText(source: string, cueDurationMs = 4_000): ParseResult {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    cues: lines.map((text, index) => ({
      id: `text-${index}-${text.length}`,
      index: index + 1,
      startMs: index * cueDurationMs,
      endMs: (index + 1) * cueDurationMs,
      text,
      audioUri: null,
      estimatedDurationMs: null,
      audioDurationMs: null,
      effectiveSpeed: 1,
      status: "pending",
    })),
    errors: [],
  };
}

export function estimateSpeechDurationMs(text: string, speed = 1): number {
  const meaningfulText = text.trim();
  if (!meaningfulText) return 0;
  const words = meaningfulText.split(/\s+/).filter(Boolean).length;
  const punctuationPauses = (meaningfulText.match(/[,.!?;:]/g) ?? []).length * 130;
  const baseDuration = 260 + words * 345 + punctuationPauses;
  return Math.round(baseDuration / Math.max(speed, 0.5));
}

export function fitCueToTiming(cue: SubtitleCue, options: AutoFitOptions): SubtitleCue {
  const targetMs = Math.max(cue.endMs - cue.startMs, 1);
  const baseDuration = estimateSpeechDurationMs(cue.text, 1);
  const requiredSpeed = Math.max(options.baseSpeed, Number((baseDuration / targetMs).toFixed(2)));
  const desiredSpeed = options.enabled ? requiredSpeed : options.baseSpeed;
  const effectiveSpeed = Number(Math.min(desiredSpeed, options.maxSpeed).toFixed(2));
  const estimatedDurationMs = estimateSpeechDurationMs(cue.text, effectiveSpeed);
  const needsReview = estimatedDurationMs > targetMs + 120;
  const fitted = options.enabled && effectiveSpeed > options.baseSpeed;

  return {
    ...cue,
    estimatedDurationMs,
    effectiveSpeed,
    status: needsReview ? "needs-review" : fitted ? "fitted" : "analyzed",
  };
}

export function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "—";
  return `${(milliseconds / 1_000).toFixed(1).replace(".", ",")}s`;
}

export const SAMPLE_SRT = `1
00:00:00,000 --> 00:00:03,200
Chào mừng bạn đến với dự án lồng tiếng tiếng Việt.

2
00:00:03,350 --> 00:00:07,400
Ứng dụng sẽ so khớp thời lượng giọng đọc với từng dòng phụ đề.

3
00:00:07,600 --> 00:00:10,400
Những câu quá dài sẽ được đánh dấu để bạn xem lại.`;
