import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SubtitleCue } from "@/lib/subtitles";

export type VoiceSettings = {
  engine: "piper";
  locale: "vi-VN";
  voiceId: string;
  voiceLabel: string;
  modelDirectory: string | null;
  speed: number;
  pitch: number;
  ttsVolume: number;
  autoFitEnabled: boolean;
  maxAutoSpeed: number;
};

export type LocalProject = {
  title: string;
  sourceFileName: string | null;
  videoFileName: string | null;
  sourceVideoUri: string | null;
  cues: SubtitleCue[];
  voice: VoiceSettings;
  updatedAt: string;
};

export const DEFAULT_VOICE: VoiceSettings = {
  engine: "piper",
  locale: "vi-VN",
  voiceId: "lao-kim-nam-tu-tin",
  voiceLabel: "Lão Kim (Nam Tự Tin)",
  modelDirectory: null,
  speed: 0.8,
  pitch: 1,
  ttsVolume: 1,
  autoFitEnabled: true,
  maxAutoSpeed: 1.6,
};

const PROJECT_KEY = "piper_tts_viet_editor.current_project.v1";

export async function loadLocalProject(): Promise<LocalProject | null> {
  const raw = await AsyncStorage.getItem(PROJECT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalProject;
  } catch {
    return null;
  }
}

export async function saveLocalProject(project: LocalProject): Promise<void> {
  await AsyncStorage.setItem(PROJECT_KEY, JSON.stringify(project));
}
