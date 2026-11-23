import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  FileUp,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AiModelsHealthBar } from '../components/ai/AiModelsHealthBar';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import {
  aiApi,
  extractAiErrorMessage,
  KnowledgeDocumentRecord,
  RagChatResponse,
} from '../services/ai.api';
import { enterpriseApi } from '../services/enterprise.api';
import { productApi } from '../services/product.api';
import { DrugInteractionResult } from '../types/enterprise';
import { Product } from '../types/product';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ragData?: RagChatResponse;
  error?: string;
}

const SAMPLE_PROMPTS = [
  { label: 'Hỏi thuốc (Panadol vs Hapacol)', mode: 'DRUG_QA' as const, text: 'Panadol Extra và Hapacol 250mg có thành phần và chống chỉ định khác nhau thế nào?' },
  { label: 'Hỏi thuốc Rx (Augmentin)', mode: 'DRUG_QA' as const, text: 'Augmentin 625mg là thuốc gì, có phải thuốc kê đơn không và chống chỉ định với ai?' },
  { label: 'Triệu chứng: Trẻ sốt cao', mode: 'SYMPTOM_CONSULTATION' as const, text: 'Trẻ em nặng khoảng 20kg bị sốt cao cần dùng hạ sốt gì an toàn và dấu hiệu nào phải đi viện?' },
  { label: 'Triệu chứng: Đau bao tử', mode: 'SYMPTOM_CONSULTATION' as const, text: 'Bệnh nhân bị đau bao tử, ợ chua nóng rát sau xương ức nên dùng nhóm thuốc OTC nào?' },
];

export const ClinicalAiAndInteractionPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'RAG_CHAT' | 'DDI_CHECKER' | 'KNOWLEDGE_BASE'>('RAG_CHAT');

  // 1. Chatbot Dược lâm sàng Qwen 2.5 7B RAG Có Nguồn + Faster-Whisper Voice
  const [chatMode, setChatMode] = useState<'AUTO' | 'DRUG_QA' | 'SYMPTOM_CONSULTATION'>('AUTO');
  const [chatInput, setChatInput] = useState<string>(SAMPLE_PROMPTS[0].text);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [sendingChat, setSendingChat] = useState<boolean>(false);

  const voice = useVoiceRecorder({
    language: 'vi',
    onTranscript: (text) => {
      setChatInput(text);
      toast.success(`Faster-Whisper đã chép giọng nói: "${text}"`);
    },
    onError: (msg) => {
      toast.error(msg);
    },
  });

  // 2. Kiểm tra tương tác & quá liều đa thuốc
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [allergyInput, setAllergyInput] = useState<string>('Penicillin');
  const [interactionResult, setInteractionResult] = useState<DrugInteractionResult | null>(null);
  const [checkingInteraction, setCheckingInteraction] = useState<boolean>(false);

  // 3. Kho tri thức Tờ HDSD & Dược thư kiểm chứng
  const [docs, setDocs] = useState<KnowledgeDocumentRecord[]>([]);
  const [docsTotal, setDocsTotal] = useState<number>(0);
  const [docSearch, setDocSearch] = useState<string>('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('ALL');
  const [loadingDocs, setLoadingDocs] = useState<boolean>(false);
  const [newDoc, setNewDoc] = useState({
    ProductID: '',
    DocType: 'LEAFLET' as 'LEAFLET' | 'GUIDELINE' | 'FAQ',
    Title: '',
    Section: 'Thành phần & Chỉ định',
    Content: '',
    SourceName: 'Tờ HDSD Nhà sản xuất / Dược thư Quốc gia VN',
    SourceRef: '',
  });
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [savingDoc, setSavingDoc] = useState<boolean>(false);

  useEffect(() => {
    const init = async () => {
      try {
        const prodRes = await productApi.list({ page: 1, limit: 120 });
        setAllProducts(prodRes.items);
        if (prodRes.items.length >= 2) {
          const ids = [prodRes.items[0].ProductID, prodRes.items[1].ProductID];
          setSelectedProductIds(ids);
          const checkRes = await enterpriseApi.checkDrugInteractions({
            productIds: ids,
            patientAllergies: 'Penicillin',
          });
          setInteractionResult(checkRes);
        }
      } catch {
        // ignore background init error
      }
    };
    void init();
  }, []);

  const loadKnowledgeDocs = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await aiApi.listKnowledge({
        search: docSearch.trim() || undefined,
        docType: docTypeFilter,
        includeInactive: true,
        page: 1,
        limit: 40,
      });
      setDocs(res.items);
      setDocsTotal(res.pagination.total);
    } catch {
      toast.error('Không tải được danh sách Kho tri thức Dược thư');
    } finally {
      setLoadingDocs(false);
    }
  }, [docSearch, docTypeFilter]);

  useEffect(() => {
    if (subTab === 'KNOWLEDGE_BASE') {
      void loadKnowledgeDocs();
    }
  }, [subTab, loadKnowledgeDocs]);

  const handleSendChat = async (customText?: string, forcedMode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION') => {
    const text = (customText ?? chatInput).trim();
    if (text.length < 2) {
      toast.warning('Vui lòng nhập câu hỏi hoặc mô tả triệu chứng tối thiểu 2 ký tự');
      return;
    }

    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: 'user', content: text };
    const assistantId = `a-${Date.now() + 1}`;
    const historyPayload = chatTurns
      .filter((t) => !t.error)
      .slice(-4)
      .map((t) => ({ role: t.role, content: t.content }));

    setChatTurns((prev) => [
      ...prev,
      userTurn,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    if (!customText) setChatInput('');
    setSendingChat(true);

    try {
      const modeArg = forcedMode || (chatMode === 'AUTO' ? undefined : chatMode);
      await aiApi.chatRagStream(
        {
          message: text,
          mode: modeArg,
          history: historyPayload,
        },
        {
          onMeta: (meta) => {
            setChatTurns((prev) =>
              prev.map((t) => (t.id === assistantId ? { ...t, ragData: meta } : t))
            );
          },
          onDelta: (chunk) => {
            setChatTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId
                  ? {
                      ...t,
                      content: `${t.content}${chunk}`,
                      ragData: t.ragData
                        ? { ...t.ragData, answer: `${t.ragData.answer || ''}${chunk}` }
                        : undefined,
                    }
                  : t
              )
            );
          },
          onDone: (finalData) => {
            setChatTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId
                  ? { ...t, content: finalData.answer, ragData: finalData }
                  : t
              )
            );
          },
        }
      );
    } catch (err) {
      const errMsg = extractAiErrorMessage(
        err,
        'Không kết nối được dịch vụ Trợ lý AI Dược lâm sàng. Vui lòng thử lại sau giây lát.'
      );
      setChatTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId ? { ...t, content: '', ragData: undefined, error: errMsg } : t
        )
      );
      toast.error(errMsg);
    } finally {
      setSendingChat(false);
    }
  };

  const handleCheckInteractions = async (ids = selectedProductIds, allergies = allergyInput) => {
    if (ids.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 dược phẩm để kiểm tra');
      return;
    }
    setCheckingInteraction(true);
    try {
      const res = await enterpriseApi.checkDrugInteractions({
        productIds: ids,
        patientAllergies: allergies,
      });
      setInteractionResult(res);
    } catch {
      toast.error('Không thể kiểm tra tương tác thuốc');
    } finally {
      setCheckingInteraction(false);
    }
  };

  const handleSaveNewKnowledge = async () => {
    if (!newDoc.Title.trim() || !newDoc.Content.trim() || !newDoc.SourceName.trim()) {
      toast.warning('Vui lòng điền đủ Tiêu đề, Nội dung và Nguồn tham chiếu kiểm chứng');
      return;
    }
    setSavingDoc(true);
    try {
      await aiApi.createKnowledge({
        ProductID: newDoc.ProductID ? Number(newDoc.ProductID) : null,
        DocType: newDoc.DocType,
        Title: newDoc.Title,
        Section: newDoc.Section,
        Content: newDoc.Content,
        SourceName: newDoc.SourceName,
        SourceRef: newDoc.SourceRef || null,
      });
      toast.success('Đã lưu tài liệu HDSD mới & đồng bộ cơ sở dữ liệu tra cứu!');
      setNewDoc((p) => ({ ...p, Title: '', Content: '', SourceRef: '' }));
      await loadKnowledgeDocs();
    } catch (err) {
      toast.error(extractAiErrorMessage(err, 'Không lưu được tài liệu Dược thư'));
    } finally {
      setSavingDoc(false);
    }
  };

  const handleUploadKnowledgeFile = async () => {
    if (!uploadingFile) {
      toast.warning('Vui lòng chọn tệp .pdf, .txt hoặc .md');
      return;
    }
    setSavingDoc(true);
    try {
      const res = await aiApi.uploadKnowledgeFile(uploadingFile, {
        ProductID: newDoc.ProductID ? Number(newDoc.ProductID) : null,
        DocType: newDoc.DocType,
        Title: newDoc.Title || undefined,
        Section: newDoc.Section || undefined,
        SourceName: newDoc.SourceName || undefined,
        SourceRef: newDoc.SourceRef || undefined,
      });
      toast.success(`Đã băm & nạp ${res.createdCount} đoạn tài liệu từ tệp "${uploadingFile.name}"!`);
      setUploadingFile(null);
      await loadKnowledgeDocs();
    } catch (err) {
      toast.error(extractAiErrorMessage(err, 'Không nạp được file tài liệu'));
    } finally {
      setSavingDoc(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-teal-600" />
              Trợ Lý AI Dược Lâm Sàng & Kiểm Tra Tương Tác Thuốc
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hỗ trợ tra cứu tờ HDSD, tư vấn triệu chứng lâm sàng có trích dẫn Dược thư Quốc gia và
              kiểm tra tương tác đa hoạt chất.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
            {[
              { id: 'RAG_CHAT' as const, label: 'Tư vấn Lâm sàng AI', icon: Sparkles },
              { id: 'DDI_CHECKER' as const, label: 'Tương tác Thuốc (DDI)', icon: ShieldAlert },
              { id: 'KNOWLEDGE_BASE' as const, label: 'Kho Dược thư / HDSD', icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    subTab === tab.id
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <AiModelsHealthBar compact={subTab !== 'RAG_CHAT'} />
      </div>

      {/* TAB 1: CHATBOT QWEN 2.5 RAG + FASTER-WHISPER VOICE */}
      {subTab === 'RAG_CHAT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Chế độ tư vấn chuyên môn
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { id: 'AUTO' as const, label: 'Tự động phân luồng (Hỏi thuốc / Triệu chứng)' },
                  { id: 'DRUG_QA' as const, label: 'Tra cứu Thông tin & Liều dùng thuốc' },
                  { id: 'SYMPTOM_CONSULTATION' as const, label: 'Tư vấn Triệu chứng lâm sàng OTC' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setChatMode(opt.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      chatMode === opt.id
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500">Câu hỏi tình huống lâm sàng mẫu:</div>
                {SAMPLE_PROMPTS.map((sp) => (
                  <button
                    key={sp.label}
                    type="button"
                    onClick={() => {
                      setChatInput(sp.text);
                      void handleSendChat(sp.text, sp.mode);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-left text-[11px] hover:border-teal-400 hover:bg-teal-50/40"
                  >
                    <div className="font-bold text-teal-700">{sp.label}</div>
                    <div className="text-slate-600 line-clamp-2 mt-0.5">{sp.text}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden min-h-[540px]">
            <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[600px] bg-slate-50/40">
              {chatTurns.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-400">
                  <Bot className="mx-auto h-10 w-10 text-teal-500/70" />
                  <div className="text-sm font-bold text-slate-700">
                    Trợ Lý Tư Vấn Dược Lâm Sàng & Tra Cứu Dược Thư
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Nhập câu hỏi hoặc bấm nút Micro để nói bằng tiếng Việt. Mọi khuyến nghị đều đối
                    chiếu Tờ HDSD và Dược thư Quốc gia trong Kho Tri thức của nhà thuốc.
                  </p>
                </div>
              ) : (
                chatTurns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex gap-2.5 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {turn.role === 'assistant' && (
                      <div className="h-8 w-8 shrink-0 rounded-full bg-teal-600 text-white flex items-center justify-center">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[90%] rounded-2xl p-3.5 text-xs space-y-2.5 shadow-2xs ${
                        turn.role === 'user'
                          ? 'bg-teal-600 text-white'
                          : turn.error
                            ? 'bg-rose-50 border border-rose-300 text-rose-900'
                            : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      {turn.error ? (
                        <div className="space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-rose-700">
                            <AlertOctagon className="h-4 w-4 shrink-0" />
                            Trợ lý AI tạm thời gián đoạn kết nối:
                          </div>
                          <div>{turn.error}</div>
                        </div>
                      ) : turn.role === 'user' ? (
                        <div className="font-medium whitespace-pre-wrap">{turn.content}</div>
                      ) : !turn.ragData ? (
                        <div className="inline-flex items-center gap-2 text-slate-500">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-600" />
                          <span>Đang truy xuất HDSD &amp; khởi tạo luồng trả lời AI...</span>
                        </div>
                      ) : (
                        turn.ragData && (
                          <>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                Trợ lý AI Dược lâm sàng
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                {turn.ragData.mode === 'DRUG_QA' ? 'Tra cứu Dược thư' : 'Tư vấn Triệu chứng'}
                              </span>
                              {turn.ragData.groundingMode === 'GENERAL_MEDICAL' && (
                                <span className="rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                                  Kiến thức Y khoa Mở rộng
                                </span>
                              )}
                              {turn.ragData.emergencyAlert && (
                                <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  CẢNH BÁO CẤP CỨU
                                </span>
                              )}
                              {turn.ragData.insufficientKnowledge && (
                                <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                  Chuyển Dược sĩ (Ngoài phạm vi)
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-sm text-slate-900">
                              {turn.ragData.suspectedCondition}
                            </div>

                            <div className="leading-relaxed whitespace-pre-wrap text-slate-800">
                              {turn.content || turn.ragData.answer || 'Đang tổng hợp...'}
                            </div>

                            {turn.ragData.warnings.length > 0 && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 space-y-1">
                                <div className="font-bold flex items-center gap-1">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                  Lưu ý / Chống chỉ định:
                                </div>
                                <ul className="list-disc pl-4 space-y-0.5">
                                  {turn.ragData.warnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Trích dẫn nguồn DOC-id */}
                            {turn.ragData.citations.length > 0 && (
                              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                                <div className="text-[11px] font-bold text-teal-800 flex items-center gap-1">
                                  <BookOpen className="h-3.5 w-3.5" />
                                  Nguồn Tài Liệu Kiểm Chứng Đã Trích Dẫn ({turn.ragData.citations.length}):
                                </div>
                                <div className="grid grid-cols-1 gap-1.5">
                                  {turn.ragData.citations.map((cit) => (
                                    <div
                                      key={cit.docId}
                                      className="rounded-lg border border-teal-200 bg-teal-50/40 p-2 text-[11px]"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-teal-900">
                                        <span>
                                          [DOC-{cit.docId}] {cit.title} — {cit.section}
                                        </span>
                                        <span className="text-[10px] font-mono text-slate-600">
                                          {cit.sourceRef || cit.docType}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-600 mt-0.5">
                                        Nguồn: {cit.sourceName}
                                      </div>
                                      <div className="text-slate-700 mt-1 line-clamp-3">
                                        {cit.snippet}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Thuốc liên quan trong kho */}
                            {turn.ragData.suggestedProducts.length > 0 && (
                              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                                <div className="text-[11px] font-bold text-slate-700">
                                  Sản phẩm khớp tồn kho hiện tại:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {turn.ragData.suggestedProducts.map((sp) => (
                                    <div
                                      key={sp.ProductID}
                                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]"
                                    >
                                      <div className="font-bold text-slate-900">{sp.ProductName}</div>
                                      <div className="mt-0.5 flex items-center justify-between text-[10px]">
                                        <span
                                          className={`font-bold ${
                                            sp.IsRx ? 'text-rose-700' : 'text-emerald-700'
                                          }`}
                                        >
                                          {sp.IsRx ? 'Thuốc Kê Đơn (Rx)' : 'OTC Không Kê Đơn'}
                                        </span>
                                        <span className="text-slate-600">
                                          {sp.Price.toLocaleString('vi-VN')}đ • Tồn: {sp.TotalStock}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="text-[10px] text-slate-400 italic pt-1">
                              {turn.ragData.disclaimer}
                            </div>
                          </>
                        )
                      )}
                    </div>
                    {turn.role === 'user' && (
                      <div className="h-8 w-8 shrink-0 rounded-full bg-slate-700 text-white flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Khung nhập câu hỏi + Micro giọng nói */}
            <div className="border-t border-slate-200 bg-white p-3 space-y-2">
              {voice.isRecording && (
                <div className="text-[11px] font-bold text-rose-600 animate-pulse">
                  ● Đang thu âm micro... Bấm lại nút Micro để dừng và nhận diện giọng nói tiếng Việt.
                </div>
              )}
              {voice.isTranscribing && (
                <div className="text-[11px] font-bold text-indigo-600 flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Đang chuyển giọng nói tiếng Việt thành văn bản...
                </div>
              )}
              {voice.error && (
                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                  Lỗi Micro: {voice.error}
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={voice.toggleRecording}
                  disabled={voice.isTranscribing || sendingChat}
                  title="Nhập câu hỏi bằng giọng nói tiếng Việt"
                  className={`shrink-0 rounded-lg border px-3 py-2.5 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                    voice.isRecording
                      ? 'border-rose-500 bg-rose-600 text-white hover:bg-rose-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {voice.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  <span className="hidden sm:inline">
                    {voice.isRecording ? 'Dừng ghi âm' : 'Ghi âm'}
                  </span>
                </button>

                <textarea
                  rows={2}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChat();
                    }
                  }}
                  placeholder="Hỏi thông tin thuốc, liều dùng, chống chỉ định hoặc mô tả triệu chứng..."
                  className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => void handleSendChat()}
                  disabled={sendingChat || chatInput.trim().length < 2}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50"
                >
                  {sendingChat ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Gửi câu hỏi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KIỂM TRA TƯƠNG TÁC & QUÁ LIỀU ĐA THUỐC (DDI ENGINE) */}
      {subTab === 'DDI_CHECKER' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Chọn Danh Sách Thuốc Phối Hợp & Dị Ứng
            </h3>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Tiền sử dị ứng bệnh nhân (phân cách bằng dấu phẩy)
              </label>
              <input
                type="text"
                value={allergyInput}
                onChange={(e) => setAllergyInput(e.target.value)}
                placeholder="VD: Penicillin, Ibuprofen, Aspirin"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Thêm thuốc vào toa cần kiểm tra DDI
              </label>
              <select
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && !selectedProductIds.includes(id)) {
                    setSelectedProductIds((prev) => [...prev, id]);
                  }
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white focus:border-teal-500 focus:outline-none"
              >
                <option value="">-- Chọn thuốc để thêm --</option>
                {allProducts.map((p) => (
                  <option key={p.ProductID} value={p.ProductID}>
                    {p.ProductName} ({p.ProductType})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selectedProductIds.map((pid) => {
                const prod = allProducts.find((p) => p.ProductID === pid);
                return (
                  <span
                    key={pid}
                    className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-[11px] font-semibold text-teal-800"
                  >
                    {prod?.ProductName || `#${pid}`}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedProductIds((prev) => prev.filter((x) => x !== pid))
                      }
                    >
                      <X className="h-3 w-3 text-teal-600 hover:text-rose-600" />
                    </button>
                  </span>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void handleCheckInteractions()}
              disabled={checkingInteraction || selectedProductIds.length === 0}
              className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {checkingInteraction ? 'Đang quét tương tác DDI...' : 'Chạy Kiểm Tra Tương Tác & Quá Liều'}
            </button>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Kết Quả Phân Tích An Toàn Dược</h3>
            {interactionResult ? (
              <div className="space-y-3">
                <div
                  className={`rounded-lg border p-3 text-xs font-semibold flex items-center gap-2 ${
                    interactionResult.isSafe
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-300 bg-rose-50 text-rose-800'
                  }`}
                >
                  {interactionResult.isSafe ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  )}
                  {interactionResult.isSafe
                    ? 'Không phát hiện tương tác nghiêm trọng hay dị ứng chéo trong toa.'
                    : `CẢNH BÁO: Phát hiện ${interactionResult.warnings.length} nguy cơ dị ứng / trùng hoạt chất / tương tác cần Dược sĩ xử trí!`}
                </div>

                {interactionResult.warnings.map((w, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs space-y-1"
                  >
                    <div className="font-bold text-amber-900">
                      [{w.severity}] {w.title}
                    </div>
                    <div className="text-slate-700">{w.detail}</div>
                    <div className="text-teal-800 font-semibold">Khuyến cáo: {w.recommendation}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-8 text-center">
                Chọn danh sách thuốc bên trái và bấm Kiểm tra.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: QUẢN LÝ KHO TRI THỨC TỜ HDSD & DƯỢC THƯ */}
      {subTab === 'KNOWLEDGE_BASE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-teal-600" />
              Nạp Tài Liệu Dược Thư / Tờ HDSD Mới
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Loại tài liệu</label>
                <select
                  value={newDoc.DocType}
                  onChange={(e) =>
                    setNewDoc((p) => ({
                      ...p,
                      DocType: e.target.value as 'LEAFLET' | 'GUIDELINE' | 'FAQ',
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="LEAFLET">Tờ HDSD Thuốc (LEAFLET)</option>
                  <option value="GUIDELINE">Phác đồ Lâm sàng (GUIDELINE)</option>
                  <option value="FAQ">FAQ Nhà thuốc</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                  Gắn sản phẩm (tùy chọn)
                </label>
                <select
                  value={newDoc.ProductID}
                  onChange={(e) => setNewDoc((p) => ({ ...p, ProductID: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="">-- Tài liệu chung --</option>
                  {allProducts.map((p) => (
                    <option key={p.ProductID} value={p.ProductID}>
                      {p.ProductName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Tiêu đề tài liệu *"
                value={newDoc.Title}
                onChange={(e) => setNewDoc((p) => ({ ...p, Title: e.target.value }))}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="Tên mục (VD: Liều dùng & Cách dùng)"
                value={newDoc.Section}
                onChange={(e) => setNewDoc((p) => ({ ...p, Section: e.target.value }))}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Nguồn kiểm chứng * (VD: Dược thư QG 2022)"
                value={newDoc.SourceName}
                onChange={(e) => setNewDoc((p) => ({ ...p, SourceName: e.target.value }))}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="Số ĐK / Mã tài liệu (tùy chọn)"
                value={newDoc.SourceRef}
                onChange={(e) => setNewDoc((p) => ({ ...p, SourceRef: e.target.value }))}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
              />
            </div>

            <textarea
              rows={4}
              placeholder="Nội dung chuyên môn chính xác đã kiểm duyệt..."
              value={newDoc.Content}
              onChange={(e) => setNewDoc((p) => ({ ...p, Content: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
            />

            <button
              type="button"
              disabled={savingDoc}
              onClick={() => void handleSaveNewKnowledge()}
              className="w-full rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {savingDoc ? 'Đang lưu & đồng bộ...' : 'Lưu Tài Liệu & Đồng Bộ Dữ Liệu'}
            </button>

            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileUp className="h-4 w-4 text-indigo-600" />
                Hoặc Nạp File Tờ HDSD (.pdf, .txt, .md)
              </div>
              <input
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => setUploadingFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600"
              />
              <button
                type="button"
                disabled={savingDoc || !uploadingFile}
                onClick={() => void handleUploadKnowledgeFile()}
                className="w-full rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                Trích Xuất Tài Liệu & Đồng Bộ Kho Dược Thư
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Database className="h-4 w-4 text-teal-600" />
                Kho Tài Liệu Dược Thư & HDSD ({docsTotal} mục)
              </h3>
              <div className="flex items-center gap-2">
                <select
                  value={docTypeFilter}
                  onChange={(e) => setDocTypeFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white"
                >
                  <option value="ALL">Tất cả loại</option>
                  <option value="LEAFLET">Tờ HDSD (LEAFLET)</option>
                  <option value="GUIDELINE">Phác đồ (GUIDELINE)</option>
                  <option value="FAQ">FAQ</option>
                </select>
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Tìm kiếm tài liệu..."
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                />
              </div>
            </div>

            {loadingDocs ? (
              <div className="py-10 text-center text-xs text-slate-400">Đang tải Kho tri thức...</div>
            ) : (
              <div className="max-h-[540px] overflow-y-auto space-y-2 pr-1">
                {docs.map((d) => (
                  <div
                    key={d.DocID}
                    className={`rounded-lg border p-3 text-xs space-y-1 ${
                      d.IsActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-100 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-teal-700 mr-1.5">
                          [DOC-{d.DocID}]
                        </span>
                        <span className="font-bold text-slate-900">{d.Title}</span>
                        <span className="text-slate-500"> — {d.Section}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await aiApi.toggleKnowledge(d.DocID, !d.IsActive);
                          await loadKnowledgeDocs();
                        }}
                        className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                          d.IsActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {d.IsActive ? 'Đang bật' : 'Đã tắt'}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-700">{d.Content}</div>
                    <div className="text-[10px] text-slate-500">
                      Nguồn: {d.SourceName} {d.SourceRef ? `(${d.SourceRef})` : ''} • Duyệt: {d.VerifiedBy}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
