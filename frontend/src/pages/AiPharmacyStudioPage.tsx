import React, { useRef, useState } from 'react';
import {
  ScanLine,
  Stethoscope,
  Upload,
  Check,
  AlertTriangle,
  Mic,
  Send,
  FileText,
  ArrowRight,
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
  'Sốt 38.5 độ, đau đầu, mỏi cơ từ hôm qua',
  'Đau rát họng, ho có đờm đặc, nghẹt mũi',
  'Đau thượng vị dạ dày, ợ chua sau ăn',
  'Hắt hơi liên tục, ngứa mũi, nổi mề đay',
];

export const AiPharmacyStudioPage: React.FC = () => {
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrResult, setOcrResult] = useState<OcrPrescriptionResponse | null>(null);
  const [patientName, setPatientName] = useState<string>('Khách lẻ theo đơn');
  const [creatingInvoice, setCreatingInvoice] = useState<boolean>(false);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  const [symptomInput, setSymptomInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([
    {
      role: 'assistant',
      text: 'Nhập các triệu chứng lâm sàng của người bệnh để hệ thống phân tích phác đồ sơ bộ và tra cứu các thuốc không kê đơn (OTC) đang còn tồn kho.',
    },
  ]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const res = await aiApi.scanPrescription(file);
      setOcrResult(res);
      toast.success('Đã hoàn tất số hóa đơn thuốc và đối chiếu danh mục kho');
    } catch {
      toast.error('Không thể phân tích tệp ảnh tải lên');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  };

  const handlePresetOcr = async (presetHint: string, label: string) => {
    setOcrLoading(true);
    try {
      const res = await aiApi.scanPrescription(null, presetHint);
      setOcrResult(res);
      setPatientName(label);
      toast.success(`Đã nạp dữ liệu đơn thuốc: ${label}`);
    } catch {
      toast.error('Không thể nạp mẫu đơn thuốc');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleCreateInvoiceFromOcr = async () => {
    if (!ocrResult) return;
    const validItems = ocrResult.items.filter((i) => i.matchedProduct !== null);
    if (validItems.length === 0) {
      toast.warning('Không có sản phẩm nào khớp trong kho');
      return;
    }

    setCreatingInvoice(true);
    try {
      const created = await formsApi.createInvoice({
        CustomerName: patientName || 'Khách hàng theo đơn',
        CustomerPhone: '0988112233',
        Note: 'Xuất bán từ phân hệ số hóa đơn thuốc OCR',
        PaymentMethod: 'VIETQR',
        items: validItems.map((it) => ({
          ProductID: it.matchedProduct!.ProductID,
          Quantity: it.quantity,
          DosageNote: it.dosage,
        })),
      });
      toast.success(
        `Đã tạo chứng từ ${created.InvoiceCode} (${created.TotalAmount.toLocaleString('vi-VN')} ₫)`
      );
    } catch {
      toast.error('Không thể tạo chứng từ từ kết quả quét');
    } finally {
      setCreatingInvoice(false);
    }
  };

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
      toast.error('Không thể kết nối dịch vụ phân tích lâm sàng');
    } finally {
      setChatLoading(false);
    }
  };

  const handleVoiceSymptom = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Trình duyệt không hỗ trợ nhận diện giọng nói');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      toast.info('Đang nghe mô tả triệu chứng...');
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
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
          Số hóa đơn thuốc (OCR) & Hỗ trợ quyết định lâm sàng
        </h1>
        <p className="text-[13px] text-zinc-500 mt-0.5">
          Bóc tách tự động đơn thuốc từ hình ảnh và gợi ý dược phẩm theo triệu chứng bệnh học
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* CỘT TRÁI: BÓC TÁCH ĐƠN THUỐC TỪ ẢNH */}
        <div className="lg:col-span-6 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-zinc-100 pb-3">
            <ScanLine className="h-4 w-4 text-zinc-700" strokeWidth={1.75} />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Nhận diện & Bóc tách đơn thuốc (OCR)
              </h2>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-5 text-center space-y-3">
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
              className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-4 text-[13px] font-medium text-white hover:bg-zinc-800 transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{ocrLoading ? 'Đang xử lý ảnh...' : 'Tải ảnh đơn thuốc lên'}</span>
            </button>

            <div className="text-xs text-zinc-400">
              Hoặc chọn nhanh kịch bản đơn thuốc ngoại trú để kiểm thử:
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => void handlePresetOcr('cam-cum', 'Đơn ngoại trú Hô hấp - Sốt')}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Đơn Hô hấp & Sốt
              </button>
              <button
                type="button"
                onClick={() => void handlePresetOcr('da-day', 'Đơn ngoại trú Tiêu hóa - Dạ dày')}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Đơn Dạ dày & Tiêu hóa
              </button>
              <button
                type="button"
                onClick={() => void handlePresetOcr('di-ung', 'Đơn ngoại trú Tai Mũi Họng')}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Đơn Tai Mũi Họng
              </button>
            </div>
          </div>

          {ocrResult && (
            <div className="space-y-4">
              <div className="rounded-md bg-zinc-900 p-3.5 text-white space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Văn bản nhận diện sau tiền xử lý OpenCV
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    Độ nét: {ocrResult.opencvPreprocessing.sharpnessScore}
                  </span>
                </div>

                <div className="rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-300 whitespace-pre-line border border-zinc-800">
                  {ocrResult.rawOcrText}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-500">
                  Đối chiếu tự động với tồn kho ({ocrResult.items.length} mặt hàng)
                </div>

                <div className="divide-y divide-zinc-200/70 rounded-md border border-zinc-200">
                  {ocrResult.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 p-3 bg-white"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                          <span className="font-medium text-[13px] text-zinc-900">
                            {item.matchedProduct
                              ? item.matchedProduct.ProductName
                              : item.keyword}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 pl-5">
                          Chỉ dẫn: {item.dosage}
                        </div>
                      </div>

                      {item.matchedProduct && (
                        <div className="text-right shrink-0 tabular-nums">
                          <div className="text-[13px] font-medium text-zinc-900">
                            {item.quantity} {item.matchedProduct.Unit} ×{' '}
                            {item.matchedProduct.Price.toLocaleString('vi-VN')} ₫
                          </div>
                          <div className="text-xs text-zinc-400">
                            Tồn kho: {item.matchedProduct.Quantity}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Tên bệnh nhân..."
                  className="flex-1 h-9 rounded-md border border-zinc-200 px-3 text-[13px]"
                />
                <button
                  type="button"
                  disabled={creatingInvoice}
                  onClick={() => void handleCreateInvoiceFromOcr()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-[13px] font-medium text-white hover:bg-zinc-800 transition-colors"
                >
                  <span>{creatingInvoice ? 'Đang xử lý...' : 'Tạo phiếu xuất kho'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CỘT PHẢI: PHÂN TÍCH TRIỆU CHỨNG & TRA CỨU DƯỢC LÂM SÀNG */}
        <div className="lg:col-span-6 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-zinc-100 pb-3">
              <Stethoscope className="h-4 w-4 text-zinc-700" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-zinc-900">
                Tra cứu triệu chứng & Gợi ý dược phẩm (TF-IDF Similarity)
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SYMPTOM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => void handleSendSymptom(preset)}
                  className="rounded-md border border-zinc-200 bg-zinc-50/70 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {chatHistory.map((turn, index) => (
                <div
                  key={index}
                  className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {turn.role === 'user' ? (
                    <div className="max-w-md rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] text-white">
                      {turn.text}
                    </div>
                  ) : turn.text ? (
                    <div className="max-w-lg rounded-lg bg-zinc-100/80 px-3.5 py-2.5 text-[13px] text-zinc-700 leading-relaxed">
                      {turn.text}
                    </div>
                  ) : turn.diagnosisData ? (
                    <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 space-y-3 text-[13px]">
                      <div className="flex items-center justify-between border-b border-zinc-200/70 pb-2">
                        <span className="font-semibold text-zinc-900">
                          Nhận định sơ bộ: {turn.diagnosisData.preliminaryDiagnosis}
                        </span>
                      </div>

                      <p className="text-zinc-700 leading-relaxed">
                        {turn.diagnosisData.clinicalAdvice}
                      </p>

                      <div className="flex items-start gap-2 rounded-md bg-amber-50/80 p-2.5 text-xs text-amber-900 border border-amber-200/80">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>{turn.diagnosisData.contraindicationWarning}</span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="text-xs font-medium text-zinc-500">
                          Dược phẩm phù hợp đang có sẵn trong kho:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {turn.diagnosisData.recommendedProducts.map((prod) => (
                            <div
                              key={prod.ProductID}
                              className="rounded-md bg-white p-2.5 border border-zinc-200 flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-medium text-zinc-900 text-xs line-clamp-1">
                                    {prod.ProductName}
                                  </span>
                                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700 shrink-0 tabular-nums">
                                    {Math.round(prod.similarityScore * 100)}%
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">
                                  {prod.Description}
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-100 text-xs tabular-nums">
                                <span className="font-medium text-zinc-900">
                                  {prod.Price.toLocaleString('vi-VN')} ₫/{prod.Unit}
                                </span>
                                <span className="text-zinc-400">Tồn: {prod.Quantity}</span>
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
                <div className="text-xs text-zinc-400">Đang phân tích dữ liệu...</div>
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendSymptom();
            }}
            className="flex items-center gap-2 pt-3 border-t border-zinc-100"
          >
            <button
              type="button"
              onClick={handleVoiceSymptom}
              title="Nhập bằng giọng nói"
              className={`h-9 w-9 flex items-center justify-center rounded-md border transition-colors ${
                isListening
                  ? 'bg-rose-500 border-rose-500 text-white animate-pulse'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={symptomInput}
              onChange={(e) => setSymptomInput(e.target.value)}
              placeholder="Mô tả triệu chứng lâm sàng..."
              className="flex-1 h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Phân tích</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
