import { Platform } from "react-native";

import type { VoiceSettings } from "@/lib/local-project";

export type PiperRuntimeState = "preview" | "model-missing" | "model-selected";

export type PiperSynthesisResult = {
  audioUri: string;
  durationMs: number;
  sampleRate: number;
};

export type PiperModelRequirement = {
  modelFile: string;
  tokensFile: string;
  espeakDataDirectory: string;
};

export const PIPER_MODEL_REQUIREMENTS: PiperModelRequirement = {
  modelFile: "voice.onnx",
  tokensFile: "tokens.txt",
  espeakDataDirectory: "espeak-ng-data",
};

export function getPiperRuntimeState(settings: VoiceSettings): PiperRuntimeState {
  if (Platform.OS === "web") return "preview";
  return settings.modelDirectory ? "model-selected" : "model-missing";
}

export function piperRuntimeMessage(state: PiperRuntimeState): string {
  if (state === "model-selected") return "Đã chọn thư mục model. APK sẽ kiểm tra model VITS/Piper khi tạo audio.";
  if (state === "model-missing") return "Runtime đã sẵn sàng, nhưng chưa có model giọng được cấp phép.";
  return "Bản xem trước trên web không chạy native runtime Piper. Hãy dùng APK Android tùy chỉnh để tạo audio offline.";
}

export async function synthesizePiperText(
  text: string,
  settings: VoiceSettings,
  outputFileStem: string,
): Promise<PiperSynthesisResult> {
  if (Platform.OS === "web") {
    throw new Error("Piper offline chỉ chạy trong APK Android tùy chỉnh, không chạy trong bản xem trước web.");
  }
  if (!settings.modelDirectory) {
    throw new Error("Chưa có thư mục model Piper. Model cần có voice.onnx, tokens.txt và espeak-ng-data.");
  }

  const [{ createTTS, saveAudioToFile }, { fileModelPath }, nativeFsModule] = await Promise.all([
    import("react-native-sherpa-onnx/tts"),
    import("react-native-sherpa-onnx"),
    import("@dr.pogodin/react-native-fs"),
  ]);
  const nativeFs = nativeFsModule;
  const outputDirectory = `${nativeFs.DocumentDirectoryPath}/piper-audio`;
  await nativeFs.mkdir(outputDirectory);

  const outputPath = `${outputDirectory}/${outputFileStem}.wav`;
  const tts = await createTTS({
    modelPath: fileModelPath(settings.modelDirectory),
    modelType: "vits",
    numThreads: 2,
    modelOptions: {
      vits: {
        // Piper/VITS exposes length scale rather than a direct pitch control.
        // Pitch remains project metadata until a dedicated DSP export step is enabled.
        lengthScale: 1 / Math.max(settings.speed, 0.5),
      },
    },
  });

  try {
    const audio = await tts.generateSpeech(text, { speed: settings.speed });
    await saveAudioToFile(audio, outputPath);
    return {
      audioUri: outputPath.startsWith("file://") ? outputPath : `file://${outputPath}`,
      durationMs: Math.round((audio.samples.length / audio.sampleRate) * 1_000),
      sampleRate: audio.sampleRate,
    };
  } finally {
    await tts.destroy();
  }
}
