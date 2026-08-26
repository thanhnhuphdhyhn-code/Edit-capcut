import { describe, expect, it } from "vitest";

import { fitCueToTiming, parsePlainText, parseSrt } from "../lib/subtitles";

describe("parseSrt", () => {
  it("parses standard SRT cues and timestamps", () => {
    const result = parseSrt(`1\n00:00:01,000 --> 00:00:03,500\nXin chào Việt Nam`);
    expect(result.errors).toEqual([]);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]).toMatchObject({ startMs: 1000, endMs: 3500, text: "Xin chào Việt Nam" });
  });

  it("reports a malformed block", () => {
    const result = parseSrt("Không có mốc thời gian");
    expect(result.cues).toHaveLength(0);
    expect(result.errors[0]).toContain("không tìm thấy");
  });
});

describe("timing fit", () => {
  it("raises speed but respects the configured cap", () => {
    const cue = parsePlainText("Một câu dài để kiểm tra giới hạn tốc độ", 1000).cues[0];
    const fitted = fitCueToTiming(cue, { enabled: true, baseSpeed: 0.8, maxSpeed: 1.4 });
    expect(fitted.effectiveSpeed).toBe(1.4);
    expect(fitted.status).toBe("needs-review");
  });
});
