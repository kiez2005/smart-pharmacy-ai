import React, { useRef, useState } from 'react';
import {
  ScanLine,
  Stethoscope,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Mic,
  Send,
  Receipt,
  Cpu,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { DiagnoseChatResponse, OcrPrescriptionResponse } from '../types/ai';
import { aiApi } from '../services/ai.api';
import { formsApi } from '../services/forms.api';

interface ChatTurn {
  role: 'user' | 'assistant';
  text?: string;
  diagnosisData?: DiagnoseChatResponse;
}

const SYMPTOM_PRESETS = [
  'Mình bị sốt 38.5 độ, đau đầu, nhức mỏi người từ hôm qua',
  'Đau rát cổ họng, ho có đờm đặc và nghẹt mũi',
  'Đau thượng vị dạ dày, ợ chua, trào ngược sau khi ăn',
  'Hắt hơi liên tục, chảy nước mũi trong, nổi mề đay ngứa',
];

export const AiPharmacyStudioPage: React.FC = () => {
  // State cho Module 1: OpenCV + OCR Đơn thuốc
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrResult, setOcrResult] = useState<OcrPrescriptionResponse | null>(null);
  const [patientName, setPatientName] = useState<string>('Bệnh nhân Đơn thuốc OCR');
  const [creatingInvoice, setCreatingInvoice] = useState<boolean>(false);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  // State cho Module 2: Chatbot Chẩn đoán Y tế (Scikit-learn TF-IDF) + Voice
  const [symptomInput, setSymptomInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([
    {
      role: 'assistant',
      text: 'Xin chào! Tôi là Trợ lý Dược sĩ AI (vận hành bởi Scikit-learn TF-IDF & Cosine Similarity). Hãy mô tả triệu chứng của bạn bằng văn bản hoặc giọng nói để tôi chẩn đoán sơ bộ và đối chiếu thuốc đang còn tồn kho!',
    },
  ]);

  // Xử lý tải ảnh đơn thuốc thật
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const res = await aiApi.scanPrescription(file);
      setOcrResult(res);
      toast.success('Đã xử lý ảnh bằng OpenCV và bóc tách đơn thuốc thành công!');
    } catch {
      toast.error('Lỗi khi phân tích ảnh đơn thuốc');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  };

  // Xử lý chọn nhanh đơn thuốc mẫu khi demo trước giảng viên
  const handlePresetOcr = async (presetHint: string, label: string) => {
    setOcrLoading(true);
    try {
      const res = await aiApi.scanPrescription(null, presetHint);
      setOcrResult(res);
      setPatientName(`Bệnh nhân (${label})`);
      toast.success(`Đã quét OCR mẫu "${label}" và đối chiếu tồn kho Product!`);
    } catch {
      toast.error('Lỗi khi chạy mẫu OCR');
    } finally {
      setOcrLoading(false);
    }
  };

  // 1-Click chuyển toàn bộ thuốc vừa quét OCR thành Hóa đơn bán hàng & trừ tồn kho
  const handleCreateInvoiceFromOcr = async () => {
    if (!ocrResult) return;
    const validItems = ocrResult.items.filter((i) => i.matchedProduct !== null);
    if (validItems.length === 0) {
      toast.warning('Không có sản phẩm nào khớp trong kho để tạo hóa đơn');
      return;
    }

    setCreatingInvoice(true);
    try {
      const created = await formsApi.createInvoice({
        CustomerName: patientName || 'Khách hàng Đơn thuốc OCR',
        CustomerPhone: '0988112233',
        Note: 'Xuất tự động từ Trạm AI OCR Đơn thuốc',
        PaymentMethod: 'VIETQR',
        items: validItems.map((it) => ({
          ProductID: it.matchedProduct!.ProductID,
          Quantity: it.quantity,
          DosageNote: it.dosage,
        })),
      });
      toast.success(
        `Đã lập Hóa đơn ${created.InvoiceCode} (${created.TotalAmount.toLocaleString('vi-VN')} ₫) từ đơn thuốc OCR!`
      );
    } catch {
      toast.error('Lỗi khi tạo hóa đơn từ kết quả OCR');
    } finally {
      setCreatingInvoice(false);
    }
  };

  // Gửi triệu chứng cho AI Chẩn đoán sơ bộ
  const handleSendSymptom = async (customText?: string) => {
    const query = (customText ?? symptomInput).trim();
    if (!query) return;

    setChatHistory((prev) => [...prev, { role: 'user', text: query }]);
    if (!customText) setSymptomInput('');
    setChatLoading(true);

    try {
      const res = await aiApi.diagnoseSymptoms(query);
      setChatHistory((prev) => [...prev, { role: 'assistant', diagnosisData: res }]);
    } catch {
      toast.error('Lỗi khi gọi AI Chẩn đoán triệu chứng');
    } finally {
      setChatLoading(false);
    }
  };

  // Trợ lý Giọng nói Tiếng Việt (Gợi ý AI #4)
  const handleVoiceSymptom = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Trình duyệt không hỗ trợ nhận diện giọng nói Web Speech API');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      toast.info('🎙️ Hãy nói triệu chứng của bạn bằng tiếng Việt...');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const text = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (text) {
        setSymptomInput(text);
        void handleSendSymptom(text);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* ====================================================================
          CỘT TRÁI (6 CỘT): AI #1 - OPENCV + OCR QUÉT ĐƠN THUỐC BÁC SĨ
         ==================================================================== */}
      <div className="lg:col-span-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                AI Module 1: Quét OCR Đơn Thuốc (OpenCV Pipeline)
              </h2>
              <p className="text-xs text-slate-500">
                Gợi ý AI #1 trong Sheet: Trích chọn ảnh đơn thuốc sang văn bản & khớp bảng Product
              </p>
            </div>
          </div>
        </div>

        {/* Khu vực tải ảnh hoặc chọn mẫu thử nhanh */}
        <div className="rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/40 p-5 text-center space-y-3">
          <input
            ref={ocrFileRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => ocrFileRef.current?.click()}
            disabled={ocrLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-teal-700"
          >
            <Upload className="h-4 w-4" />
            <span>{ocrLoading ? 'Đang chạy OpenCV & OCR...' : 'Tải Ảnh Đơn Thuốc Lên Để Quét OCR'}</span>
          </button>

          <div className="text-xs text-slate-500">
            Hoặc bấm chọn nhanh <strong>Đơn thuốc mẫu</strong> để biểu diễn trực tiếp khi chấm thi:
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void handlePresetOcr('cam-cum', 'Đơn Sốt Siêu Vi & Viêm Họng')}
              className="rounded-xl border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              📄 Mẫu 1: Đơn Cảm cúm - Viêm họng
            </button>
            <button
              type="button"
              onClick={() => void handlePresetOcr('da-day', 'Đơn Viêm Dạ Dày GERD')}
              className="rounded-xl border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              📄 Mẫu 2: Đơn Dạ dày - Tiêu hóa
            </button>
            <button
              type="button"
              onClick={() => void handlePresetOcr('di-ung', 'Đơn Viêm Mũi Xoang Dị Ứng')}
              className="rounded-xl border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              📄 Mẫu 3: Đơn Dị ứng - Tai Mũi Họng
            </button>
          </div>
        </div>

        {/* Hiển thị kết quả tiền xử lý OpenCV & danh sách thuốc khớp DB */}
        {ocrResult && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-900 p-4 text-white space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-teal-400">
                  <Cpu className="h-4 w-4" />
                  <span>Pipeline Xử Lý Ảnh: {ocrResult.engine.toUpperCase()}</span>
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                  Sharpness: {ocrResult.opencvPreprocessing.sharpnessScore}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                {ocrResult.opencvPreprocessing.steps.map((step) => (
                  <div key={step} className="rounded bg-slate-800/80 px-2.5 py-1 font-mono">
                    ✓ {step}
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-300 whitespace-pre-line border border-slate-800">
                <div className="text-[10px] uppercase text-slate-400 mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Văn bản trích xuất từ ảnh đơn thuốc (Raw OCR Text):
                </div>
                {ocrResult.rawOcrText}
              </div>
            </div>

            {/* Bảng đối chiếu với bảng Product trong Database */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Kết Quả Tự Động Khớp Tồn Kho Bảng Product ({ocrResult.items.length} loại thuốc)
              </div>

              {ocrResult.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-sm text-slate-900">
                        {item.matchedProduct
                          ? `${item.matchedProduct.ProductName} (#${item.matchedProduct.ProductID})`
                          : item.keyword}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 pl-6">
                      Liều dùng OCR: <em>{item.dosage}</em>
                    </div>
                  </div>

                  {item.matchedProduct && (
                    <div className="text-right shrink-0">
                      <div className="text-xs font-extrabold text-teal-700">
                        SL: {item.quantity} {item.matchedProduct.Unit} ×{' '}
                        {item.matchedProduct.Price.toLocaleString('vi-VN')} ₫
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Tồn kho: {item.matchedProduct.Quantity}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Nút 1-Click chuyển thành Hóa đơn bán thuốc */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Tên bệnh nhân trên đơn thuốc..."
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
              <button
                type="button"
                disabled={creatingInvoice}
                onClick={() => void handleCreateInvoiceFromOcr()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700"
              >
                <Receipt className="h-4 w-4" />
                <span>
                  {creatingInvoice ? 'Đang tạo HĐ...' : 'Lập Hóa Đơn & Xuất Kho Ngay'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          CỘT PHẢI (6 CỘT): AI #2, #3, #4, #5 - CHẨN ĐOÁN Y TẾ & CHATBOT RAG
         ==================================================================== */}
      <div className="lg:col-span-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200 flex flex-col justify-between space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  AI Module 2: Chẩn Đoán Sơ Bộ & Chatbot Dược Sĩ (TF-IDF RAG)
                </h2>
                <p className="text-xs text-slate-500">
                  Gợi ý AI #2, #3, #4, #5: Chẩn đoán triệu chứng, gợi ý thuốc tồn kho & Giọng nói
                </p>
              </div>
            </div>
          </div>

          {/* Gợi ý triệu chứng bấm nhanh */}
          <div className="flex flex-wrap gap-1.5">
            {SYMPTOM_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => void handleSendSymptom(preset)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
              >
                + {preset}
              </button>
            ))}
          </div>

          {/* Khung hội thoại Chẩn đoán Y tế */}
          <div className="space-y-3 max-h-[430px] overflow-y-auto pr-1">
            {chatHistory.map((turn, index) => (
              <div
                key={index}
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {turn.role === 'user' ? (
                  <div className="max-w-md rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm">
                    {turn.text}
                  </div>
                ) : turn.text ? (
                  <div className="max-w-lg rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-700 leading-relaxed">
                    {turn.text}
                  </div>
                ) : turn.diagnosisData ? (
                  <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 font-extrabold text-indigo-900 text-sm">
                        <Sparkles className="h-4 w-4 text-indigo-600" />
                        Chẩn đoán sơ bộ: {turn.diagnosisData.preliminaryDiagnosis}
                      </span>
                      <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-800">
                        {turn.diagnosisData.engine}
                      </span>
                    </div>

                    <p className="text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-indigo-100">
                      <strong>Phác đồ tư vấn Dược lâm sàng:</strong>{' '}
                      {turn.diagnosisData.clinicalAdvice}
                    </p>

                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-amber-900 border border-amber-200">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Cảnh báo chống chỉ định:</strong>{' '}
                        {turn.diagnosisData.contraindicationWarning}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="font-bold text-slate-700 uppercase text-[11px]">
                        Thuốc không kê đơn (OTC) khớp nhất trong bảng Product:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {turn.diagnosisData.recommendedProducts.map((prod) => (
                          <div
                            key={prod.ProductID}
                            className="rounded-xl bg-white p-2.5 border border-slate-200 flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-slate-900 line-clamp-1">
                                  {prod.ProductName}
                                </span>
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 shrink-0">
                                  {Math.round(prod.similarityScore * 100)}% khớp
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                {prod.Description}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100">
                              <span className="font-extrabold text-teal-700">
                                {prod.Price.toLocaleString('vi-VN')} ₫/{prod.Unit}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Kho: {prod.Quantity}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {chatLoading && (
              <div className="text-xs text-slate-400 italic">
                Đang tính độ tương đồng Cosine Similarity (TF-IDF) với kho thuốc...
              </div>
            )}
          </div>
        </div>

        {/* Ô nhập triệu chứng + Nút Micro Giọng nói */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendSymptom();
          }}
          className="flex items-center gap-2 pt-3 border-t border-slate-100"
        >
          <button
            type="button"
            onClick={handleVoiceSymptom}
            title="Nhập triệu chứng bằng Giọng nói Tiếng Việt"
            className={`rounded-xl p-2.5 transition ${
              isListening
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            <Mic className="h-4 w-4" />
          </button>
          <input
            type="text"
            value={symptomInput}
            onChange={(e) => setSymptomInput(e.target.value)}
            placeholder="Nhập triệu chứng bệnh (VD: sốt nhẹ, đau họng, tiêu chảy, dị ứng)..."
            className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={chatLoading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700"
          >
            <Send className="h-4 w-4" />
            <span>Chẩn đoán AI</span>
          </button>
        </form>
      </div>
    </div>
  );
};
