import React, { useState } from 'react';
import { Bot, Mic, MicOff, Send, RefreshCw, AlertOctagon } from 'lucide-react';
import { toast } from 'sonner';
import { AiModelsHealthBar } from '../components/ai/AiModelsHealthBar';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { aiApi, extractAiErrorMessage, RagChatResponse } from '../services/ai.api';

/**
 * Wrapper tương thích cho Studio AI — dùng chung Real Qwen 2.5 7B RAG + Faster-Whisper STT.
 */
export const AiPharmacyStudioPage: React.FC = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reply, setReply] = useState<RagChatResponse | null>(null);

  const voice = useVoiceRecorder({
    language: 'vi',
    onTranscript: (text) => {
      setInput(text);
      toast.success('Đã chuyển giọng nói bằng Faster-Whisper');
    },
    onError: (msg) => toast.error(msg),
  });

  const handleAsk = async () => {
    if (input.trim().length < 2) return;
    setLoading(true);
    setErrorMsg(null);
    setReply(null);
    try {
      await aiApi.chatRagStream(
        { message: input.trim() },
        {
          onMeta: (meta) => setReply(meta),
          onDelta: (chunk) =>
            setReply((prev) =>
              prev ? { ...prev, answer: `${prev.answer || ''}${chunk}` } : null
            ),
          onDone: (finalData) => setReply(finalData),
        }
      );
    } catch (err) {
      const msg = extractAiErrorMessage(err, 'Dịch vụ AI không phản hồi');
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AiModelsHealthBar />
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Bot className="h-4 w-4 text-teal-600" />
          Hỏi Đáp Dược Lâm Sàng Qwen 2.5 7B & Giọng Nói Faster-Whisper
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={voice.toggleRecording}
            disabled={voice.isTranscribing}
            className={`rounded-lg border px-3 py-2 text-xs font-bold inline-flex items-center gap-1 ${
              voice.isRecording ? 'border-rose-500 bg-rose-600 text-white' : 'border-slate-200 bg-slate-50'
            }`}
          >
            {voice.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {voice.isRecording ? 'Dừng' : 'Nói'}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập câu hỏi thuốc hoặc triệu chứng..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => void handleAsk()}
            disabled={loading}
            className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white inline-flex items-center gap-1"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Gửi
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-rose-600" />
            {errorMsg}
          </div>
        )}

        {reply && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
            <div className="font-bold text-slate-900">{reply.suspectedCondition}</div>
            <div className="whitespace-pre-wrap text-slate-800">{reply.answer}</div>
            {reply.citations.length > 0 && (
              <div className="text-[11px] text-teal-800">
                Nguồn: {reply.citations.map((c) => `[DOC-${c.docId}] ${c.title}`).join('; ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
