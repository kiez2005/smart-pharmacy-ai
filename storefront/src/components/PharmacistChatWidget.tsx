import React, { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FilePlus2,
  Headphones,
  Maximize2,
  MessageCircleHeart,
  Mic,
  Minimize2,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Square,
  Stethoscope,
  UploadCloud,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStorefrontVoice } from '../hooks/useStorefrontVoice';
import { storeApi } from '../services/api';
import {
  PatientTriageContext,
  Product,
  StorefrontChatCitation,
  StorefrontChatTurn,
} from '../types';
import { formatVND } from '../utils/packaging';

const CHAT_STORAGE_KEY = 'pharmacore_storefront_chat_v1';

const QUICK_CHIPS = [
  { label: 'Sốt & Cảm cúm (OTC)', text: 'Trẻ em khoảng 20kg hoặc người lớn bị sốt, cảm cúm nên dùng thuốc hạ sốt OTC nào an toàn?' },
  { label: 'Ho có đờm & Đau họng', text: 'Bị ho có đờm kéo dài kèm rát họng thì nguyên nhân thường gặp là gì, cần chăm sóc và lưu ý dấu hiệu khám nào?' },
  { label: 'Đau bao tử & Ợ chua', text: 'Bị đau bao tử, ợ chua nóng rát thượng vị nên dùng thuốc gì cho dịu nhanh?' },
  { label: 'Dị ứng & Mẩn ngứa', text: 'Bị nổi mẩn ngứa mề đay cấp tính nên xử trí tại nhà ra sao, thuốc kháng histamin OTC nào ít gây buồn ngủ?' },
  { label: 'Bị nhiệt miệng (Tự do)', text: 'Bị nhiệt miệng đau rát ăn uống khó thì nên chăm sóc, súc miệng hay dùng gì cho mau khỏi?' },
  { label: 'Giao 2H & Freeship 300k', text: 'Chính sách giao hàng nhanh 2 giờ, miễn phí ship và tra cứu đơn hàng như thế nào?' },
];

interface PharmacistChatWidgetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contextProduct: Product | null;
  onClearContextProduct: () => void;
  queuedQuestion: { id: number; text: string } | null;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onOpenPrescriptionModal: () => void;
  hideLauncher?: boolean;
}

