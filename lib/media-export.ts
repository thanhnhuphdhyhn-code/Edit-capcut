import type { SubtitleCue } from "@/lib/subtitles";

export { buildAudioMixGraph } from "@/lib/audio-mix-graph";

export type ExportProgress = (progress: number) => void;

export type MediaExportResult = {
  uri: string;
  format: "wav" | "mp4";
};

function validateRenderableCues(cues: SubtitleCue[]): void {
  if (!cues.length || !cues.some((cue) => cue.audioUri)) {
    throw new Error("Chưa có WAV nào để xuất. Hãy tạo audio cho các dòng phụ đề trước.");
  }
  if (cues.some((cue) => !cue.audioUri)) {
    throw new Error("Hãy tạo WAV cho tất cả dòng phụ đề trước khi xuất.");
  }
}

function exporterUnavailable(): never {
  throw new Error(
    "Bản APK ổn định này tạm thời chưa ghép được các WAV thành một tệp xuất. FFmpegKit cũ đã bị gỡ vì làm Gradle build lỗi. Các WAV Piper theo từng dòng vẫn được tạo và nghe thử cục bộ.",
  );
}

export async function exportTimedWav(cues: SubtitleCue[], _volume = 1, _pitch = 1, _onProgress?: ExportProgress): Promise<MediaExportResult> {
  validateRenderableCues(cues);
  return exporterUnavailable();
}

export async function exportVideoWithVoiceover(_videoUri: string, cues: SubtitleCue[], _volume = 1, _pitch = 1, _onProgress?: ExportProgress): Promise<MediaExportResult> {
  validateRenderableCues(cues);
  return exporterUnavailable();
}
