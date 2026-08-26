import { describe, expect, it } from "vitest";

import { buildAudioMixGraph } from "../lib/audio-mix-graph";
import type { SubtitleCue } from "../lib/subtitles";

const cues: SubtitleCue[] = [
  {
    id: "cue-1",
    index: 1,
    startMs: 250,
    endMs: 1_500,
    text: "Xin chào",
    audioUri: "file:///tmp/cue-1.wav",
    estimatedDurationMs: 1_000,
    audioDurationMs: 1_000,
    effectiveSpeed: 1,
    status: "rendered",
  },
  {
    id: "cue-2",
    index: 2,
    startMs: 2_000,
    endMs: 3_000,
    text: "Tạm biệt",
    audioUri: "file:///tmp/cue-2.wav",
    estimatedDurationMs: 900,
    audioDurationMs: 900,
    effectiveSpeed: 1,
    status: "rendered",
  },
];

describe("buildAudioMixGraph", () => {
  it("places every WAV at its subtitle timestamp and applies project controls", () => {
    const graph = buildAudioMixGraph(cues, 0.8, 1.2);

    expect(graph.outputLabel).toBe("[aout]");
    expect(graph.filter).toContain("adelay=250|250");
    expect(graph.filter).toContain("adelay=2000|2000");
    expect(graph.filter).toContain("asetrate=sample_rate*1.2");
    expect(graph.filter).toContain("atempo=0.8333");
    expect(graph.filter).toContain("amix=inputs=2");
    expect(graph.filter).toContain("volume=0.8[aout]");
  });
});
