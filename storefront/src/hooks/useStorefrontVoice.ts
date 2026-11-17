import { useCallback, useEffect, useRef, useState } from 'react';
import { storeApi } from '../services/api';

interface UseStorefrontVoiceOptions {
  language?: string;
  onTranscript?: (text: string) => void;
  onError?: (message: string) => void;
}

function cleanSpeechText(raw: string): string {
  return String(raw || '')
    .replace(/\[DOC-\d+\]/g, '')
    .replace(/\[SP-\d+\]/g, '')
    .replace(/[*_`#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useStorefrontVoice(options: UseStorefrontVoiceOptions = {}) {
  const { language = 'vi', onTranscript, onError } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  const ttsSupported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  const stopRecordingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    stopRecordingTimer();
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, [stopRecordingTimer]);

  const stopSpeaking = useCallback(() => {
    if (ttsSupported) {
      window.speechSynthesis.cancel();
    }
    setSpeakingTurnId(null);
  }, [ttsSupported]);

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore unmount cleanup
      }
      cleanupStream();
      if (ttsSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cleanupStream, ttsSupported]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    stopSpeaking();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onErrorRef.current?.('Trình duyệt chưa hỗ trợ thu âm micro.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      setRecordingSec(0);

      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const chosenMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        cleanupStream();
        setIsRecording(false);
        const blobType = recorder.mimeType || chosenMime || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];

        if (audioBlob.size < 450) {
          onErrorRef.current?.('Đoạn thu âm quá ngắn hoặc không có tiếng nói.');
          return;
        }

        setIsTranscribing(true);
        try {
          const ext = blobType.includes('ogg') ? 'ogg' : 'webm';
          const res = await storeApi.speechToText(audioBlob, `storefront-voice.${ext}`, language);
          if (!res.text || !res.text.trim()) {
            onErrorRef.current?.('Chưa nghe rõ lời nói. Bạn hãy nói gần micro hơn nhé.');
            return;
          }
          onTranscriptRef.current?.(res.text.trim());
        } catch (err) {
          const msg =
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            'Nhận dạng giọng nói hiện tạm gián đoạn.';
          onErrorRef.current?.(msg);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch (err) {
      cleanupStream();
      setIsRecording(false);
      onErrorRef.current?.(
        err instanceof Error
          ? `Không mở được micro: ${err.message}`
          : 'Vui lòng cấp quyền micro để sử dụng tư vấn bằng giọng nói.'
      );
    }
  }, [cleanupStream, language, stopSpeaking]);

  const speakTurn = useCallback(
    (turnId: string, rawText: string) => {
      if (!ttsSupported) {
        onErrorRef.current?.('Trình duyệt không hỗ trợ đọc giọng nói (SpeechSynthesis).');
        return;
      }
      if (speakingTurnId === turnId) {
        stopSpeaking();
        return;
      }
      const clean = cleanSpeechText(rawText);
      if (!clean) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.02;

      const voices = window.speechSynthesis.getVoices();
      const viVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith('vi')) ||
        voices.find((v) => /viet/i.test(v.name));
      if (viVoice) {
        utterance.voice = viVoice;
      }

      utterance.onstart = () => setSpeakingTurnId(turnId);
      utterance.onend = () => setSpeakingTurnId((cur) => (cur === turnId ? null : cur));
      utterance.onerror = () => setSpeakingTurnId((cur) => (cur === turnId ? null : cur));

      setSpeakingTurnId(turnId);
      window.speechSynthesis.speak(utterance);
    },
    [speakingTurnId, stopSpeaking, ttsSupported]
  );

  return {
    isRecording,
    recordingSec,
    isTranscribing,
    speakingTurnId,
    ttsSupported,
    startRecording,
    stopRecording,
    speakTurn,
    stopSpeaking,
  };
}
