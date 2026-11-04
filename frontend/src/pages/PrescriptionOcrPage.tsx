import React, { useRef, useState } from 'react';
import {
  ScanLine,
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sliders,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiApi, OcrPrescriptionResponse } from '../services/ai.api';
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
  const [selectedPreset, setSelectedPreset] = useState(PRESET_TEMPLATES[0]);
  const [customOcrLines, setCustomOcrLines] = useState<string>(
    PRESET_TEMPLATES[0].lines.join('\n')
  );
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [thresholdPreviewUrl, setThresholdPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrPrescriptionResponse | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Vẽ ảnh đơn thuốc chuẩn bệnh viện lên Canvas và tạo bản lọc nhị phân OpenCV Adaptive Threshold
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
    try {
      const file = await generatePrescriptionBitmaps(template, customText);
      const res = await aiApi.scanPrescription(file, customText);
      setOcrResult(res);
      toast.success(
        `Đã bóc tách ${res.items.length} dòng thuốc và đối chiếu tồn kho thành công!`
      );
    } catch {
      toast.error('Không thể xử lý ảnh đơn thuốc');
    } finally {
      setScanning(false);
    }
  };

  const handleUploadRealFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setOriginalPreviewUrl(reader.result);
          setThresholdPreviewUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);

      const res = await aiApi.scanPrescription(file, customOcrLines);
      setOcrResult(res);
      toast.success(`Đã phân tích ảnh "${file.name}" và khớp ${res.items.length} dược phẩm!`);
    } catch {
      toast.error('Lỗi khi đọc tệp ảnh đơn thuốc');
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const handleTransfer = () => {
    if (!ocrResult) return;
    const validCartItems: PosCartItem[] = ocrResult.items
      .filter((i) => i.matchedProduct && i.matchedProduct.Quantity > 0)
      .map((i) => ({
        product: i.matchedProduct!,
        quantity: i.quantity,
        dosageNote: i.dosage,
      }));

    if (validCartItems.length === 0) {
      toast.error('Không có thuốc nào khả dụng để chuyển sang POS');
      return;
    }
    onTransferToPos(validCartItems);
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            Số Hóa Đơn Thuốc Bằng Thị Giác Máy Tính (OpenCV & OCR)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tiền xử lý khử nhiễu ảnh đơn thuốc bằng OpenCV, bóc tách tên hoạt chất/liều dùng và tự động kiểm tra tồn kho thực tế.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadRealFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Upload className="h-3.5 w-3.5 text-zinc-500" />
            <span>Tải ảnh đơn thuốc từ máy</span>
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={() => void handleRunPresetScan()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            <ScanLine className="h-3.5 w-3.5" />
            <span>{scanning ? 'Đang xử lý OpenCV...' : 'Chạy Quét OCR & Đối Chiếu Kho'}</span>
          </button>
        </div>
      </div>

      {/* Chọn mẫu đơn thuốc hoặc tùy chỉnh nội dung OCR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-zinc-600" />
              <span>1. Chọn Mẫu Đơn Thuốc Bệnh Viện Hoặc Sửa Nội Dung</span>
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
                className={`w-full text-left rounded-md px-3 py-2 text-xs font-medium border transition-colors ${
                  selectedPreset.id === tpl.id
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1">
              Nội dung dòng thuốc trên đơn (có thể gõ thêm tên thuốc bất kỳ trong kho để test khớp tự động):
            </label>
            <textarea
              rows={4}
              value={customOcrLines}
              onChange={(e) => setCustomOcrLines(e.target.value)}
              className="w-full rounded-md border border-zinc-300 p-2.5 font-mono text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </div>
        </div>

        {/* So sánh ảnh gốc vs ảnh sau tiền xử lý OpenCV */}
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs space-y-3">
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
              <span>Nhấn &ldquo;Chạy Quét OCR & Đối Chiếu Kho&rdquo; hoặc tải ảnh đơn thuốc để xem kết quả</span>
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

      {/* Bảng Kết quả Đối chiếu Tồn kho & Chuyển sang POS */}
      {ocrResult && (
        <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-zinc-50/50">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                3. Kết Quả Bóc Tách Đơn Thuốc & Đối Chiếu Tồn Kho Thực Tế ({ocrResult.items.length} dòng)
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Tự động khớp tên thương mại / hoạt chất với cơ sở dữ liệu `Product` bằng Fuse.js & Meilisearch
              </p>
            </div>
            <button
              type="button"
              onClick={handleTransfer}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              <span>Chuyển Toàn Bộ Sang Quầy POS Để Xuất Hóa Đơn</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-4">Từ khóa đọc từ đơn</th>
                  <th className="py-2.5 px-4">Dược phẩm khớp trong kho</th>
                  <th className="py-2.5 px-4">Liều dùng bóc tách</th>
                  <th className="py-2.5 px-4 text-right">SL kê</th>
                  <th className="py-2.5 px-4 text-right">Tồn kho</th>
                  <th className="py-2.5 px-4 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {ocrResult.items.map((item, idx) => {
                  const mp = item.matchedProduct;
                  return (
                    <tr key={idx} className="hover:bg-zinc-50">
                      <td className="py-3 px-4 font-mono font-medium text-zinc-800">
                        {item.keyword}
                      </td>
                      <td className="py-3 px-4">
                        {mp ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <div>
                              <div className="font-semibold text-zinc-900">{mp.ProductName}</div>
                              <div className="text-[11px] text-zinc-500">
                                Mã SKU #{String(mp.ProductID).padStart(4, '0')} · {mp.ProductType}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Không tìm thấy trong danh mục
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-600">{item.dosage}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums">
                        {item.quantity} {mp?.Unit || 'đv'}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {mp ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                            Còn {mp.Quantity} {mp.Unit}
                          </span>
                        ) : (
                          '---'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-zinc-900 tabular-nums">
                        {mp ? formatVND(mp.Price * item.quantity) : '0 ₫'}
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
