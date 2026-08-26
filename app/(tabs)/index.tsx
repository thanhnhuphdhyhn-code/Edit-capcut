import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { DEFAULT_VOICE, loadLocalProject, saveLocalProject, type VoiceSettings } from "@/lib/local-project";
import { exportTimedWav, exportVideoWithVoiceover } from "@/lib/media-export";
import { getPiperRuntimeState, piperRuntimeMessage, synthesizePiperText } from "@/lib/piper-runtime";
import {
  fitCueToTiming,
  formatDuration,
  formatTimestamp,
  parsePlainText,
  parseSrt,
  SAMPLE_SRT,
  type SubtitleCue,
} from "@/lib/subtitles";

type ViewMode = "editor" | "timeline";

const COLORS = {
  bg: "#101315",
  surface: "#1B2024",
  elevated: "#252B30",
  border: "#3A4249",
  text: "#F4F7F9",
  muted: "#9BA6AE",
  blue: "#2EA7FF",
  green: "#3DDC97",
  orange: "#FFB547",
  red: "#FF6B6B",
};

function Icon({ name, size = 22, color = COLORS.text }: { name: React.ComponentProps<typeof MaterialIcons>["name"]; size?: number; color?: string }) {
  return <MaterialIcons name={name} size={size} color={color} />;
}

function scaleControl(value: number, minimum: number, maximum: number, step: number, direction: -1 | 1) {
  return Math.min(maximum, Math.max(minimum, Number((value + direction * step).toFixed(1))));
}

