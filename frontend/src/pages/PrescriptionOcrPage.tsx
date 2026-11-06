import React, { useEffect, useRef, useState } from 'react';
import {
  ScanLine,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Sliders,
  FileText,
  Trash2,
  Plus,
  Minus,
  RefreshCw,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiApi, OcrPrescriptionResponse } from '../services/ai.api';
import { productApi } from '../services/product.api';
import { Product } from '../types/product';
import { MatchedPrescriptionItem } from '../types/ai';
import { PosCartItem } from './PosTerminalPage';

interface PrescriptionOcrPageProps {
  onTransferToPos: (items: PosCartItem[]) => void;
}

const PRESET_TEMPLATES = [
  {
    id: 'cam-cum',
    label: 'Đơn ngoại trú: Cảm cúm & Viêm họng cấp',
    hospital: 'BỆNH VIỆN ĐẠI HỌC Y HÀ NỘI',
    patient: 'Nguyễn Văn Hùng - 34 tuổi',
    diagnosis: 'J00 - Viêm mũi họng cấp (Cảm thường)',
    lines: [
      '1. Panadol Extra 500mg/65mg — 1 Hộp (Uống 1 viên khi sốt > 38.5°C)',
      '2. Siro Ho Prospan 100ml — 1 Chai (Uống 5ml x 3 lần/ngày sau ăn)',
      '3. Viên ngậm Strepsils Cool — 2 Hộp (Ngậm 1 viên mỗi 3-4 giờ)',
      '4. Berocca Performance Mango — 1 Hộp (Pha 1 viên sủi uống sáng)',
    ],
  },
  {
    id: 'da-day',
    label: 'Đơn ngoại trú: Viêm loét dạ dày - Trào ngược',
    hospital: 'BỆNH VIỆN BẠCH MAI - KHOA TIÊU HÓA',
    patient: 'Trần Thị Mai Anh - 38 tuổi',
    diagnosis: 'K21 - Trào ngược dạ dày thực quản (GERD)',
    lines: [
      '1. Sữa dạ dày Phosphalugel — 1 Hộp (Uống 1 gói khi đau hoặc sau ăn)',
      '2. Omeprazol 20mg DHG — 1 Hộp (Uống 1 viên trước ăn sáng 30 phút)',
      '3. Men vi sinh Enterogermina — 1 Hộp (Uống sáng 1 ống, chiều 1 ống)',
    ],
  },
  {
    id: 'khang-sinh',
    label: 'Đơn ngoại trú: Nhiễm khuẩn hô hấp - Viêm amidan',
    hospital: 'BỆNH VIỆN TAI MŨI HỌNG TRUNG ƯƠNG',
    patient: 'Lê Hoàng Nam - 45 tuổi',
    diagnosis: 'J03 - Viêm amidan cấp mủ',
    lines: [
      '1. Kháng sinh Augmentin 1g — 1 Hộp (Uống 1 viên x 2 lần/ngày sau ăn)',
      '2. Viên sủi Efferalgan 500mg — 1 Hộp (Pha 1 viên khi đau sốt)',
      '3. Chống phù nề Alpha Choay — 1 Hộp (Ngậm dưới lưỡi 2 viên x 2 lần/ngày)',
    ],
  },
];

