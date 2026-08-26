import { Platform } from "react-native";

import { buildAudioMixGraph } from "@/lib/audio-mix-graph";
import type { SubtitleCue } from "@/lib/subtitles";

export { buildAudioMixGraph } from "@/lib/audio-mix-graph";

export type ExportProgress = (progress: number) => void;

export type MediaExportResult = {
  uri: string;
  format: "wav" | "mp4";
};

function nativePath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

function getRenderableCues(cues: SubtitleCue[]): SubtitleCue[] {
  const withAudio = cues.filter((cue) => Boolean(cue.audioUri));
  if (!withAudio.length) {
    throw new Error("Chưa có WAV nào để xuất. Hãy tạo audio cho các dòng phụ đề trước.");
  }
  if (withAudio.length !== cues.length) {
    throw new Error(`Còn ${cues.length - withAudio.length} dòng chưa có audio. Hãy tạo audio đầy đủ trước khi xuất.`);
  }
  return [...withAudio].sort((a, b) => a.startMs - b.startMs);
}

async function runFfmpeg(argumentsList: string[], onProgress?: ExportProgress): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Xuất media cần FFmpeg native và chỉ chạy trong APK Android tùy chỉnh.");
  }
  const { FFmpegKit, ReturnCode } = await import("ffmpeg-kit-react-native");
  const session = await FFmpegKit.executeWithArgumentsAsync(
    argumentsList,
    undefined,
    undefined,
    (statistics) => {
      const elapsedMs = statistics.getTime();
      // Capping produces steady in-app feedback even when total video duration is unknown.
      onProgress?.(Math.min(0.95, Math.max(0.04, elapsedMs / 60_000)));
    },
  );
  const returnCode = await session.getReturnCode();
  if (!ReturnCode.isSuccess(returnCode)) {
    const output = await session.getOutput();
    throw new Error(output || "FFmpeg không thể hoàn tất xuất media.");
  }
  onProgress?.(1);
}

async function getExportDirectory(): Promise<string> {
  const nativeFs = await import("@dr.pogodin/react-native-fs");
  const dir = `${nativeFs.DocumentDirectoryPath}/exports`;
  await nativeFs.mkdir(dir);
  return dir;
}

export async function exportTimedWav(cues: SubtitleCue[], volume = 1, pitch = 1, onProgress?: ExportProgress): Promise<MediaExportResult> {
  const renderableCues = getRenderableCues(cues);
  const directory = await getExportDirectory();
  const outputPath = `${directory}/long-tieng-${Date.now()}.wav`;
  const { filter, outputLabel } = buildAudioMixGraph(renderableCues, volume, pitch);
  const args = [
    "-y",
    ...renderableCues.flatMap((cue) => ["-i", nativePath(cue.audioUri!)]),
    "-filter_complex",
    filter,
    "-map",
    outputLabel,
    "-c:a",
    "pcm_s16le",
    outputPath,
  ];
  await runFfmpeg(args, onProgress);
  return { uri: `file://${outputPath}`, format: "wav" };
}

export async function exportVideoWithVoiceover(
  videoUri: string,
  cues: SubtitleCue[],
  volume = 1,
  pitch = 1,
  onProgress?: ExportProgress,
): Promise<MediaExportResult> {
  const renderableCues = getRenderableCues(cues);
  const directory = await getExportDirectory();
  const outputPath = `${directory}/long-tieng-${Date.now()}.mp4`;
  const { filter, outputLabel } = buildAudioMixGraph(renderableCues, volume, pitch);
  const args = [
    "-y",
    "-i",
    nativePath(videoUri),
    ...renderableCues.flatMap((cue) => ["-i", nativePath(cue.audioUri!)]),
    "-filter_complex",
    filter,
    "-map",
    "0:v:0",
    "-map",
    outputLabel,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    outputPath,
  ];
  await runFfmpeg(args, onProgress);
  return { uri: `file://${outputPath}`, format: "mp4" };
}