export default function HomeScreen() {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [voice, setVoice] = useState<VoiceSettings>(DEFAULT_VOICE);
  const [projectTitle, setProjectTitle] = useState("Dự án chưa đặt tên");
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [renderingCueIds, setRenderingCueIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const previewPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const cancelBatchRenderRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const runtimeState = getPiperRuntimeState(voice);
  const statusCounts = useMemo(
    () => ({
      ready: cues.filter((cue) => cue.status === "analyzed" || cue.status === "fitted").length,
      review: cues.filter((cue) => cue.status === "needs-review").length,
    }),
    [cues],
  );

  useEffect(() => {
    loadLocalProject()
      .then((project) => {
        if (project) {
          setProjectTitle(project.title);
          setSourceFileName(project.sourceFileName);
          setVideoFileName(project.videoFileName);
          setVideoUri(project.sourceVideoUri ?? null);
          setCues(project.cues);
          setVoice({ ...DEFAULT_VOICE, ...project.voice });
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    return () => previewPlayerRef.current?.remove();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    void saveLocalProject({
      title: projectTitle,
      sourceFileName,
      videoFileName,
      sourceVideoUri: videoUri,
      cues,
      voice,
      updatedAt: new Date().toISOString(),
    });
  }, [cues, isLoaded, projectTitle, sourceFileName, videoFileName, videoUri, voice]);

  const importSubtitleFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "application/x-subrip", "text/srt", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const content = await new File(asset.uri).text();
      const parsed = asset.name.toLowerCase().endsWith(".srt") ? parseSrt(content) : parsePlainText(content);
      if (parsed.cues.length === 0) {
        Alert.alert("Không thể nhập phụ đề", parsed.errors.join("\n") || "Tệp không có dòng phụ đề hợp lệ.");
        return;
      }
      setCues(parsed.cues);
      setSourceFileName(asset.name);
      setProjectTitle(asset.name.replace(/\.(srt|txt)$/i, ""));
      setSelectedCueId(null);
      if (parsed.errors.length > 0) {
        Alert.alert("Đã nhập một phần", `${parsed.cues.length} dòng hợp lệ.\n${parsed.errors.join("\n")}`);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Không thể đọc tệp", "Hãy thử lại với tệp .srt hoặc .txt mã hóa UTF-8.");
    }
  };

  const importVideo = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: true });
    if (!result.canceled) {
      setVideoFileName(result.assets[0].name);
      setVideoUri(result.assets[0].uri);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const installPiperModel = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Cài model trên APK", "Tính năng giải nén model Piper dùng native Android. Hãy cài thử trong APK tùy chỉnh, không phải bản xem trước web.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/x-bzip2", "application/zstd", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const lowerName = asset.name.toLowerCase();
      const format = lowerName.endsWith(".tar.zst") ? "tar.zst" : lowerName.endsWith(".tar.bz2") ? "tar.bz2" : null;
      if (!format) {
        Alert.alert("Gói model không hợp lệ", "Hãy chọn gói model Piper dạng .tar.zst hoặc .tar.bz2 có model ONNX, tokens.txt và espeak-ng-data.");
        return;
      }
      const [nativeFs, { extractArchive }] = await Promise.all([
        import("@dr.pogodin/react-native-fs"),
        import("react-native-sherpa-onnx/extraction"),
      ]);
      const modelRoot = `${nativeFs.DocumentDirectoryPath}/piper-models`;
      await nativeFs.mkdir(modelRoot);
      const extracted = await extractArchive(
        {
          modelId: lowerName.replace(/\.tar\.(zst|bz2)$/i, ""),
          archivePath: asset.uri.replace(/^file:\/\//, ""),
          format,
          fileSize: asset.size ?? 0,
        },
        modelRoot,
        { showNotificationsEnabled: false, notificationTitle: "Đang cài model Piper" },
      );
      if (!extracted.success || !extracted.path) {
        throw new Error(extracted.reason ?? "Không thể giải nén model.");
      }
      updateVoice({ modelDirectory: extracted.path });
      Alert.alert("Đã cài model", "Model đã được lưu trên thiết bị. Bạn có thể nghe thử hoặc tạo WAV cho từng dòng phụ đề.");
    } catch (error) {
      Alert.alert("Không thể cài model", error instanceof Error ? error.message : "Đã xảy ra lỗi khi giải nén model Piper.");
    }
  };

  const useSample = () => {
    const parsed = parseSrt(SAMPLE_SRT);
    setCues(parsed.cues);
    setSourceFileName("phu-de-mau.srt");
    setProjectTitle("Lồng tiếng giới thiệu");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const analyzeTiming = () => {
    if (!cues.length) {
      Alert.alert("Chưa có phụ đề", "Hãy nhập một tệp SRT/TXT hoặc dùng SRT mẫu trước.");
      return;
    }
    setIsAnalyzing(true);
    setTimeout(() => {
      setCues((current) =>
        current.map((cue) =>
          fitCueToTiming(cue, {
            enabled: voice.autoFitEnabled,
            baseSpeed: voice.speed,
            maxSpeed: voice.maxAutoSpeed,
          }),
        ),
      );
      setIsAnalyzing(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 220);
  };

  const playGeneratedAudio = async (audioUri: string) => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      previewPlayerRef.current?.remove();
      const player = createAudioPlayer({ uri: audioUri });
      previewPlayerRef.current = player;
      player.play();
    } catch (error) {
      Alert.alert("Không thể phát audio", error instanceof Error ? error.message : "Không thể phát WAV vừa tạo.");
    }
  };

  const renderCue = async (cue: SubtitleCue, playAfterRender = false): Promise<string | null> => {
    if (runtimeState !== "model-selected") {
      Alert.alert("Chưa có model giọng", piperRuntimeMessage(runtimeState));
      return null;
    }
    setRenderingCueIds((current) => [...current, cue.id]);
    try {
      const result = await synthesizePiperText(cue.text, voice, `cue-${cue.index}-${Date.now()}`);
      setCues((current) => current.map((item) => item.id === cue.id ? { ...item, audioUri: result.audioUri, audioDurationMs: result.durationMs, estimatedDurationMs: result.durationMs, status: "rendered" } : item));
      if (playAfterRender) await playGeneratedAudio(result.audioUri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return result.audioUri;
    } catch (error) {
      Alert.alert("Không thể tạo audio", error instanceof Error ? error.message : "Không thể khởi tạo Piper TTS.");
      return null;
    } finally {
      setRenderingCueIds((current) => current.filter((id) => id !== cue.id));
    }
  };

  const renderAll = async () => {
    if (!cues.length) {
      Alert.alert("Chưa có phụ đề", "Hãy nhập SRT/TXT trước khi tạo audio.");
      return;
    }
    if (runtimeState !== "model-selected") {
      Alert.alert("Chưa có model giọng", piperRuntimeMessage(runtimeState));
      return;
    }
    cancelBatchRenderRef.current = false;
    setBatchProgress({ done: 0, total: cues.length });
    try {
      for (let index = 0; index < cues.length; index += 1) {
        if (cancelBatchRenderRef.current) break;
        await renderCue(cues[index]);
        setBatchProgress({ done: index + 1, total: cues.length });
      }
      if (cancelBatchRenderRef.current) {
        Alert.alert("Đã dừng hàng đợi", "Audio đang tạo dở đã được hoàn tất, các dòng còn lại giữ nguyên.");
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setBatchProgress(null);
    }
  };

  const cancelBatchRender = () => {
    cancelBatchRenderRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const exportProject = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress(0.04);
    try {
      const exportResult = videoUri
        ? await exportVideoWithVoiceover(videoUri, cues, voice.ttsVolume, voice.pitch, setExportProgress)
        : await exportTimedWav(cues, voice.ttsVolume, voice.pitch, setExportProgress);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exportResult.uri, {
          mimeType: exportResult.format === "mp4" ? "video/mp4" : "audio/wav",
          dialogTitle: exportResult.format === "mp4" ? "Chia sẻ video đã lồng tiếng" : "Chia sẻ audio đã lồng tiếng",
        });
      } else {
        Alert.alert("Đã xuất tệp", exportResult.uri);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Không thể xuất", error instanceof Error ? error.message : "Xuất media không thành công.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const updateCueText = (id: string, text: string) => {
    setCues((current) => current.map((cue) => (cue.id === id ? { ...cue, text, status: "pending", estimatedDurationMs: null } : cue)));
  };

  const shiftCueTiming = (id: string, deltaMs: number) => {
    setCues((current) => current.map((cue) => {
      if (cue.id !== id) return cue;
      const duration = cue.endMs - cue.startMs;
      const nextStart = Math.max(0, cue.startMs + deltaMs);
      return { ...cue, startMs: nextStart, endMs: nextStart + duration };
    }));
  };

  const updateVoice = (patch: Partial<VoiceSettings>) => setVoice((current) => ({ ...current, ...patch }));

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>PIPER TTS VIET EDITOR</Text>
            <Text style={styles.title} numberOfLines={1}>{projectTitle}</Text>
            <Text style={styles.subtitle}>{sourceFileName ? `${cues.length} dòng phụ đề · tự lưu cục bộ` : "Nhập SRT để bắt đầu lồng tiếng"}</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} onPress={() => Alert.alert("Dự án", "Dữ liệu dự án hiện được lưu cục bộ trên thiết bị.")}>
            <Icon name="more-horiz" />
          </Pressable>
        </View>

        <View style={styles.segmentedControl}>
          <Pressable style={[styles.segment, viewMode === "editor" && styles.segmentActive]} onPress={() => setViewMode("editor")}>
            <Icon name="subtitles" size={18} color={viewMode === "editor" ? COLORS.text : COLORS.muted} />
            <Text style={[styles.segmentText, viewMode === "editor" && styles.segmentTextActive]}>Phụ đề</Text>
          </Pressable>
          <Pressable style={[styles.segment, viewMode === "timeline" && styles.segmentActive]} onPress={() => setViewMode("timeline")}>
            <Icon name="timeline" size={18} color={viewMode === "timeline" ? COLORS.text : COLORS.muted} />
            <Text style={[styles.segmentText, viewMode === "timeline" && styles.segmentTextActive]}>Timeline</Text>
          </Pressable>
        </View>

        {viewMode === "editor" ? (
          <FlatList
            data={cues}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <>
                <View style={styles.actionRow}>
                  <Pressable style={({ pressed }) => [styles.importButton, pressed && styles.pressed]} onPress={importSubtitleFile}>
                    <Icon name="upload-file" size={19} color={COLORS.text} />
                    <Text style={styles.importText}>Import SRT/TXT</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.miniButton, pressed && styles.pressed]} onPress={importVideo}>
                    <Icon name="movie" size={19} color={videoFileName ? COLORS.green : COLORS.muted} />
                    <Text style={styles.miniButtonText}>{videoFileName ? "Đã có video" : "Thêm video"}</Text>
                  </Pressable>
                </View>

                {!cues.length ? (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIcon}><Icon name="closed-caption" size={30} color={COLORS.blue} /></View>
                    <Text style={styles.emptyTitle}>Bắt đầu từ phụ đề</Text>
                    <Text style={styles.emptyText}>Chọn một tệp SRT/TXT từ thiết bị, hoặc mở SRT mẫu để thử luồng biên tập.</Text>
                    <Pressable style={({ pressed }) => [styles.sampleButton, pressed && styles.pressed]} onPress={useSample}>
                      <Text style={styles.sampleButtonText}>Dùng SRT mẫu</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View style={styles.autoFitCard}>
                      <View style={styles.autoFitIcon}><Icon name="speed" size={22} color={COLORS.blue} /></View>
                      <View style={styles.autoFitCopy}>
                        <Text style={styles.autoFitTitle}>Tự động tăng tốc khi chồng lấn</Text>
                        <Text style={styles.autoFitDescription}>Không vượt quá {voice.maxAutoSpeed.toFixed(1).replace(".", ",")}x; dòng không khớp sẽ được gắn cờ.</Text>
                      </View>
                      <Switch
                        value={voice.autoFitEnabled}
                        onValueChange={(enabled) => updateVoice({ autoFitEnabled: enabled })}
                        trackColor={{ false: COLORS.border, true: "#146DAB" }}
                        thumbColor={voice.autoFitEnabled ? COLORS.blue : "#D9DEE2"}
                      />
                    </View>
                    <View style={styles.analysisSummary}>
                      <Text style={styles.analysisText}>{statusCounts.ready} dòng có thể khớp · {statusCounts.review} cần xem lại</Text>
                      <Pressable onPress={analyzeTiming} style={({ pressed }) => [styles.analysisButton, pressed && styles.pressed]}>
                        <Icon name="auto-fix-high" size={18} color={COLORS.blue} />
                        <Text style={styles.analysisButtonText}>{isAnalyzing ? "Đang phân tích" : "Phân tích nhịp"}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            }
            renderItem={({ item }) => (
              <CueCard
                cue={item}
                isSelected={selectedCueId === item.id}
                onPress={() => setSelectedCueId((current) => (current === item.id ? null : item.id))}
                onChangeText={(text) => updateCueText(item.id, text)}
                onAnalyze={() => setCues((current) => current.map((cue) => cue.id === item.id ? fitCueToTiming(cue, { enabled: voice.autoFitEnabled, baseSpeed: voice.speed, maxSpeed: voice.maxAutoSpeed }) : cue))}
                isRendering={renderingCueIds.includes(item.id)}
                onRender={() => void renderCue(item, true)}
              />
            )}
          />
        ) : (
          <TimelineView cues={cues} sourceVideoName={videoFileName} sourceVideoUri={videoUri} onShiftCue={shiftCueTiming} onBack={() => setViewMode("editor")} />
        )}

        <View style={styles.bottomDock}>
          <Pressable style={({ pressed }) => [styles.voiceSummary, pressed && styles.pressed]} onPress={() => setVoiceSheetOpen(true)}>
            <View style={styles.voiceSummaryIcon}><Icon name="record-voice-over" size={19} color={COLORS.blue} /></View>
            <View style={styles.voiceSummaryCopy}>
              <Text style={styles.voiceSummaryLabel}>Piper TTS · Tiếng Việt</Text>
              <Text style={styles.voiceSummaryValue} numberOfLines={1}>{voice.voiceLabel}</Text>
            </View>
            <Icon name="keyboard-arrow-up" size={22} color={COLORS.muted} />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => {
            const allAudioReady = cues.length > 0 && cues.every((cue) => Boolean(cue.audioUri));
            if (batchProgress) cancelBatchRender();
            else if (allAudioReady) void exportProject();
            else void renderAll();
          }}>
            <Icon name={batchProgress ? "close" : isExporting ? "hourglass-top" : cues.length > 0 && cues.every((cue) => Boolean(cue.audioUri)) ? "ios-share" : "graphic-eq"} size={21} color="#07131C" />
            <Text style={styles.primaryButtonText}>{batchProgress ? `Dừng ${batchProgress.done}/${batchProgress.total}` : isExporting ? `Xuất ${Math.round(exportProgress * 100)}%` : cues.length > 0 && cues.every((cue) => Boolean(cue.audioUri)) ? "Xuất file" : "Tạo audio"}</Text>
          </Pressable>
        </View>
      </View>

      <VoiceSettingsModal
        visible={voiceSheetOpen}
        voice={voice}
        runtimeMessage={piperRuntimeMessage(runtimeState)}
        onClose={() => setVoiceSheetOpen(false)}
        onChange={updateVoice}
        onInstallModel={() => void installPiperModel()}
        onPreview={() => {
          const previewCue = cues[0];
          if (previewCue?.audioUri) void playGeneratedAudio(previewCue.audioUri);
          else if (previewCue) void renderCue(previewCue, true);
          else Alert.alert("Chưa có phụ đề", "Hãy nhập một dòng phụ đề để nghe thử.");
        }}
      />
    </ScreenContainer>
  );
}