export const PrescriptionOcrPage: React.FC<PrescriptionOcrPageProps> = ({
  onTransferToPos,
}) => {
  const [activeTab, setActiveTab] = useState<'DEMO' | 'REAL_UPLOAD'>('DEMO');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedPreset, setSelectedPreset] = useState(PRESET_TEMPLATES[0]);
  const [customOcrLines, setCustomOcrLines] = useState<string>(
    PRESET_TEMPLATES[0].lines.join('\n')
  );
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [thresholdPreviewUrl, setThresholdPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrPrescriptionResponse | null>(null);
  const [reviewItems, setReviewItems] = useState<MatchedPrescriptionItem[]>([]);
  const [scanning, setScanning] = useState<boolean>(false);
  const [realFile, setRealFile] = useState<File | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tải danh mục thuốc trong kho để hỗ trợ Dược sĩ đổi thuốc thay thế
  useEffect(() => {
    productApi
      .getAllProducts()
      .then((items) => {
        setAllProducts(items);
      })
      .catch(() => {
        toast.error('Không thể nạp danh mục thuốc từ máy chủ');
      });
  }, []);

  // Vẽ ảnh đơn thuốc chuẩn bệnh viện lên Canvas và tạo bản lọc nhị phân OpenCV Adaptive Threshold (Mẫu demo)
  const generatePrescriptionBitmaps = (
    template: typeof PRESET_TEMPLATES[0],
    linesText: string
  ): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 680;
      canvas.height = 460;
      const ctx = canvas.getContext('2d')!;

      // Nền giấy đơn thuốc
      ctx.fillStyle = '#fcfaf2';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Viền đơn thuốc
      ctx.strokeStyle = '#d4d4d8';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

      // Tiêu đề bệnh viện
      ctx.fillStyle = '#18181b';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(template.hospital, 36, 52);

      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('ĐƠN THUỐC ĐIỀU TRỊ NGOẠI TRÚ', 180, 92);

      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#3f3f46';
      ctx.fillText(`Họ tên người bệnh: ${template.patient}`, 36, 130);
      ctx.fillText(`Chẩn đoán lâm sàng: ${template.diagnosis}`, 36, 154);

      ctx.beginPath();
      ctx.moveTo(36, 170);
      ctx.lineTo(canvas.width - 36, 170);
      ctx.strokeStyle = '#e4e4e7';
      ctx.stroke();

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#09090b';
      const lines = linesText.split('\n');
      lines.forEach((line, idx) => {
        ctx.fillText(line.slice(0, 68), 36, 205 + idx * 38);
      });

      ctx.font = 'italic 12px sans-serif';
      ctx.fillStyle = '#52525b';
      ctx.fillText('Bác sĩ khám bệnh ký tên: BS.CKII Nguyễn Minh Hoàng', 340, 415);

      const origDataUrl = canvas.toDataURL('image/png');
      setOriginalPreviewUrl(origDataUrl);

      // Tạo ảnh sau khi lọc nhị phân Adaptive Threshold (OpenCV Simulation trên Canvas)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const bin = gray < 165 ? 15 : 252;
        d[i] = bin;
        d[i + 1] = bin;
        d[i + 2] = bin;
      }
      ctx.putImageData(imgData, 0, 0);
      setThresholdPreviewUrl(canvas.toDataURL('image/png'));

      canvas.toBlob((blob) => {
        const file = new File([blob!], `don-thuoc-${template.id}.png`, { type: 'image/png' });
        resolve(file);
      }, 'image/png');
    });
  };

  const handleRunPresetScan = async (template = selectedPreset, customText = customOcrLines) => {
    setScanning(true);
    setOcrError(null);
    try {
      const file = await generatePrescriptionBitmaps(template, customText);
      const res = await aiApi.scanPrescription(file, customText, true);
      setOcrResult(res);
      setReviewItems(res.items);
      toast.success(
        `[DEMO] Đã bóc tách ${res.items.length} dòng thuốc và đối chiếu danh mục kho thành công!`
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể xử lý ảnh đơn thuốc';
      setOcrError(msg);
      toast.error(msg);
    } finally {
      setScanning(false);
    }
  };

  const handleSelectRealFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRealFile(file);
    setOcrError(null);
    setOcrResult(null);
    setReviewItems([]);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOriginalPreviewUrl(reader.result);
        setThresholdPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleScanRealFile = async () => {
    if (!realFile) {
      toast.error('Vui lòng chọn hoặc kéo thả tệp ảnh đơn thuốc');
      return;
    }
    setScanning(true);
    setOcrError(null);
    try {
      const res = await aiApi.scanPrescription(realFile, '', false);
      setOcrResult(res);
      setReviewItems(res.items);
      toast.success(`Đã phân tích ảnh thực tế "${realFile.name}" và bóc tách ${res.items.length} dược phẩm!`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể nhận dạng văn bản từ hình ảnh này. Ảnh không hợp lệ hoặc quá mờ.';
      setOcrError(msg);
      setOcrResult(null);
      setReviewItems([]);
      toast.error(msg);
    } finally {
      setScanning(false);
    }
  };

  // Các thao tác Dược sĩ phê duyệt đơn thuốc
  const handleUpdateItemQty = (index: number, delta: number) => {
    setReviewItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      })
    );
  };

  const handleRemoveItem = (index: number) => {
    setReviewItems((prev) => prev.filter((_, idx) => idx !== index));
    toast.info('Đã xóa 1 dòng thuốc khỏi đơn');
  };

  const handleSubstituteProduct = (index: number, productIdStr: string) => {
    const pId = parseInt(productIdStr);
    const chosenProduct = allProducts.find((p) => p.ProductID === pId) || null;

    setReviewItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          matchedProduct: chosenProduct,
          inStock: Boolean(chosenProduct && chosenProduct.Quantity > 0),
          status: !chosenProduct ? 'NOT_FOUND' : chosenProduct.Quantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        };
      })
    );

    if (chosenProduct) {
      toast.success(`Đã gán thuốc thay thế: ${chosenProduct.ProductName}`);
    }
  };

  const handleTransfer = () => {
    if (reviewItems.length === 0) {
      toast.error('Không có dòng thuốc nào trong đơn để chuyển');
      return;
    }

    const unverifiedItems = reviewItems.filter(
      (i) => !i.matchedProduct || i.matchedProduct.Quantity <= 0
    );

    if (unverifiedItems.length > 0) {
      const names = unverifiedItems.map((i) => i.keyword).join(', ');
      toast.warning(
        `Còn ${unverifiedItems.length} thuốc chưa đối chiếu được hoặc hết hàng (${names}). Hệ thống chỉ chuyển các thuốc hợp lệ có sẵn trong kho!`
      );
    }

    const validCartItems: PosCartItem[] = reviewItems
      .filter((i) => i.matchedProduct && i.matchedProduct.Quantity > 0)
      .map((i) => ({
        product: i.matchedProduct!,
        quantity: i.quantity,
        dosageNote: i.dosage,
      }));

    if (validCartItems.length === 0) {
      toast.error('Không có thuốc nào hợp lệ và còn hàng trong kho để chuyển sang POS!');
      return;
    }

    onTransferToPos(validCartItems);
    toast.success(`Đã chuyển ${validCartItems.length} dược phẩm đã phê duyệt sang Quầy POS!`);
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Số Hóa Đơn Thuốc Bằng Thị Giác Máy Tính (OpenCV & OCR)
            </h1>
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
              AI Vision & GPP
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Tiền xử lý khử nhiễu ảnh bằng OpenCV, bóc tách OCR, đối chiếu kho thực tế và bảng Dược sĩ phê duyệt trước khi xuất POS.
          </p>
        </div>

        {/* Tab chuyển đổi chế độ Demo vs Tải ảnh thật */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('DEMO');
              setOcrError(null);
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all ${
              activeTab === 'DEMO'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-teal-600" />
            <span>Mẫu Demo Bệnh Viện</span>
            <span className="rounded bg-teal-50 px-1 py-0.5 text-[9px] font-bold text-teal-700 border border-teal-200/60">
              DEMO
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('REAL_UPLOAD');
              setOcrError(null);
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all ${
              activeTab === 'REAL_UPLOAD'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="h-3.5 w-3.5 text-indigo-600" />
            <span>Tải Ảnh Thật (Real OCR)</span>
          </button>
        </div>
      </div>

      {/* Thông báo lỗi khi quét ảnh hỏng / trắng / không đọc được */}
      {ocrError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-rose-900">Không Thể Nhận Dạng Đơn Thuốc Từ Hình Ảnh Này</h4>
            <p className="text-xs text-rose-700">{ocrError}</p>
            <p className="text-[11px] text-rose-600">
              * Khuyến nghị: Hãy kiểm tra độ sáng ảnh, tránh chụp mờ/ngược sáng, hoặc chuyển sang tab &ldquo;Mẫu Demo Bệnh Viện&rdquo; để thử nghiệm luồng nghiệp vụ.
            </p>
          </div>
        </div>
      )}

      {/* Thân trang: Bảng điều khiển Quét & Tiền xử lý */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs space-y-3">
          {activeTab === 'DEMO' ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-zinc-600" />
                  <span>1. Chọn Mẫu Đơn Chuẩn Bệnh Viện</span>
                </span>
                <span className="rounded bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 border border-amber-200">
                  DỮ LIỆU DEMO
                </span>
              </div>

              <div className="space-y-1.5">
                {PRESET_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(tpl);
                      const joined = tpl.lines.join('\n');
                      setCustomOcrLines(joined);
                      void handleRunPresetScan(tpl, joined);
                    }}
                    className={`w-full text-left rounded-lg px-3.5 py-2.5 text-xs font-semibold border transition-colors shadow-2xs ${
                      selectedPreset.id === tpl.id
                        ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Nội dung dòng thuốc trên đơn (có thể gõ thêm tên thuốc bất kỳ để thử nghiệm):
                </label>
                <textarea
                  rows={4}
                  value={customOcrLines}
                  onChange={(e) => setCustomOcrLines(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 p-2.5 font-mono text-xs text-zinc-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={scanning}
                onClick={() => void handleRunPresetScan()}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 shadow-sm"
              >
                <ScanLine className="h-3.5 w-3.5" />
                <span>{scanning ? 'Đang mô phỏng OpenCV...' : 'Chạy Quét Mẫu Demo'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-zinc-600" />
                  <span>1. Tải Lên Tệp Ảnh Đơn Thuốc Thật</span>
                </span>
                <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700 border border-indigo-200">
                  REAL UPLOAD
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleSelectRealFile}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-xl p-5 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-teal-50/20"
              >
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  {realFile ? realFile.name : 'Nhấp để chọn ảnh đơn thuốc từ máy tính'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Định dạng hỗ trợ: JPG, PNG, WEBP (Tiêu chuẩn GPP rõ nét)
                </p>
              </div>

              <button
                type="button"
                disabled={scanning || !realFile}
                onClick={handleScanRealFile}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 shadow-sm"
              >
                <ScanLine className="h-3.5 w-3.5" />
                <span>{scanning ? 'Đang xử lý thị giác máy tính...' : 'Quét Ảnh Thực Tế & Đối Chiếu Kho'}</span>
              </button>
            </>
          )}
        </div>

        {/* So sánh ảnh gốc vs ảnh sau tiền xử lý OpenCV */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-zinc-600" />
              <span>2. Tiền Xử Lý Ảnh Đơn Thuốc (OpenCV Grayscale & Adaptive Threshold)</span>
            </span>
            {ocrResult && (
              <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                Độ sắc nét: {ocrResult.opencvPreprocessing.sharpnessScore}%
              </span>
            )}
          </div>

          {!originalPreviewUrl ? (
            <div className="h-60 rounded-md border border-dashed border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center text-xs text-zinc-400 gap-2">
              <ScanLine className="h-6 w-6 text-zinc-300" />
              <span>Nhấn quét mẫu demo hoặc tải ảnh đơn thuốc để xem kết quả tiền xử lý ảnh</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-zinc-500">
                  Ảnh đơn thuốc gốc (RGB Input)
                </div>
                <img
                  src={originalPreviewUrl}
                  alt="Original Prescription"
                  className="w-full h-52 object-contain rounded border border-zinc-200 bg-zinc-50"
                />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-zinc-500">
                  Ảnh nhị phân tách chữ (OpenCV Threshold)
                </div>
                <img
                  src={thresholdPreviewUrl || originalPreviewUrl}
                  alt="OpenCV Threshold"
                  className="w-full h-52 object-contain rounded border border-zinc-200 bg-zinc-50"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bảng Dược Sĩ Kiểm Tra, Phê Duyệt & Chuyển Sang POS */}
      {reviewItems.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-zinc-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-900">
                  3. Bảng Kiểm Tra & Phê Duyệt Của Dược Sĩ ({reviewItems.length} dòng thuốc)
                </h2>
                {activeTab === 'DEMO' && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 border border-amber-200">
                    [DỮ LIỆU DEMO]
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Dược sĩ kiểm tra tên hoạt chất, liều lượng, chọn thuốc thay thế nếu ngoài danh mục trước khi chuyển sang POS.
              </p>
            </div>
            <button
              type="button"
              onClick={handleTransfer}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-bold text-white hover:bg-teal-700 shadow-sm"
            >
              <span>Xác Nhận & Chuyển Sang Quầy POS</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-4">Từ khóa đọc từ đơn</th>
                  <th className="py-2.5 px-4 min-w-[240px]">Dược phẩm đối chiếu trong kho</th>
                  <th className="py-2.5 px-4 min-w-[160px]">Liều dùng bóc tách</th>
                  <th className="py-2.5 px-4 text-center w-28">SL kê</th>
                  <th className="py-2.5 px-4 text-right">Tồn kho khả dụng</th>
                  <th className="py-2.5 px-4 text-right">Thành tiền</th>
                  <th className="py-2.5 px-4 text-center w-16">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {reviewItems.map((item, idx) => {
                  const mp = item.matchedProduct;
                  const isOutOfStock = mp && mp.Quantity <= 0;
                  const isNotFound = !mp;

                  return (
                    <tr key={idx} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-zinc-800">
                        {item.keyword}
                      </td>

                      <td className="py-3 px-4">
                        {mp ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {mp.Quantity > 0 ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                              )}
                              <span className="font-semibold text-zinc-900">{mp.ProductName}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              SKU #{String(mp.ProductID).padStart(4, '0')} · {mp.ProductType} · {formatVND(mp.Price)}/{mp.Unit}
                            </div>
                            <div className="pt-0.5">
                              <select
                                value={mp.ProductID}
                                onChange={(e) => handleSubstituteProduct(idx, e.target.value)}
                                className="text-[11px] h-6 rounded border border-slate-200 bg-slate-50 px-1 text-slate-600 hover:bg-white"
                              >
                                <option value={mp.ProductID}>Đổi thuốc khác trong kho...</option>
                                {allProducts
                                  .filter((p) => p.ProductID !== mp.ProductID)
                                  .map((p) => (
                                    <option key={p.ProductID} value={p.ProductID}>
                                      {p.ProductName} (Còn {p.Quantity} {p.Unit})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Thuốc ngoài danh mục kho
                            </span>
                            <div>
                              <select
                                defaultValue=""
                                onChange={(e) => handleSubstituteProduct(idx, e.target.value)}
                                className="w-full text-xs h-7 rounded border border-amber-300 bg-amber-50/50 px-1.5 text-zinc-800 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="" disabled>
                                  -- Chọn thuốc thay thế trong kho --
                                </option>
                                {allProducts.map((p) => (
                                  <option key={p.ProductID} value={p.ProductID}>
                                    {p.ProductName} (Tồn: {p.Quantity} {p.Unit})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-zinc-600">{item.dosage}</td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, -1)}
                            className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-bold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, 1)}
                            className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right tabular-nums">
                        {mp ? (
                          mp.Quantity > 0 ? (
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                              Còn {mp.Quantity} {mp.Unit}
                            </span>
                          ) : (
                            <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                              Hết tồn kho (0 {mp.Unit})
                            </span>
                          )
                        ) : (
                          <span className="text-zinc-400 font-mono text-[11px]">Chưa khớp</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-zinc-900 tabular-nums">
                        {mp ? formatVND(mp.Price * item.quantity) : '0 ₫'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          title="Xóa dòng thuốc này"
                          className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center mx-auto transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