function renderSimpleInlineFormatting(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\[DOC-\d+\])/g);
    return (
      <React.Fragment key={lineIdx}>
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={pIdx} className="font-bold text-slate-900">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (/^\[DOC-\d+\]$/.test(part)) {
            return (
              <span
                key={pIdx}
                className="mx-0.5 inline-block rounded bg-teal-50 px-1 py-0.2 font-mono text-[10px] font-bold text-teal-800 border border-teal-200"
              >
                {part}
              </span>
            );
          }
          return <React.Fragment key={pIdx}>{part}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export const PharmacistChatWidget: React.FC<PharmacistChatWidgetProps> = ({
  isOpen,
  onOpenChange,
  contextProduct,
  onClearContextProduct,
  queuedQuestion,
  onSelectProduct,
  onAddToCart,
  onOpenPrescriptionModal,
  hideLauncher = false,
}) => {
  const [turns, setTurns] = useState<StorefrontChatTurn[]>(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as StorefrontChatTurn[];
        if (Array.isArray(parsed)) {
          return parsed.slice(-16).map((t) => ({ ...t, isStreaming: false }));
        }
      }
    } catch {
      // ignore sessionStorage error
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [patientContext, setPatientContext] = useState<PatientTriageContext>({
    ageGroup: 'ADULT',
    pregnantOrBreastfeeding: false,
    allergies: '',
    chronicConditions: '',
  });
  const [expandedCitationsTurn, setExpandedCitationsTurn] = useState<Record<string, boolean>>({});
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffSent, setHandoffSent] = useState(false);
  const [handoffName, setHandoffName] = useState('');
  const [handoffPhone, setHandoffPhone] = useState('');
  const [handoffEmail, setHandoffEmail] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [handoffFileKey, setHandoffFileKey] = useState('');
  const [handoffFileName, setHandoffFileName] = useState('');
  const [uploadingRx, setUploadingRx] = useState(false);
  const [submittingHandoff, setSubmittingHandoff] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const prevTurnCountRef = useRef<number>(0);
  const lastQueuedIdRef = useRef<number>(0);
  const autoSpeakRef = useRef<boolean>(false);
  autoSpeakRef.current = autoSpeak;

  const {
    isRecording,
    recordingSec,
    isTranscribing,
    speakingTurnId,
    ttsSupported,
    startRecording,
    stopRecording,
    speakTurn,
    stopSpeaking,
  } = useStorefrontVoice({
    language: 'vi',
    onTranscript: (spokenText) => {
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${spokenText}` : spokenText));
      toast.success('Đã chuyển giọng nói thành văn bản — nhấn Gửi để nhận tư vấn');
    },
    onError: (msg) => toast.error(msg),
  });

  const hasCustomPatientContext =
    patientContext.ageGroup !== 'ADULT' ||
    patientContext.pregnantOrBreastfeeding ||
    patientContext.allergies.trim().length > 0 ||
    patientContext.chronicConditions.trim().length > 0;

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(turns.slice(-16)));
    } catch {
      // ignore quota error
    }
  }, [turns]);

  useEffect(() => {
    if (!isOpen) return;
    // Chỉ cuộn xuống cuối khi vừa thêm lượt hỏi mới hoặc mở form Handoff — tránh kéo trôi phần chữ khi bung thẻ thuốc
    if (turns.length !== prevTurnCountRef.current || handoffOpen || handoffSent) {
      prevTurnCountRef.current = turns.length;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isOpen, turns.length, handoffOpen, handoffSent]);

  const handleStopStream = () => {
    abortCtrlRef.current?.abort();
  };

  const sendMessage = async (customText?: string) => {
    const text = (customText ?? input).trim();
    if (text.length < 2 || sending) {
      if (text.length < 2 && !customText) {
        toast.info('Vui lòng nhập câu hỏi tối thiểu 2 ký tự.');
      }
      return;
    }

    const userTurn: StorefrontChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const assistantId = `a-${Date.now() + 1}`;
    const historyPayload = turns
      .filter((t) => !t.errorCode && t.content.trim().length > 0)
      .slice(-4)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 400) }));

    setTurns((prev) => [
      ...prev,
      userTurn,
      { id: assistantId, role: 'assistant', content: '', isStreaming: true },
    ]);
    if (!customText) setInput('');
    setHandoffSent(false);
    setSending(true);

    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    try {
      await storeApi.chatWithAssistantStream(
        {
          message: text,
          productIdContext: contextProduct?.ProductID,
          patientContext: hasCustomPatientContext ? patientContext : undefined,
          history: historyPayload,
        },
        {
          signal: ctrl.signal,
          onMeta: (meta) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId ? { ...t, data: meta, isStreaming: true } : t
              )
            );
          },
          onDelta: (chunk) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId
                  ? {
                      ...t,
                      content: `${t.content}${chunk}`,
                      isStreaming: true,
                      data: t.data
                        ? { ...t.data, answer: `${t.data.answer || ''}${chunk}` }
                        : undefined,
                    }
                  : t
              )
            );
          },
          onDone: (finalData) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId
                  ? {
                      ...t,
                      content: finalData.answer,
                      data: finalData,
                      isStreaming: false,
                    }
                  : t
              )
            );
            if (autoSpeakRef.current && finalData.answer) {
              speakTurn(assistantId, finalData.answer);
            }
          },
        }
      );
    } catch (err) {
      const e = err as { name?: string; status?: number; code?: string; message?: string };
      if (e.name === 'AbortError') {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantId
              ? {
                  ...t,
                  isStreaming: false,
                  content: t.content || '(Đã dừng trả lời theo yêu cầu của bạn)',
                }
              : t
          )
        );
        return;
      }

      const code =
        e.status === 429 || e.code === 'AI_CHAT_RATE_LIMITED'
          ? 'RATE_LIMITED'
          : e.status === 503 || e.status === 502
            ? 'AI_UNAVAILABLE'
            : 'GENERIC_ERROR';
      const fallbackMsg =
        code === 'RATE_LIMITED'
          ? 'Bạn đang gửi câu hỏi hơi nhanh. Vui lòng đợi ít giây hoặc bấm "Gặp Dược sĩ" để được gọi lại miễn phí.'
          : 'Trợ lý AI hiện đang bảo trì tạm thời. Bạn có thể gửi câu hỏi trực tiếp cho Dược sĩ gọi lại trong 5 phút!';

      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId
            ? {
                ...t,
                content: '',
                data: undefined,
                isStreaming: false,
                errorCode: code,
                errorMessage: e.message || fallbackMsg,
              }
            : t
        )
      );
    } finally {
      abortCtrlRef.current = null;
      setSending(false);
    }
  };

  useEffect(() => {
    if (queuedQuestion && queuedQuestion.id !== lastQueuedIdRef.current) {
      lastQueuedIdRef.current = queuedQuestion.id;
      void sendMessage(queuedQuestion.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedQuestion]);

  const handleResetChat = () => {
    setTurns([]);
    setHandoffOpen(false);
    setHandoffSent(false);
    onClearContextProduct();
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
  };

  const handleUploadHandoffRx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Ảnh toa thuốc tối đa 3MB (JPEG, PNG, WEBP)');
      return;
    }
    setUploadingRx(true);
    try {
      const up = await storeApi.uploadPrescriptionImage(file);
      setHandoffFileKey(up.fileKey);
      setHandoffFileName(file.name);
      toast.success('Đã đính kèm ảnh đơn thuốc bảo mật');
    } catch {
      toast.error('Không thể tải ảnh đơn thuốc. Vui lòng thử ảnh JPEG/PNG <= 3MB.');
    } finally {
      setUploadingRx(false);
    }
  };

  const handleSubmitWarmHandoff = async (e: FormEvent) => {
    e.preventDefault();
    if (handoffName.trim().length < 2 || handoffPhone.trim().length < 8) {
      toast.warning('Vui lòng nhập Họ tên và Số điện thoại để Dược sĩ gọi lại.');
      return;
    }
    setSubmittingHandoff(true);
    try {
      const transcriptSummary =
        turns
          .slice(-6)
          .map((t) => `${t.role === 'user' ? 'Khách' : 'AI'}: ${t.content || t.errorMessage || ''}`)
          .join(' || ') || 'Khách mở yêu cầu tư vấn trực tiếp với Dược sĩ từ Storefront.';

      await storeApi.submitChatWarmHandoff({
        fullName: handoffName,
        phone: handoffPhone,
        email: handoffEmail.trim() || undefined,
        prescriptionFileKey: handoffFileKey || undefined,
        note: handoffNote,
        transcriptSummary,
      });
      setHandoffSent(true);
      setHandoffOpen(false);
      toast.success('Đã chuyển lịch sử chat sang Dược sĩ! Dược sĩ sẽ gọi lại trong ít phút.');
    } catch {
      toast.error('Không gửi được yêu cầu. Bạn có thể gọi tổng đài 1800-6868.');
    } finally {
      setSubmittingHandoff(false);
    }
  };

  return (
    <>
      {/* Nút nổi mở Chatbot góc dưới phải */}
      {!isOpen && !hideLauncher && (
        <button
          type="button"
          data-testid="storefront-chat-launcher"
          onClick={() => onOpenChange(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 group flex items-center gap-2.5 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 text-white shadow-xl hover:from-teal-700 hover:to-emerald-700 transition-all hover:scale-[1.03] active:scale-[0.98]"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <MessageCircleHeart className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-300 ring-2 ring-teal-700 animate-pulse" />
          </span>
          <div className="text-left pr-1">
            <div className="text-xs sm:text-sm font-extrabold leading-tight">Hỏi Dược sĩ AI</div>
            <div className="text-[10px] text-teal-100 leading-tight hidden sm:block">
              Giọng nói · Chẩn đoán triệu chứng 24/7
            </div>
          </div>
        </button>
      )}

      {/* Drawer / Popover Chat */}
      {isOpen && (
        <aside
          aria-label="Trợ lý Dược sĩ AI PharmaCore"
          data-testid="storefront-chat-drawer"
          className={`fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-50 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden transition-all duration-200 ${
            isExpanded
              ? 'w-[96vw] sm:w-[680px] h-[88vh] sm:h-[720px]'
              : 'w-[94vw] sm:w-[440px] h-[82vh] sm:h-[630px]'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-700 to-emerald-600 px-4 py-3 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold leading-tight truncate">
                  Trợ lý Dược sĩ AI · Voice &amp; Sàng lọc Y tế
                </div>
                <div className="text-[11px] text-teal-100 truncate">
                  Nói hoặc gõ triệu chứng · Đọc HDSD · Chuyển Dược sĩ thật
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {ttsSupported && (
                <button
                  type="button"
                  onClick={() => {
                    if (autoSpeak) stopSpeaking();
                    setAutoSpeak((v) => !v);
                  }}
                  title={autoSpeak ? 'Tắt tự động đọc giọng nói' : 'Bật tự động đọc tư vấn bằng giọng nói'}
                  className={`rounded-lg p-1.5 transition-colors ${
                    autoSpeak ? 'bg-white text-teal-800' : 'hover:bg-white/20 text-white'
                  }`}
                >
                  {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setHandoffOpen((v) => !v)}
                title="Chuyển Dược sĩ thật tư vấn"
                className="inline-flex items-center gap-1 rounded-lg bg-white/15 hover:bg-white/25 px-2 py-1 text-[11px] font-bold transition-colors"
              >
                <Headphones className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Gặp Dược sĩ</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={isExpanded ? 'Thu gọn khung chat' : 'Mở rộng khung tư vấn y tế'}
                className="rounded-lg p-1.5 hover:bg-white/20 transition-colors hidden sm:inline-flex"
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleResetChat}
                title="Cuộc hội thoại mới"
                className="rounded-lg p-1.5 hover:bg-white/20 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                title="Thu gọn hộp chat"
                className="rounded-lg p-1.5 hover:bg-white/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Disclaimer cố định chuẩn ePharmacy */}
          <div className="bg-amber-50/90 border-b border-amber-200/80 px-3.5 py-1.5 text-[11px] text-amber-900 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span className="leading-snug truncate">
                AI tham khảo HDSD &amp; sàng lọc y tế — Không thay thế bác sĩ.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTriageOpen((v) => !v)}
              className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border transition-colors ${
                hasCustomPatientContext
                  ? 'border-teal-500 bg-teal-600 text-white'
                  : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
              }`}
            >
              <Stethoscope className="h-3 w-3" />
              <span>{hasCustomPatientContext ? 'Hồ sơ: Đã bật' : 'Hồ sơ người bệnh'}</span>
            </button>
          </div>

          {/* Hồ sơ Sàng lọc Bệnh nhân nhanh (Tùy chọn: Trẻ em / Mang thai / Dị ứng / Bệnh nền) */}
          {triageOpen && (
            <div className="bg-teal-50/80 border-b border-teal-200 px-3.5 py-2.5 space-y-2 text-[11px] shrink-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-teal-950 mr-1">Đối tượng:</span>
                  {[
                    { id: 'ADULT' as const, label: 'Người lớn' },
                    { id: 'CHILD' as const, label: 'Trẻ em' },
                    { id: 'ELDERLY' as const, label: 'Cao tuổi' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setPatientContext((prev) => ({ ...prev, ageGroup: opt.id }))
                      }
                      className={`rounded-md px-2 py-0.5 font-semibold border transition-colors ${
                        patientContext.ageGroup === opt.id
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <label className="inline-flex items-center gap-1.5 font-semibold text-teal-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={patientContext.pregnantOrBreastfeeding}
                    onChange={(e) =>
                      setPatientContext((prev) => ({
                        ...prev,
                        pregnantOrBreastfeeding: e.target.checked,
                      }))
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                  />
                  <span>Mang thai / Cho bú</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  maxLength={150}
                  value={patientContext.allergies}
                  onChange={(e) =>
                    setPatientContext((prev) => ({ ...prev, allergies: e.target.value }))
                  }
                  placeholder="Dị ứng thuốc (vd: Penicillin)"
                  className="h-7 rounded-md border border-teal-200 bg-white px-2 text-[11px] focus:border-teal-600 focus:outline-none"
                />
                <input
                  type="text"
                  maxLength={150}
                  value={patientContext.chronicConditions}
                  onChange={(e) =>
                    setPatientContext((prev) => ({ ...prev, chronicConditions: e.target.value }))
                  }
                  placeholder="Bệnh nền (vd: Dạ dày, Huyết áp)"
                  className="h-7 rounded-md border border-teal-200 bg-white px-2 text-[11px] focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Ngữ cảnh sản phẩm đang xem */}
          {contextProduct && (
            <div className="bg-teal-50 border-b border-teal-200 px-3.5 py-1.5 text-[11px] text-teal-900 flex items-center justify-between gap-2 shrink-0">
              <span className="truncate">
                Đang hỏi về: <strong>{contextProduct.ProductName}</strong>
              </span>
              <button
                type="button"
                onClick={onClearContextProduct}
                className="text-teal-700 hover:text-teal-950 font-bold shrink-0"
              >
                Bỏ chọn
              </button>
            </div>
          )}

          {/* Nội dung hội thoại */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70">
            {turns.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-xs text-slate-700 shadow-2xs space-y-2">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    Xin chào! Bạn cần Dược sĩ AI hỗ trợ gì hôm nay?
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Bạn có thể hỏi tự nhiên về bất kỳ triệu chứng nhẹ, cách dùng thuốc trong kho,
                    kiểm tra giao hàng 2H hoặc gửi ảnh đơn thuốc để Dược sĩ thẩm định.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500 px-0.5">
                    Gợi ý hỏi nhanh:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => void sendMessage(chip.text)}
                        className="rounded-xl border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 hover:border-teal-400 transition-colors text-left shadow-2xs"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {turns.map((turn) => {
              const citExpanded = Boolean(expandedCitationsTurn[turn.id]);
              const citations: StorefrontChatCitation[] = turn.data?.citations || [];
              const products: Product[] = turn.data?.suggestedProducts || [];

              return (
                <div
                  key={turn.id}
                  className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs space-y-2 ${
                      turn.role === 'user'
                        ? 'bg-teal-600 text-white rounded-br-sm'
                        : turn.errorCode
                          ? 'bg-rose-50 border border-rose-200 text-rose-900 rounded-bl-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                    }`}
                  >
                    {turn.role === 'user' ? (
                      <div className="whitespace-pre-wrap leading-relaxed">{turn.content}</div>
                    ) : turn.errorCode ? (
                      <div className="space-y-2">
                        <div className="font-bold flex items-center gap-1.5 text-rose-800">
                          <AlertOctagon className="h-4 w-4 shrink-0" />
                          <span>Trợ lý AI tạm bận / bảo trì</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-rose-800">
                          {turn.errorMessage}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setHandoffOpen(true)}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                            Nhờ Dược sĩ gọi lại ngay
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenPrescriptionModal()}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <FilePlus2 className="h-3.5 w-3.5 text-teal-600" />
                            Gửi ảnh đơn thuốc
                          </button>
                        </div>
                      </div>
                    ) : !turn.data && !turn.content ? (
                      <div className="inline-flex items-center gap-2 text-slate-500 py-0.5">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-600" />
                        <span>Đang tra cứu HDSD &amp; khởi tạo trả lời...</span>
                      </div>
                    ) : (
                      <>
                        {/* Badges nguồn, phân tầng sàng lọc y tế & nút đọc giọng nói */}
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {turn.data?.emergencyAlert && (
                              <div className="w-full rounded-xl bg-rose-600 p-2.5 text-white space-y-1 mb-1">
                                <div className="font-extrabold flex items-center gap-1.5 text-xs">
                                  <AlertOctagon className="h-4 w-4 shrink-0" />
                                  CẢNH BÁO CẤP CỨU — GỌI NGAY 115
                                </div>
                                <div className="flex gap-2 pt-0.5">
                                  <a
                                    href="tel:115"
                                    className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-extrabold text-rose-700"
                                  >
                                    Gọi 115
                                  </a>
                                  <a
                                    href="tel:18006868"
                                    className="rounded-lg bg-rose-700/80 border border-white/40 px-2.5 py-1 text-[11px] font-bold text-white"
                                  >
                                    Dược sĩ: 1800-6868
                                  </a>
                                </div>
                              </div>
                            )}

                            {turn.data?.triageLevel === 'CAUTION' && !turn.data?.emergencyAlert && (
                              <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                Cần thận trọng theo hồ sơ
                              </span>
                            )}
                            {turn.data?.groundingMode === 'LOCAL_HDSD' && citations.length > 0 && (
                              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                Chuẩn HDSD Nhà thuốc
                              </span>
                            )}
                            {turn.data?.groundingMode === 'GENERAL_MEDICAL' && (
                              <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                                Sàng lọc Y khoa Tham khảo
                              </span>
                            )}
                            {turn.data?.modelUsed && turn.data.groundingMode !== 'FAST_PATH' && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                                {turn.data.modelUsed}
                              </span>
                            )}
                          </div>

                          {ttsSupported && !turn.isStreaming && (turn.content || turn.data?.answer) && (
                            <button
                              type="button"
                              onClick={() =>
                                speakTurn(turn.id, turn.content || turn.data?.answer || '')
                              }
                              title={speakingTurnId === turn.id ? 'Dừng đọc' : 'Nghe tư vấn bằng giọng nói'}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border transition-colors ${
                                speakingTurnId === turn.id
                                  ? 'bg-teal-600 text-white border-teal-600'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-teal-50 hover:text-teal-800'
                              }`}
                            >
                              {speakingTurnId === turn.id ? (
                                <>
                                  <Square className="h-2.5 w-2.5 fill-current" />
                                  <span>Dừng</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-3 w-3" />
                                  <span>Nghe</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Nội dung câu trả lời streaming — luôn ưu tiên hiển thị chữ trước thẻ thuốc */}
                        <div className="leading-relaxed text-slate-800 break-words">
                          {turn.content || turn.data?.answer ? (
                            <>
                              {renderSimpleInlineFormatting(turn.content || turn.data?.answer || '')}
                              {turn.isStreaming && (
                                <span className="ml-1 inline-block h-3.5 w-1.5 align-middle bg-teal-600 animate-pulse" />
                              )}
                            </>
                          ) : turn.isStreaming ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-500 italic py-0.5">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-600" />
                              Đang soạn câu trả lời tư vấn...
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">
                              Hiện chưa nhận được nội dung văn bản — bạn có thể hỏi lại hoặc bấm Gặp Dược sĩ.
                            </span>
                          )}
                        </div>

                        {/* Lưu ý an toàn */}
                        {!turn.isStreaming && turn.data?.warnings && turn.data.warnings.length > 0 && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 space-y-0.5">
                            <div className="font-bold flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              Lưu ý quan trọng:
                            </div>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {turn.data.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Trích dẫn nguồn DOC-id */}
                        {!turn.isStreaming && citations.length > 0 && (
                          <div className="pt-1 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCitationsTurn((prev) => ({
                                  ...prev,
                                  [turn.id]: !prev[turn.id],
                                }))
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:underline"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              Xem {citations.length} nguồn HDSD/Dược thư
                              {citExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>

                            {citExpanded && (
                              <div className="mt-1.5 space-y-1.5">
                                {citations.map((cit) => (
                                  <div
                                    key={cit.docId}
                                    className="rounded-lg border border-teal-200 bg-teal-50/40 p-2 text-[10px]"
                                  >
                                    <div className="font-bold text-teal-900">
                                      [DOC-{cit.docId}] {cit.title} — {cit.section}
                                    </div>
                                    <div className="text-slate-500">Nguồn: {cit.sourceName}</div>
                                    <div className="mt-0.5 text-slate-700 line-clamp-3">
                                      {cit.snippet}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Thẻ Sản phẩm Tương tác: chỉ hiển thị sau khi chữ đã hoàn tất để không che/đẩy văn bản trả lời */}
                        {!turn.isStreaming && products.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-100 space-y-1.5">
                            <div className="text-[11px] font-bold text-slate-700">
                              Sản phẩm phù hợp đang còn hàng:
                            </div>
                            <div className="space-y-1.5">
                              {products.slice(0, 3).map((prod) => (
                                <div
                                  key={prod.ProductID}
                                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                                >
                                  <img
                                    src={prod.PathImage}
                                    alt={prod.ProductName}
                                    className="h-11 w-11 rounded-lg object-cover border border-slate-200 shrink-0 bg-white"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-900 text-[11px] line-clamp-1">
                                      {prod.ProductName}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="font-extrabold text-teal-700 text-[11px]">
                                        {formatVND(prod.Price)}/{prod.Unit}
                                      </span>
                                      <span
                                        className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                                          prod.IsRx
                                            ? 'bg-rose-100 text-rose-800'
                                            : 'bg-emerald-100 text-emerald-800'
                                        }`}
                                      >
                                        {prod.IsRx ? 'Kê đơn Rx' : 'OTC'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => onSelectProduct(prod)}
                                      title="Xem chi tiết thuốc"
                                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                    {prod.IsRx ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenPrescriptionModal()}
                                        className="rounded-lg bg-rose-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-rose-700"
                                      >
                                        Gửi toa Rx
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={!prod.InStock}
                                        onClick={() => onAddToCart(prod)}
                                        className="rounded-lg bg-teal-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-teal-700 disabled:bg-slate-300 inline-flex items-center gap-1"
                                      >
                                        <ShoppingBag className="h-3 w-3" />
                                        Thêm
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Nút Warm Handoff gợi ý gặp Dược sĩ */}
                        {(turn.data?.shouldConsultPharmacist || turn.data?.insufficientKnowledge) &&
                          !handoffOpen &&
                          !handoffSent && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setHandoffOpen(true)}
                                className="w-full rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] font-bold text-teal-800 hover:bg-teal-100 inline-flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <Headphones className="h-3.5 w-3.5 text-teal-600" />
                                Chuyển cuộc chat này cho Dược sĩ gọi tư vấn miễn phí
                              </button>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Card xác nhận đã chuyển Dược sĩ */}
            {handoffSent && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Đã gửi lịch sử trò chuyện tới Dược sĩ!</div>
                  <div className="text-[11px] text-emerald-800">
                    Dược sĩ phụ trách sẽ liên hệ lại số <strong>{handoffPhone}</strong> trong vài
                    phút mà bạn không cần kể lại từ đầu.
                  </div>
                </div>
              </div>
            )}

            {/* Form Warm Handoff gọn nhẹ ngay trong chat */}
            {handoffOpen && (
              <form
                onSubmit={(e) => void handleSubmitWarmHandoff(e)}
                className="rounded-2xl border border-teal-300 bg-white p-3.5 shadow-sm space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-teal-800 flex items-center gap-1.5">
                    <Headphones className="h-4 w-4" />
                    Chuyển tiếp Dược sĩ (Kèm lịch sử chat)
                  </div>
                  <button
                    type="button"
                    onClick={() => setHandoffOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={handoffName}
                    onChange={(e) => setHandoffName(e.target.value)}
                    placeholder="Họ tên của bạn *"
                    className="h-9 rounded-lg border border-slate-300 px-2.5 text-xs outline-none focus:border-teal-600"
                  />
                  <input
                    type="tel"
                    required
                    value={handoffPhone}
                    onChange={(e) => setHandoffPhone(e.target.value)}
                    placeholder="Số điện thoại gọi lại *"
                    className="h-9 rounded-lg border border-slate-300 px-2.5 text-xs outline-none focus:border-teal-600"
                  />
                </div>

                <input
                  type="email"
                  value={handoffEmail}
                  onChange={(e) => setHandoffEmail(e.target.value)}
                  placeholder="Gmail nhận phản hồi chi tiết (tùy chọn, vd: tenban@gmail.com)"
                  className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-xs outline-none focus:border-teal-600"
                />

                <textarea
                  rows={2}
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder="Ghi chú thêm (tuổi, dị ứng thuốc, bệnh nền nếu có)..."
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-teal-600"
                />

                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 truncate">
                    <UploadCloud className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                    <span className="truncate">
                      {uploadingRx
                        ? 'Đang tải ảnh...'
                        : handoffFileName || 'Đính kèm ảnh toa thuốc'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleUploadHandoffRx(e)}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={submittingHandoff || uploadingRx}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 shrink-0"
                  >
                    {submittingHandoff ? 'Đang gửi...' : 'Gửi Dược sĩ'}
                  </button>
                </div>
              </form>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Ô nhập câu hỏi + Micro giọng nói Faster-Whisper */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="border-t border-slate-200 bg-white p-2.5 flex items-center gap-1.5 shrink-0"
          >
            <button
              type="button"
              disabled={sending || isTranscribing}
              onClick={() => (isRecording ? stopRecording() : void startRecording())}
              title={
                isRecording
                  ? `Đang ghi âm (${recordingSec}s) — Nhấn để dừng & chép lời`
                  : 'Nói triệu chứng / tên thuốc bằng giọng nói (Faster-Whisper)'
              }
              className={`h-10 px-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1 transition-all shrink-0 disabled:opacity-50 ${
                isRecording
                  ? 'border-rose-500 bg-rose-600 text-white animate-pulse'
                  : isTranscribing
                    ? 'border-teal-300 bg-teal-50 text-teal-700'
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-800'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span className="text-[11px] tabular-nums">{recordingSec}s</span>
                </>
              ) : isTranscribing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <input
              type="text"
              value={input}
              maxLength={500}
              disabled={sending || isRecording || isTranscribing}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isRecording
                  ? 'Đang nghe giọng nói của bạn... (bấm nút đỏ để xong)'
                  : isTranscribing
                    ? 'Faster-Whisper đang chuyển giọng nói thành chữ...'
                    : 'Nói micro hoặc nhập triệu chứng, bệnh lý, tên thuốc...'
              }
              className="flex-1 h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900 outline-none focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            {sending ? (
              <button
                type="button"
                onClick={handleStopStream}
                title="Dừng trả lời"
                className="h-10 px-3 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 inline-flex items-center gap-1 transition-colors shrink-0"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span className="hidden xs:inline">Dừng</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={input.trim().length < 2}
                className="h-10 px-3.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:bg-slate-300 inline-flex items-center gap-1 transition-colors shrink-0"
              >
                <Send className="h-4 w-4" />
                <span className="hidden xs:inline">Gửi</span>
              </button>
            )}
          </form>
        </aside>
      )}
    </>
  );
};