function CueCard({ cue, isSelected, isRendering, onPress, onChangeText, onAnalyze, onRender }: { cue: SubtitleCue; isSelected: boolean; isRendering: boolean; onPress: () => void; onChangeText: (text: string) => void; onAnalyze: () => void; onRender: () => void }) {
  const status = cue.status === "needs-review"
    ? { label: "Bị đè", color: COLORS.red, icon: "warning-amber" as const }
    : cue.status === "fitted"
      ? { label: `Đã tua ${cue.effectiveSpeed.toFixed(1).replace(".", ",")}x`, color: COLORS.orange, icon: "speed" as const }
      : cue.status === "analyzed"
        ? { label: "Khớp thời lượng", color: COLORS.green, icon: "check-circle" as const }
        : cue.status === "rendered"
          ? { label: "Đã tạo WAV", color: COLORS.green, icon: "check-circle" as const }
          : { label: "Chưa tạo audio", color: COLORS.muted, icon: "schedule" as const };

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cueCard, isSelected && styles.cueCardSelected, pressed && styles.pressed]}>
      <View style={styles.cueTopline}>
        <View style={styles.cueIndex}><Text style={styles.cueIndexText}>{cue.index}</Text></View>
        <Text style={styles.cueTime}>{formatTimestamp(cue.startMs)} — {formatTimestamp(cue.endMs)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${status.color}1F` }]}>
          <Icon name={status.icon} size={14} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      {isSelected ? (
        <TextInput
          multiline
          value={cue.text}
          onChangeText={onChangeText}
          style={styles.cueInput}
          placeholderTextColor={COLORS.muted}
          textAlignVertical="top"
        />
      ) : (
        <Text style={styles.cueText}>{cue.text}</Text>
      )}
      <View style={styles.cueFooter}>
        <Text style={styles.durationText}>Khung {formatDuration(cue.endMs - cue.startMs)} · Ước tính {formatDuration(cue.estimatedDurationMs)}</Text>
        <View style={styles.cueActions}>
          <Pressable onPress={onAnalyze} style={({ pressed }) => [styles.cueActionButton, pressed && styles.pressed]}><Icon name="speed" size={19} color={COLORS.blue} /></Pressable>
          <Pressable onPress={onRender} disabled={isRendering} style={({ pressed }) => [styles.cueActionButton, isRendering && { opacity: 0.55 }, pressed && styles.pressed]}><Icon name={isRendering ? "hourglass-top" : "play-arrow"} size={21} color={COLORS.blue} /></Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function TimelineView({ cues, sourceVideoName, sourceVideoUri, onShiftCue, onBack }: { cues: SubtitleCue[]; sourceVideoName: string | null; sourceVideoUri: string | null; onShiftCue: (id: string, deltaMs: number) => void; onBack: () => void }) {
  const maxEnd = Math.max(10_000, ...cues.map((cue) => cue.endMs));
  const [activeCueId, setActiveCueId] = useState<string | null>(cues[0]?.id ?? null);
  const activeCue = cues.find((cue) => cue.id === activeCueId) ?? null;
  return (
    <View style={styles.timelineRoot}>
      <View style={styles.timelineHeader}>
        <View><Text style={styles.timelineTitle}>Timeline dự án</Text><Text style={styles.timelineSubtitle}>{sourceVideoName ?? "Chưa có video nguồn · có thể xuất audio sau khi render"}</Text></View>
        <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} onPress={onBack}><Icon name="close" /></Pressable>
      </View>
      <VideoPreview sourceUri={sourceVideoUri} />
      <View style={styles.ruler}><Text style={styles.rulerText}>00:00</Text><Text style={styles.rulerText}>{formatTimestamp(maxEnd / 2)}</Text><Text style={styles.rulerText}>{formatTimestamp(maxEnd)}</Text></View>
      <View style={styles.track}>
        <View style={styles.trackLabel}><Icon name="movie" size={18} color={COLORS.muted} /><Text style={styles.trackLabelText}>VIDEO</Text></View>
        <View style={styles.videoLane}><Text style={styles.videoLaneText}>{sourceVideoName ?? "Thêm video nguồn"}</Text></View>
      </View>
      <View style={styles.track}>
        <View style={styles.trackLabel}><Icon name="record-voice-over" size={18} color={COLORS.blue} /><Text style={styles.trackLabelText}>TTS</Text></View>
        <View style={styles.audioLane}>
          {cues.map((cue) => {
            const left = `${(cue.startMs / maxEnd) * 100}%` as `${number}%`;
            const width = `${Math.max(5, ((cue.endMs - cue.startMs) / maxEnd) * 100)}%` as `${number}%`;
            const color = cue.status === "needs-review" ? COLORS.red : cue.status === "fitted" ? COLORS.orange : COLORS.blue;
            return <Pressable key={cue.id} onPress={() => setActiveCueId(cue.id)} style={({ pressed }) => [styles.timelineCue, activeCueId === cue.id && styles.timelineCueSelected, { left, width, backgroundColor: color }, pressed && styles.pressed]}><Text numberOfLines={1} style={styles.timelineCueText}>{cue.index}</Text></Pressable>;
          })}
          {!cues.length && <Text style={styles.emptyTimelineText}>Các đoạn audio TTS sẽ xuất hiện tại đây.</Text>}
        </View>
      </View>
      {activeCue && (
        <View style={styles.timelineEditCard}>
          <View style={styles.timelineEditCopy}>
            <Text style={styles.timelineEditLabel}>ĐOẠN {activeCue.index}</Text>
            <Text numberOfLines={1} style={styles.timelineEditText}>{activeCue.text}</Text>
            <Text style={styles.timelineEditTime}>{formatTimestamp(activeCue.startMs)} — {formatTimestamp(activeCue.endMs)}</Text>
          </View>
          <View style={styles.timelineNudgeGroup}>
            <Pressable onPress={() => onShiftCue(activeCue.id, -100)} style={({ pressed }) => [styles.timelineNudge, pressed && styles.pressed]}><Icon name="remove" size={18} color={COLORS.text} /><Text style={styles.timelineNudgeText}>0,1s</Text></Pressable>
            <Pressable onPress={() => onShiftCue(activeCue.id, 100)} style={({ pressed }) => [styles.timelineNudge, pressed && styles.pressed]}><Icon name="add" size={18} color={COLORS.text} /><Text style={styles.timelineNudgeText}>0,1s</Text></Pressable>
          </View>
        </View>
      )}
      <View style={styles.timelineInfo}><Icon name="info-outline" size={20} color={COLORS.muted} /><Text style={styles.timelineInfoText}>Timeline hiển thị mốc SRT và cảnh báo chồng lấn. Audio thật sẽ xuất hiện sau khi runtime Piper và model giọng được cài trong APK.</Text></View>
    </View>
  );
}

function VideoPreview({ sourceUri }: { sourceUri: string | null }) {
  const player = useVideoPlayer(sourceUri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.volume = 0.35;
  });
  if (!sourceUri) {
    return <View style={styles.videoPlaceholder}><Icon name="movie" size={22} color={COLORS.muted} /><Text style={styles.videoPlaceholderText}>Chưa chọn video nguồn</Text></View>;
  }
  return <VideoView style={styles.videoPreview} player={player} nativeControls contentFit="contain" surfaceType="textureView" />;
}

function VoiceSettingsModal({ visible, voice, runtimeMessage, onClose, onChange, onInstallModel, onPreview }: { visible: boolean; voice: VoiceSettings; runtimeMessage: string; onClose: () => void; onChange: (patch: Partial<VoiceSettings>) => void; onInstallModel: () => void; onPreview: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Cấu hình giọng đọc</Text><Text style={styles.sheetSubtitle}>Thiết lập áp dụng cho các dòng phụ đề mới</Text></View><Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Icon name="close" /></Pressable></View>
          <InfoSelect icon="memory" label="TTS Engine" value="Piper TTS (Offline)" helper="Native runtime cần được đóng gói cùng APK" />
          <InfoSelect icon="language" label="Ngôn ngữ" value="Tiếng Việt (Việt Nam)" helper="vi-VN" />
          <InfoSelect icon="record-voice-over" label="Giọng thuyết minh" value={voice.voiceLabel} helper="Model ONNX phải được người dùng cài/cấp phép" />
          <Pressable onPress={onInstallModel} style={({ pressed }) => [styles.infoSelect, pressed && styles.pressed]}>
            <View style={styles.infoSelectIcon}><Icon name="folder-zip" size={21} color={voice.modelDirectory ? COLORS.green : COLORS.orange} /></View>
            <View style={styles.infoSelectCopy}>
              <Text style={styles.infoSelectLabel}>Model Piper</Text>
              <Text style={styles.infoSelectValue}>{voice.modelDirectory ? "Đã cài model cục bộ" : "Cài gói model"}</Text>
              <Text style={styles.infoSelectHelper}>{voice.modelDirectory ? "Chạm để thay model" : "Chọn .tar.zst hoặc .tar.bz2"}</Text>
            </View>
            <Icon name="download" size={22} color={COLORS.blue} />
          </Pressable>
          <View style={styles.adjustCard}>
            <View style={styles.adjustHeader}><View style={styles.adjustLabelWrap}><Icon name="tune" size={24} color={COLORS.blue} /><View><Text style={styles.adjustLabel}>Tùy chỉnh Giọng đọc</Text><Text style={styles.adjustValue}>Speed: {voice.speed.toFixed(1).replace(".", ",")}x | Pitch: {voice.pitch.toFixed(1).replace(".", ",")}x</Text></View></View><Pressable onPress={onPreview} style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}><Icon name="volume-up" size={19} color={COLORS.blue} /><Text style={styles.previewText}>Nghe thử</Text></Pressable></View>
            <ValueStepper label="Tốc độ" value={voice.speed} minimum={0.5} maximum={2} step={0.1} onChange={(value) => onChange({ speed: value })} />
            <ValueStepper label="Cao độ" value={voice.pitch} minimum={0.7} maximum={1.3} step={0.1} onChange={(value) => onChange({ pitch: value })} />
            <ValueStepper label="Âm lượng TTS" value={voice.ttsVolume} minimum={0.2} maximum={2} step={0.1} onChange={(value) => onChange({ ttsVolume: value })} />
          </View>
          <View style={styles.runtimeNotice}><Icon name="info-outline" size={20} color={COLORS.orange} /><Text style={styles.runtimeNoticeText}>{runtimeMessage}</Text></View>
        </View>
      </View>
    </Modal>
  );
}

function InfoSelect({ icon, label, value, helper }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value: string; helper: string }) {
  return <View style={styles.infoSelect}><View style={styles.infoSelectIcon}><Icon name={icon} size={21} color={COLORS.blue} /></View><View style={styles.infoSelectCopy}><Text style={styles.infoSelectLabel}>{label}</Text><Text style={styles.infoSelectValue}>{value}</Text><Text style={styles.infoSelectHelper}>{helper}</Text></View><Icon name="keyboard-arrow-down" size={25} color={COLORS.muted} /></View>;
}

function ValueStepper({ label, value, minimum, maximum, step, onChange }: { label: string; value: number; minimum: number; maximum: number; step: number; onChange: (value: number) => void }) {
  return <View style={styles.stepper}><Text style={styles.stepperLabel}>{label}</Text><View style={styles.stepperControls}><Pressable onPress={() => onChange(scaleControl(value, minimum, maximum, step, -1))} style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}><Icon name="remove" size={20} color={COLORS.text} /></Pressable><Text style={styles.stepperValue}>{value.toFixed(1).replace(".", ",")}x</Text><Pressable onPress={() => onChange(scaleControl(value, minimum, maximum, step, 1))} style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}><Icon name="add" size={20} color={COLORS.text} /></Pressable></View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, alignItems: "center", justifyContent: "space-between" },
  headerCopy: { flex: 1, marginRight: 12 },
  eyebrow: { color: COLORS.blue, fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: "800", marginTop: 3 },
  subtitle: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  segmentedControl: { flexDirection: "row", marginHorizontal: 20, padding: 4, backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border },
  segment: { flex: 1, minHeight: 40, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, borderRadius: 10 },
  segmentActive: { backgroundColor: COLORS.elevated },
  segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: COLORS.text },
  listContent: { padding: 20, paddingBottom: 132, gap: 12 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  importButton: { flex: 1.2, minHeight: 48, backgroundColor: COLORS.elevated, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  importText: { color: COLORS.text, fontWeight: "800", fontSize: 13 },
  miniButton: { flex: 1, minHeight: 48, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  miniButtonText: { color: COLORS.muted, fontWeight: "700", fontSize: 12 },
  emptyCard: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 26, alignItems: "center", marginTop: 24 },
  emptyIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#12344C", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  emptyText: { color: COLORS.muted, textAlign: "center", lineHeight: 20, fontSize: 13, marginTop: 7 },
  sampleButton: { marginTop: 18, minHeight: 42, justifyContent: "center", paddingHorizontal: 16, backgroundColor: "#12344C", borderRadius: 12 },
  sampleButtonText: { color: COLORS.blue, fontSize: 13, fontWeight: "800" },
  autoFitCard: { backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, flexDirection: "row", alignItems: "center", padding: 14, gap: 12, marginBottom: 12 },
  autoFitIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#12344C", alignItems: "center", justifyContent: "center" },
  autoFitCopy: { flex: 1 },
  autoFitTitle: { color: COLORS.text, fontWeight: "800", fontSize: 14 },
  autoFitDescription: { color: COLORS.muted, marginTop: 3, fontSize: 11, lineHeight: 15 },
  analysisSummary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 },
  analysisText: { color: COLORS.muted, fontSize: 12 },
  analysisButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 38, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#12344C" },
  analysisButtonText: { color: COLORS.blue, fontSize: 12, fontWeight: "800" },
  cueCard: { backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10 },
  cueCardSelected: { borderColor: COLORS.blue, backgroundColor: "#18242C" },
  cueTopline: { flexDirection: "row", alignItems: "center" },
  cueIndex: { width: 25, height: 25, borderRadius: 8, backgroundColor: COLORS.elevated, alignItems: "center", justifyContent: "center", marginRight: 8 },
  cueIndexText: { color: COLORS.text, fontSize: 11, fontWeight: "800" },
  cueTime: { flex: 1, color: COLORS.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  statusText: { fontWeight: "800", fontSize: 10 },
  cueText: { color: COLORS.text, fontSize: 15, fontWeight: "600", lineHeight: 21, marginTop: 12 },
  cueInput: { color: COLORS.text, fontSize: 15, fontWeight: "600", lineHeight: 21, marginTop: 10, minHeight: 66, padding: 10, borderRadius: 10, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  cueFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  durationText: { color: COLORS.muted, fontSize: 11 },
  cueActions: { flexDirection: "row", gap: 8 },
  cueActionButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#12344C", alignItems: "center", justifyContent: "center" },
  bottomDock: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, paddingHorizontal: 16, backgroundColor: "#161A1D", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 10 },
  voiceSummary: { flex: 1, backgroundColor: COLORS.surface, minHeight: 53, borderRadius: 14, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: COLORS.border },
  voiceSummaryIcon: { width: 31, height: 31, backgroundColor: "#12344C", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  voiceSummaryCopy: { flex: 1 },
  voiceSummaryLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  voiceSummaryValue: { color: COLORS.text, fontSize: 12, fontWeight: "800", marginTop: 2 },
  primaryButton: { backgroundColor: COLORS.blue, minHeight: 53, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryButtonText: { color: "#07131C", fontSize: 14, fontWeight: "900" },
  timelineRoot: { flex: 1, padding: 20, paddingBottom: 104 },
  timelineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  timelineTitle: { color: COLORS.text, fontSize: 22, fontWeight: "800" },
  timelineSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 4, maxWidth: 265 },
  videoPreview: { width: "100%", height: 172, borderRadius: 14, backgroundColor: "#000000", marginBottom: 14 },
  videoPlaceholder: { height: 78, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  videoPlaceholderText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  ruler: { borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 8, marginLeft: 66 },
  rulerText: { color: COLORS.muted, fontSize: 10, fontVariant: ["tabular-nums"] },
  track: { marginTop: 14, flexDirection: "row", gap: 10, minHeight: 65 },
  trackLabel: { width: 56, alignItems: "center", justifyContent: "center", gap: 3 },
  trackLabelText: { color: COLORS.muted, fontSize: 10, fontWeight: "800" },
  videoLane: { flex: 1, borderRadius: 10, backgroundColor: "#2B3540", borderWidth: 1, borderColor: "#46586B", justifyContent: "center", paddingHorizontal: 12 },
  videoLaneText: { color: "#C3D0DC", fontSize: 12, fontWeight: "700" },
  audioLane: { flex: 1, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", position: "relative" },
  timelineCue: { position: "absolute", top: 9, bottom: 9, minWidth: 20, borderRadius: 7, justifyContent: "center", paddingHorizontal: 6 },
  timelineCueSelected: { borderWidth: 2, borderColor: "#FFFFFF", zIndex: 2 },
  timelineCueText: { color: "#06131C", fontSize: 10, fontWeight: "900" },
  emptyTimelineText: { color: COLORS.muted, alignSelf: "center", marginTop: 24, fontSize: 11 },
  timelineEditCard: { marginTop: 18, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  timelineEditCopy: { flex: 1 },
  timelineEditLabel: { color: COLORS.blue, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  timelineEditText: { color: COLORS.text, fontSize: 13, fontWeight: "700", marginTop: 3 },
  timelineEditTime: { color: COLORS.muted, fontSize: 10, marginTop: 4, fontVariant: ["tabular-nums"] },
  timelineNudgeGroup: { flexDirection: "row", gap: 6 },
  timelineNudge: { minHeight: 40, minWidth: 48, paddingHorizontal: 7, borderRadius: 10, backgroundColor: COLORS.elevated, justifyContent: "center", alignItems: "center" },
  timelineNudgeText: { color: COLORS.muted, fontSize: 9, fontWeight: "800", marginTop: 1 },
  timelineInfo: { marginTop: 24, flexDirection: "row", gap: 9, borderRadius: 14, padding: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  timelineInfoText: { flex: 1, color: COLORS.muted, lineHeight: 18, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: "#000000A8", justifyContent: "flex-end" },
  modalDismiss: { flex: 1 },
  sheet: { maxHeight: "88%", backgroundColor: "#161A1D", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: Platform.OS === "ios" ? 34 : 24 },
  sheetHandle: { width: 42, height: 5, borderRadius: 5, alignSelf: "center", backgroundColor: COLORS.border, marginBottom: 16 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sheetTitle: { color: COLORS.text, fontSize: 21, fontWeight: "800" },
  sheetSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  closeButton: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  infoSelect: { minHeight: 78, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 12, flexDirection: "row", alignItems: "center", marginBottom: 10 },
  infoSelectIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#12344C", marginRight: 10 },
  infoSelectCopy: { flex: 1 },
  infoSelectLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  infoSelectValue: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginTop: 2 },
  infoSelectHelper: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  adjustCard: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 14, marginTop: 2 },
  adjustHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  adjustLabelWrap: { flexDirection: "row", alignItems: "center", gap: 9 },
  adjustLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  adjustValue: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginTop: 2 },
  previewButton: { flexDirection: "row", gap: 5, alignItems: "center", padding: 8, borderRadius: 10, backgroundColor: "#12344C" },
  previewText: { color: COLORS.blue, fontSize: 12, fontWeight: "800" },
  stepper: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  stepperLabel: { color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.elevated, borderRadius: 10 },
  stepperValue: { color: COLORS.text, minWidth: 40, textAlign: "center", fontVariant: ["tabular-nums"], fontWeight: "800" },
  runtimeNotice: { flexDirection: "row", gap: 8, borderRadius: 13, padding: 12, backgroundColor: "#2A2218", marginTop: 12 },
  runtimeNoticeText: { flex: 1, color: "#F4CC85", fontSize: 11, lineHeight: 16 },
});
