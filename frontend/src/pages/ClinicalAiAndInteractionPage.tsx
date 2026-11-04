import React, { useEffect, useState } from 'react';
import {
  Stethoscope,
  ShieldAlert,
  Send,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiApi, DiagnoseChatResponse } from '../services/ai.api';
import { enterpriseApi } from '../services/enterprise.api';
import { productApi } from '../services/product.api';
import { Product } from '../types/product';
import { DrugInteractionResult } from '../types/enterprise';

const SYMPTOM_PRESETS = [
  'Bệnh nhân sốt 38.5 độ, đau đầu mỏi cơ và đau rát họng từ tối qua',
  'Đau thượng vị dạ dày, ợ chua nóng rát ngực sau khi ăn đồ cay',
  'Ho có đờm đặc, ngạt mũi, khàn tiếng kéo dài 3 ngày',
  'Nổi mề đay ngứa da, hắt hơi sổ mũi liên tục khi thay đổi thời tiết',
];

export const ClinicalAiAndInteractionPage: React.FC = () => {
  // 1. Trợ lý Chẩn đoán Triệu chứng TF-IDF
  const [symptomInput, setSymptomInput] = useState<string>(SYMPTOM_PRESETS[0]);
  const [diagnosing, setDiagnosing] = useState<boolean>(false);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseChatResponse | null>(null);

  // 2. Công cụ Kiểm tra Tương tác & Quá liều Đa thuốc
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([1, 2]);
  const [allergyInput, setAllergyInput] = useState<string>('Penicillin');
  const [interactionResult, setInteractionResult] = useState<DrugInteractionResult | null>(null);
  const [checkingInteraction, setCheckingInteraction] = useState<boolean>(false);

  useEffect(() => {
    const init = async () => {
      try {
        const prodRes = await productApi.list({ page: 1, limit: 100 });
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
        // Ignore silent init error
      }
    };
    void init();
  }, []);

  const handleRunDiagnosis = async (text = symptomInput) => {
    if (!text.trim()) return;
    setDiagnosing(true);
    try {
      const res = await aiApi.diagnoseSymptoms(text);
      setDiagnoseResult(res);
    } catch {
      toast.error('Không thể thực hiện phân tích triệu chứng lâm sàng');
    } finally {
      setDiagnosing(false);
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

  const handleAddDrugToCheck = (productId: number) => {
    if (selectedProductIds.includes(productId)) return;
    const next = [...selectedProductIds, productId];
    setSelectedProductIds(next);
    void handleCheckInteractions(next, allergyInput);
  };

  const handleRemoveDrugFromCheck = (productId: number) => {
    const next = selectedProductIds.filter((id) => id !== productId);
    setSelectedProductIds(next);
    if (next.length > 0) {
      void handleCheckInteractions(next, allergyInput);
    } else {
      setInteractionResult(null);
    }
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Trợ Lý Dược Lâm Sàng AI & Kiểm Tra Tương Tác Đa Thuốc
          </h1>
          <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
            TF-IDF RAG & DDI Check
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Gợi ý phác đồ điều trị theo triệu chứng bằng Scikit-learn TF-IDF & Cosine Similarity, kết hợp kiểm tra trùng lặp hoạt chất và xung đột dị ứng.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Cột Trái (6 cols): Trợ lý Chẩn đoán Triệu chứng TF-IDF */}
        <div className="lg:col-span-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-zinc-900" />
              <h2 className="text-sm font-semibold text-zinc-900">
                1. Phân Tích Triệu Chứng & Gợi Ý Thuốc (TF-IDF RAG)
              </h2>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-700">
              Mô tả triệu chứng lâm sàng của người bệnh:
            </label>
            <textarea
              rows={3}
              value={symptomInput}
              onChange={(e) => setSymptomInput(e.target.value)}
              placeholder="Nhập các biểu hiện lâm sàng: sốt, ho, đau thượng vị, dị ứng..."
              className="w-full rounded-md border border-zinc-300 p-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {SYMPTOM_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSymptomInput(preset);
                    void handleRunDiagnosis(preset);
                  }}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-left"
                >
                  Mẫu #{idx + 1}: {preset.slice(0, 38)}...
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={diagnosing}
            onClick={() => void handleRunDiagnosis()}
            className="w-full h-9 rounded-lg bg-teal-600 text-xs font-semibold text-white hover:bg-teal-700 inline-flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-xs transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            <span>
              {diagnosing ? 'Đang tính toán vector TF-IDF...' : 'Phân tích Triệu chứng & Đề xuất Thuốc'}
            </span>
          </button>

          {diagnoseResult && (
            <div className="space-y-3 pt-2 border-t border-zinc-100 text-xs">
              <div className="rounded-md bg-zinc-50 p-3 border border-zinc-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-900 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                    <span>Nhận định lâm sàng sơ bộ:</span>
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {diagnoseResult.engine}
                  </span>
                </div>
                <div className="font-semibold text-teal-800">
                  {diagnoseResult.preliminaryDiagnosis}
                </div>
                <p className="text-zinc-600 leading-relaxed">{diagnoseResult.clinicalAdvice}</p>
                <div className="pt-1 text-[11px] text-amber-800 font-medium">
                  Lưu ý an toàn: {diagnoseResult.contraindicationWarning}
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-zinc-800">
                  Dược phẩm tồn kho khớp độ tương đồng Cosine cao nhất:
                </div>
                {diagnoseResult.recommendedProducts.map((rp) => (
                  <div
                    key={rp.ProductID}
                    className="rounded-md border border-zinc-200 p-2.5 flex items-center justify-between gap-3 hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-900 truncate">{rp.ProductName}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{rp.Description}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 border border-emerald-200/60">
                        Độ khớp: {Math.round(rp.similarityScore * 100)}%
                      </span>
                      <div className="text-xs font-semibold text-zinc-900 tabular-nums mt-0.5">
                        {formatVND(rp.Price)} / {rp.Unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cột Phải (6 cols): Kiểm tra Tương tác & Quá liều Hoạt chất Đa thuốc */}
        <div className="lg:col-span-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-zinc-900" />
              <h2 className="text-sm font-semibold text-zinc-900">
                2. Kiểm Tra Tương Tác Đa Thuốc & Cảnh Báo Quá Liều Hoạt Chất
              </h2>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-zinc-700 mb-1">
                Thêm dược phẩm vào đơn kiểm tra tương tác:
              </label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) handleAddDrugToCheck(Number(e.target.value));
                }}
                className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900"
              >
                <option value="">+ Chọn thêm thuốc từ danh mục kho để đối chiếu...</option>
                {allProducts.map((p) => (
                  <option key={p.ProductID} value={p.ProductID}>
                    #{p.ProductID} — {p.ProductName} ({p.Description.slice(0, 45)}...)
                  </option>
                ))}
              </select>
            </div>

            {/* Các thuốc đang chọn để kiểm tra */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-500">
                Các thuốc đang phối hợp trong đơn ({selectedProductIds.length} thuốc):
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedProductIds.map((id) => {
                  const prod = allProducts.find((p) => p.ProductID === id);
                  if (!prod) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-800"
                    >
                      <span>{prod.ProductName}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDrugFromCheck(id)}
                        className="text-zinc-400 hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Tiền sử dị ứng của bệnh nhân */}
            <div>
              <label className="block font-medium text-zinc-700 mb-1">
                Tiền sử dị ứng của bệnh nhân (nếu có):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  placeholder="VD: Penicillin, Amoxicillin, Ibuprofen..."
                  className="flex-1 h-9 rounded-md border border-zinc-300 px-3 text-xs"
                />
                <button
                  type="button"
                  disabled={checkingInteraction}
                  onClick={() => void handleCheckInteractions()}
                  className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 shrink-0 shadow-xs transition-colors"
                >
                  Kiểm tra ngay
                </button>
              </div>
            </div>

            {/* Kết quả phân tích tương tác */}
            {interactionResult && (
              <div className="pt-2 space-y-2.5">
                {interactionResult.warnings.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-900">
                        Phối hợp thuốc an toàn
                      </div>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Không phát hiện trùng lặp hoạt chất gây quá liều hoặc xung đột với tiền sử dị ứng.
                      </p>
                    </div>
                  </div>
                ) : (
                  interactionResult.warnings.map((w, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border p-3.5 space-y-1.5 ${
                        w.severity === 'HIGH'
                          ? 'border-rose-200 bg-rose-50/80 text-rose-900'
                          : 'border-amber-200 bg-amber-50/80 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{w.title}</span>
                        </span>
                        <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase bg-white/80">
                          Mức độ: {w.severity}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed">{w.detail}</p>
                      <div className="text-[11px] font-medium pt-1 border-t border-black/5">
                        Khuyến nghị xử trí: {w.recommendation}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Nút thử nhanh kịch bản quá liều Paracetamol & Dị ứng Kháng sinh */}
            <div className="pt-2 border-t border-zinc-100 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const ids = allProducts.slice(0, 3).map((p) => p.ProductID);
                  setSelectedProductIds(ids);
                  setAllergyInput('Penicillin, Amoxicillin');
                  void handleCheckInteractions(ids, 'Penicillin, Amoxicillin');
                }}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100"
              >
                <Plus className="h-3 w-3" />
                <span>Test Kịch bản: Trùng hoạt chất Paracetamol</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
