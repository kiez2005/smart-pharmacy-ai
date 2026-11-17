import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  Minus,
  Plus,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sliders,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { AiModelsHealthBar } from '../components/ai/AiModelsHealthBar';
import { aiApi, extractAiErrorMessage, OcrPrescriptionResponse } from '../services/ai.api';
import { formsApi } from '../services/forms.api';
import { productApi } from '../services/product.api';
import { OcrExtractedLine } from '../types/ai';
import { Product } from '../types/product';
import { PosCartItem } from './PosTerminalPage';

export interface OcrTransferMeta {
  draftId: string;
  confirmedLines: number;
  skippedLines: number;
  unconfirmedCount: number;
}

interface PrescriptionOcrPageProps {
  onTransferToPos: (items: PosCartItem[], ocrMeta?: OcrTransferMeta) => void;
  initialAttachmentFileKey?: string | null;
  onClearInitialAttachment?: () => void;
}

export const PrescriptionOcrPage: React.FC<PrescriptionOcrPageProps> = ({
  onTransferToPos,
  initialAttachmentFileKey,
  onClearInitialAttachment,
}) => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrPrescriptionResponse | null>(null);
  const [lines, setLines] = useState<OcrExtractedLine[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    productApi
      .list({ page: 1, limit: 150 })
      .then((res) => setAllProducts(res.items))
      .catch(() => {
        toast.error('Không thể tải danh mục thuốc để Dược sĩ đối chiếu thủ công');
      });
  }, []);

  useEffect(() => {
    if (!initialAttachmentFileKey) return;
    let cancelled = false;
    (async () => {
      try {
        const file = await formsApi.fetchPrescriptionImageFile(initialAttachmentFileKey);
        if (cancelled) return;
        handleFileChange(file);
        onClearInitialAttachment?.();
        setScanning(true);
        setScanError(null);
        setResult(null);
        setLines([]);
        const data = await aiApi.scanPrescription(file);
        if (cancelled) return;
        setResult(data);
        setLines(data.lines);
        toast.success(`Đã nạp ảnh từ Hộp thư Dược sĩ & quét xong ${data.lines.length} dòng thuốc.`);
      } catch (err) {
        if (!cancelled) {
          const msg = extractAiErrorMessage(err, 'Không thể nạp hoặc quét ảnh từ Hộp thư Dược sĩ.');
          setScanError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAttachmentFileKey]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const productById = useMemo(
    () => new Map(allProducts.map((p) => [p.ProductID, p])),
    [allProducts]
  );

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setScanError(null);
  };

  const handleRunOcr = async () => {
    if (!selectedFile) {
      toast.warning('Vui lòng chọn ảnh đơn thuốc thực tế (PNG/JPG/WEBP)');
      return;
    }

    setScanning(true);
    setScanError(null);
    setResult(null);
    setLines([]);

    try {
      const data = await aiApi.scanPrescription(selectedFile);
      setResult(data);
      setLines(data.lines || []);
      toast.success(
        `RapidOCR đã tách ${data.lines.length} dòng thuốc. Vui lòng chọn sản phẩm phù hợp và tích xác nhận từng dòng.`
      );
    } catch (err) {
      const msg = extractAiErrorMessage(err, 'Lỗi khi chạy OpenCV + RapidOCR trên ảnh đơn thuốc');
      setScanError(msg);
      toast.error(msg);
    } finally {
      setScanning(false);
    }
  };

  const updateLine = (lineId: string, updater: (prev: OcrExtractedLine) => OcrExtractedLine) => {
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? updater(l) : l)));
  };

  const handleSelectCandidate = (lineId: string, productId: number | null) => {
    updateLine(lineId, (prev) => ({
      ...prev,
      selectedProductId: productId,
      skipped: false,
      // Chọn lại ứng viên sẽ đặt trạng thái về chưa xác nhận để Dược sĩ rà lại trước khi tích
      confirmed: false,
    }));
  };

  const handleToggleConfirm = (lineId: string) => {
    updateLine(lineId, (prev) => {
      if (!prev.selectedProductId) {
        toast.warning('Vui lòng chọn 1 thuốc khớp trong danh mục trước khi tích xác nhận dòng này');
        return prev;
      }
      return {
        ...prev,
        skipped: false,
        confirmed: !prev.confirmed,
      };
    });
  };

  const handleToggleSkip = (lineId: string) => {
    updateLine(lineId, (prev) => ({
      ...prev,
      skipped: !prev.skipped,
      confirmed: false,
    }));
  };

  const activeLines = lines.filter((l) => !l.skipped);
  const confirmedActiveLines = activeLines.filter((l) => l.confirmed && Boolean(l.selectedProductId));
  const unconfirmedActiveCount = activeLines.length - confirmedActiveLines.length;
  const readyToTransfer =
    Boolean(result?.draftId) && activeLines.length > 0 && unconfirmedActiveCount === 0;

  const handleTransferToPos = async () => {
    if (!result?.draftId || !readyToTransfer) {
      toast.error(
        `Không thể chuyển hóa đơn: vẫn còn ${unconfirmedActiveCount} dòng chưa được Dược sĩ chọn thuốc và xác nhận.`
      );
      return;
    }

    setVerifying(true);
    try {
      const verification = await aiApi.verifyOcrDraft(
        result.draftId,
        lines.map((l) => ({
          lineId: l.lineId,
          selectedProductId: l.skipped ? null : l.selectedProductId,
          quantity: l.extractedQuantity,
          dosage: l.extractedDosage,
          confirmed: l.confirmed,
          skipped: l.skipped,
        }))
      );

      const posCartItems: PosCartItem[] = [];
      for (const item of verification.posItems) {
        const prod = productById.get(item.ProductID);
        if (!prod) continue;
        if (prod.Quantity <= 0) {
          toast.error(`Thuốc "${prod.ProductName}" hiện đã hết tồn kho (0 ${prod.Unit}).`);
          setVerifying(false);
          return;
        }
        posCartItems.push({
          product: prod,
          quantity: Math.min(item.Quantity, prod.Quantity),
          dosageNote: item.DosageNote,
        });
      }

      if (posCartItems.length === 0) {
        toast.error('Không có sản phẩm hợp lệ nào để chuyển sang POS.');
        return;
      }

      onTransferToPos(posCartItems, {
        draftId: verification.draftId,
        confirmedLines: verification.confirmedLines,
        skippedLines: verification.skippedLines,
        unconfirmedCount: 0,
      });
    } catch (err) {
      toast.error(extractAiErrorMessage(err, 'Không thể xác nhận phiên OCR với máy chủ'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-teal-600" />
              Nhận Dạng Đơn Thuốc Thật (OpenCV + RapidOCR)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tải ảnh đơn thuốc thật → OCR trích xuất từng dòng → AI đề xuất Top 5 ứng viên + độ tin
              cậy → Dược sĩ bắt buộc chọn và xác nhận từng dòng trước khi chuyển sang POS.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800">
            <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
            Không dùng dữ liệu mẫu giả lập — Mọi dòng chưa xác nhận bị khóa chuyển hóa đơn
          </div>
        </div>

        <AiModelsHealthBar />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Cột trái: Upload ảnh & kết quả thô */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Upload className="h-4 w-4 text-teal-600" />
              1. Tải Ảnh Đơn Thuốc Bác Sĩ
            </h3>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 hover:border-teal-500 hover:bg-teal-50/30 p-5 text-center transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              />
              {previewUrl ? (
                <div className="space-y-2">
                  <img
                    src={previewUrl}
                    alt="Ảnh đơn thuốc tải lên"
                    className="mx-auto max-h-64 rounded-lg border border-slate-200 object-contain bg-white"
                  />
                  <div className="text-xs font-semibold text-slate-700 truncate">
                    {selectedFile?.name}
                  </div>
                  <div className="text-[11px] text-teal-700">Bấm để chọn ảnh đơn khác</div>
                </div>
              ) : (
                <div className="py-6 space-y-2">
                  <ImageIcon className="mx-auto h-10 w-10 text-slate-400" />
                  <div className="text-xs font-semibold text-slate-700">
                    Bấm để chọn ảnh đơn thuốc (PNG, JPG, WEBP)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Ảnh sẽ được chuẩn hóa OpenCV (CLAHE + khử nhiễu) trước khi đọc bằng RapidOCR
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleRunOcr()}
              disabled={scanning || !selectedFile}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Đang tiền xử lý OpenCV & chạy RapidOCR...
                </>
              ) : (
                <>
                  <ScanLine className="h-4 w-4" />
                  Quét Đơn Thuốc Bằng RapidOCR
                </>
              )}
            </button>

            {scanError && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertOctagon className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">OCR không thành công (Không trả kết quả giả):</div>
                  <div className="mt-0.5">{scanError}</div>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-teal-600" />
                  Chi tiết OpenCV & Văn bản thô
                </h4>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  Confidence TB: {(result.averageConfidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5">
                <span>
                  Engine: <span className="font-mono font-semibold">{result.engine}</span> • Draft:{' '}
                  <span className="font-mono">{result.draftId.slice(0, 8)}</span>
                </span>
                {result.sectionMode === 'TREATMENT_TABLE' && (
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Đã lọc đúng vùng Thuốc điều trị
                  </span>
                )}
                {typeof result.elapsedSec === 'number' && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-700">
                    {result.elapsedSec.toFixed(2)}s
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {result.opencvPreprocessing.steps.map((s) => (
                  <span
                    key={s}
                    className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] text-teal-800"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <pre className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-800 whitespace-pre-wrap">
                {result.rawOcrText}
              </pre>
            </div>
          )}
        </div>

        {/* Cột phải: Bảng duyệt Top-K ứng viên & xác nhận từng dòng */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-teal-600" />
                2. Đối Chiếu Top Ứng Viên & Xác Nhận Từng Dòng
              </h3>
              <p className="text-[11px] text-slate-500">
                Chọn đúng biệt dược & hàm lượng từ ứng viên hoặc danh mục; tích{' '}
                <strong>Xác nhận</strong> từng dòng thuốc trước khi sang POS.
              </p>
            </div>
            {lines.length > 0 && (
              <div className="text-xs font-bold">
                {unconfirmedActiveCount === 0 && activeLines.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Đã xác nhận {confirmedActiveLines.length}/{activeLines.length} dòng
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Còn {unconfirmedActiveCount} dòng chưa xác nhận
                  </span>
                )}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Eye className="mx-auto h-10 w-10 text-slate-300" />
              <div className="text-xs font-medium text-slate-500">
                Chưa có dòng thuốc nào được bóc tách. Tải ảnh đơn thuốc và bấm Quét OCR ở cột trái.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line) => {
                const chosenProduct = line.selectedProductId
                  ? productById.get(line.selectedProductId) || null
                  : null;
                return (
                  <div
                    key={line.lineId}
                    className={`rounded-xl border p-3.5 transition-colors space-y-2.5 ${
                      line.skipped
                        ? 'border-slate-200 bg-slate-50/70 opacity-65'
                        : line.confirmed
                          ? 'border-emerald-300 bg-emerald-50/30'
                          : 'border-amber-200 bg-amber-50/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Dòng #{line.lineNumber}
                          </span>
                          <span className="rounded bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                            OCR Tin cậy: {(line.ocrConfidence * 100).toFixed(0)}%
                          </span>
                          {line.strengthTokens.map((st) => (
                            <span
                              key={st}
                              className="rounded bg-purple-50 border border-purple-200 px-1.5 py-0.5 text-[10px] font-bold text-purple-700"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs font-mono text-slate-700 break-words">
                          Text gốc: <span className="font-semibold text-slate-900">{line.rawText}</span>
                        </div>
                        <div className="text-[11px] text-teal-800 font-semibold">
                          Từ khóa thuốc tách được: &ldquo;{line.extractedDrugQuery}&rdquo;
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleSkip(line.lineId)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                            line.skipped
                              ? 'border-slate-400 bg-slate-200 text-slate-800'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {line.skipped ? 'Đã bỏ qua' : 'Bỏ qua'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleConfirm(line.lineId)}
                          disabled={line.skipped || !line.selectedProductId}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                            line.confirmed
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'border border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {line.confirmed ? 'Đã xác nhận' : 'Xác nhận dòng'}
                        </button>
                      </div>
                    </div>

                    {!line.skipped && (
                      <>
                        {/* Top-K Ứng viên AI đề xuất */}
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-slate-600">
                            Top {line.candidates.length} ứng viên từ Danh mục nhà thuốc (chọn 1):
                          </div>
                          {line.candidates.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {line.candidates.map((cand) => {
                                const isChosen = line.selectedProductId === cand.ProductID;
                                return (
                                  <button
                                    key={cand.ProductID}
                                    type="button"
                                    onClick={() => handleSelectCandidate(line.lineId, cand.ProductID)}
                                    className={`text-left rounded-lg border p-2 text-xs transition-all ${
                                      isChosen
                                        ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-500'
                                        : 'border-slate-200 bg-white hover:border-teal-400'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-1.5">
                                      <span className="font-bold text-slate-900 line-clamp-1">
                                        {cand.ProductName}
                                      </span>
                                      <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                        {(cand.combinedConfidence * 100).toFixed(0)}%
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <span
                                        className={`rounded px-1.5 py-0.5 font-bold ${
                                          cand.IsRx
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                            : 'bg-teal-50 text-teal-700 border border-teal-200'
                                        }`}
                                      >
                                        {cand.IsRx ? 'Kê đơn Rx' : 'OTC'}
                                      </span>
                                      <span
                                        className={`font-semibold ${
                                          cand.inStock ? 'text-emerald-700' : 'text-rose-600'
                                        }`}
                                      >
                                        Tồn: {cand.Quantity} {cand.Unit}
                                      </span>
                                      <span className="text-slate-500">
                                        {cand.Price.toLocaleString('vi-VN')}đ
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[11px] text-amber-700 italic">
                              Không có ứng viên độ khớp cao — vui lòng chọn thủ công bên dưới hoặc bỏ qua dòng.
                            </div>
                          )}
                        </div>

                        {/* Chọn thủ công + SL + Liều dùng */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-slate-100">
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              Hoặc chọn thuốc thủ công trong kho
                            </label>
                            <select
                              value={line.selectedProductId ?? ''}
                              onChange={(e) =>
                                handleSelectCandidate(
                                  line.lineId,
                                  e.target.value ? Number(e.target.value) : null
                                )
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                            >
                              <option value="">-- Chưa chọn thuốc khớp --</option>
                              {allProducts.map((p) => (
                                <option key={p.ProductID} value={p.ProductID}>
                                  {p.ProductName} (Tồn: {p.Quantity} {p.Unit})
                                  {p.packaging?.IsRx ? ' [Rx]' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              Số lượng ({chosenProduct?.Unit || line.extractedUnit || 'ĐV'})
                            </label>
                            <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                              <button
                                type="button"
                                onClick={() =>
                                  updateLine(line.lineId, (p) => ({
                                    ...p,
                                    extractedQuantity: Math.max(1, p.extractedQuantity - 1),
                                  }))
                                }
                                className="px-2 py-1.5 text-slate-500 hover:bg-slate-50"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={line.extractedQuantity}
                                onChange={(e) =>
                                  updateLine(line.lineId, (p) => ({
                                    ...p,
                                    extractedQuantity: Math.max(1, Number(e.target.value || 1)),
                                  }))
                                }
                                className="w-full text-center text-xs font-bold text-slate-900 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateLine(line.lineId, (p) => ({
                                    ...p,
                                    extractedQuantity: p.extractedQuantity + 1,
                                  }))
                                }
                                className="px-2 py-1.5 text-slate-500 hover:bg-slate-50"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              Hướng dẫn liều dùng in nhãn
                            </label>
                            <input
                              type="text"
                              value={line.extractedDosage}
                              onChange={(e) =>
                                updateLine(line.lineId, (p) => ({
                                  ...p,
                                  extractedDosage: e.target.value,
                                }))
                              }
                              placeholder="VD: Sáng 1v, Chiều 1v sau ăn"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  {readyToTransfer ? (
                    <span className="font-semibold text-emerald-700">
                      Tất cả dòng thuốc hợp lệ đã được Dược sĩ xác nhận. Sẵn sàng nạp vào quầy POS.
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-700">
                      Còn {unconfirmedActiveCount} dòng chưa xác nhận — không được phép chuyển vào hóa
                      đơn.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!readyToTransfer || verifying}
                  onClick={() => void handleTransferToPos()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {verifying ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Chuyển Sang Quầy Thu Ngân POS ({confirmedActiveLines.length} thuốc)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
