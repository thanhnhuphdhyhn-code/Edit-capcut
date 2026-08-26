import type { SubtitleCue } from "@/lib/subtitles";

export function buildAudioMixGraph(cues: SubtitleCue[], volume = 1, pitch = 1): { filter: string; outputLabel: string } {
  const safePitch = Math.min(1.3, Math.max(0.7, pitch));
  const tempoCompensation = (1 / safePitch).toFixed(4);
  const delayed = cues.map((cue, index) => {
    const delay = Math.max(0, Math.round(cue.startMs));
    return `[${index + 1}:a]adelay=${delay}|${delay},asetrate=sample_rate*${safePitch},aresample=44100,atempo=${tempoCompensation}[a${index}]`;
  });
  const joined = cues.map((_, index) => `[a${index}]`).join("");
  return {
    filter: `${delayed.join(";")};${joined}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,volume=${volume}[aout]`,
    outputLabel: "[aout]",
  };
}
