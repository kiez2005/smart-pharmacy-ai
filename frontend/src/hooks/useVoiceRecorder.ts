import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi, extractAiErrorMessage } from '../services/ai.api';

interface UseVoiceRecorderOptions {
  language?: string;
  onTranscript?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const { language = 'vi', onTranscript, onError } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

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
    };
  }, [cleanupStream]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Trình duyệt không hỗ trợ thu âm micro (MediaRecorder API).';
      setError(msg);
      onError?.(msg);
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

        if (audioBlob.size < 400) {
          const msg = 'Đoạn thu âm quá ngắn hoặc không có tiếng nói.';
          setError(msg);
          onError?.(msg);
          return;
        }

        setIsTranscribing(true);
        try {
          const ext = blobType.includes('ogg') ? 'ogg' : 'webm';
          const res = await aiApi.speechToText(audioBlob, `voice-input.${ext}`, language);
          setLastModelUsed(res.modelUsed);
          if (!res.text || !res.text.trim()) {
            const msg = 'Faster-Whisper không phát hiện lời nói rõ ràng trong đoạn thu âm.';
            setError(msg);
            onError?.(msg);
            return;
          }
          onTranscript?.(res.text.trim());
        } catch (err) {
          const msg = extractAiErrorMessage(
            err,
            'Không thể chuyển giọng nói thành văn bản (kiểm tra model Faster-Whisper).'
          );
          setError(msg);
          onError?.(msg);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      cleanupStream();
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Bạn đã từ chối quyền sử dụng Micro. Vui lòng cấp quyền trên trình duyệt.'
          : 'Không thể khởi tạo micro để ghi âm.';
      setError(msg);
      onError?.(msg);
    }
  }, [cleanupStream, language, onError, onTranscript]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else if (!isTranscribing) {
      void startRecording();
    }
  }, [isRecording, isTranscribing, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    lastModelUsed,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
