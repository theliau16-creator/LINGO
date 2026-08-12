import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import { uploadMediaFile, type Attachment } from "@/lib/upload-media";
import { sendPhotoMessage, sendVoiceMessage, transcribeVoice } from "@/lib/use-media";

const MAX_PHOTOS = 6;
const MAX_RECORDING_MS = 120_000;

type PickedPhoto = { uri: string; fileName: string | null; mimeType: string | null };

/**
 * Photo picker + voice recorder for the chat composer — same two entry
 * points as the web's MediaComposer (src/components/media-composer.tsx),
 * same props (conversationId, language, onSent). Camera capture is not
 * included (library picker only, matching the multi-select behaviour of
 * the web's plain <input type="file" multiple> most closely) — a documented
 * simplification, easy to add later with expo-image-picker's launchCameraAsync.
 */
export function MediaComposer({ conversationId, language, onSent }: { conversationId: string; language: string; onSent: () => void }) {
  const [selected, setSelected] = useState<PickedPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  async function pickPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission requise", "Lingo a besoin d'accéder à vos photos pour les envoyer.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.8,
    });
    if (result.canceled) return;
    setSelected(
      result.assets.slice(0, MAX_PHOTOS).map((asset) => ({
        uri: asset.uri,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? null,
      })),
    );
  }

  function removeSelected(uri: string) {
    setSelected((list) => list.filter((item) => item.uri !== uri));
  }

  async function confirmSendPhotos() {
    if (selected.length === 0) return;
    setUploadingPhotos(true);
    try {
      const attachments: Attachment[] = [];
      for (const photo of selected) {
        const extension = (photo.fileName?.split(".").pop() || photo.mimeType?.split("/")[1] || "jpg").toLowerCase();
        const contentType = photo.mimeType ?? "image/jpeg";
        const path = await uploadMediaFile(photo.uri, conversationId, extension, contentType);
        attachments.push({ path, type: "image", ...(photo.fileName ? { name: photo.fileName } : {}) });
      }
      await sendPhotoMessage({ conversationId, attachments, language });
      setSelected([]);
      onSent();
    } catch (err) {
      Alert.alert("Envoi impossible", err instanceof Error ? err.message : "Réessayez.");
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function startRecording() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission requise", "Lingo a besoin du micro pour enregistrer un message vocal.");
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
      stopTimeoutRef.current = setTimeout(() => void stopRecording(), MAX_RECORDING_MS);
    } catch {
      Alert.alert("Micro indisponible", "Impossible de démarrer l'enregistrement.");
    }
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    setRecording(false);
    const durationMs = Date.now() - startedAtRef.current;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri || durationMs < 800) return;

    setUploadingVoice(true);
    try {
      const path = await uploadMediaFile(uri, conversationId, "m4a", "audio/m4a");
      const message = await sendVoiceMessage({ conversationId, path, durationMs, language });
      onSent();
      try {
        await transcribeVoice(message.id);
      } catch {
        /* the bubble shows the failure state and its own retry button */
      }
    } catch (err) {
      Alert.alert("Envoi impossible", err instanceof Error ? err.message : "Réessayez.");
    } finally {
      setUploadingVoice(false);
    }
  }

  const busy = uploadingPhotos || uploadingVoice;

  return (
    <View>
      {selected.length > 0 ? (
        <View className="mb-2 gap-2 rounded-3xl border border-border bg-card p-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {selected.map((photo) => (
              <View key={photo.uri}>
                <Image source={{ uri: photo.uri }} className="h-20 w-20 rounded-2xl" />
                <Pressable
                  onPress={() => removeSelected(photo.uri)}
                  className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-destructive"
                >
                  <Text className="text-[11px] text-destructive-foreground">✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => void confirmSendPhotos()}
            disabled={uploadingPhotos}
            className={`items-center rounded-2xl bg-primary py-2.5 ${uploadingPhotos ? "opacity-60" : ""}`}
          >
            {uploadingPhotos ? (
              <ActivityIndicator color="#fbfcfe" />
            ) : (
              <Text className="text-[13px] font-semibold text-primary-foreground">
                Envoyer {selected.length} photo{selected.length > 1 ? "s" : ""}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row items-center gap-1">
        <Pressable
          onPress={() => void pickPhotos()}
          disabled={busy || recording}
          className={`h-11 w-11 items-center justify-center rounded-3xl bg-secondary ${busy || recording ? "opacity-40" : ""}`}
        >
          <Text className="text-[16px]">🖼️</Text>
        </Pressable>

        <Pressable
          onPress={() => (recording ? void stopRecording() : void startRecording())}
          disabled={busy && !recording}
          className={`h-11 w-11 items-center justify-center rounded-3xl ${recording ? "bg-destructive" : "bg-secondary"} ${busy && !recording ? "opacity-40" : ""}`}
        >
          {uploadingVoice ? (
            <ActivityIndicator color="#9598a4" />
          ) : (
            <Text className="text-[16px]">{recording ? "⏹️" : "🎙️"}</Text>
          )}
        </Pressable>
        {recording ? (
          <Text className="text-[12px] text-destructive">{Math.floor(elapsedMs / 1000)}s</Text>
        ) : null}
      </View>
    </View>
  );
}
