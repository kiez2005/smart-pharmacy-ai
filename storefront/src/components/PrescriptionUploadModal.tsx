import React, { useEffect, useState } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  PhoneCall,
  CheckCircle2,
  ShieldAlert,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { storeApi } from '../services/api';

interface PrescriptionUploadModalProps {
  initialMode?: 'RX' | 'B2B_QUOTE';
  onClose: () => void;
}

export const PrescriptionUploadModal: React.FC<PrescriptionUploadModalProps> = ({
  initialMode = 'RX',
  onClose,
}) => {
  const [mode, setMode] = useState<'RX' | 'B2B_QUOTE'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [note, setNote] = useState('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [fileKey, setFileKey] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Ảnh đơn thuốc tối đa 3MB (JPEG, PNG, WEBP)');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Chỉ hỗ trợ định dạng ảnh JPEG, PNG hoặc WEBP');
      return;
    }

    setFileName(file.name);
    const localUrl = URL.createObjectURL(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return localUrl;
    });

    setUploadingFile(true);
    try {
      const uploaded = await storeApi.uploadPrescriptionImage(file);
      setFileKey(uploaded.fileKey);
      toast.success('Đã tải ảnh đơn thuốc bảo mật lên máy chủ');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể tải lên ảnh đơn thuốc';
      toast.error(msg);
      setFileKey('');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      toast.error('Vui lòng nhập họ tên và số điện thoại liên hệ!');
      return;
    }
    if (mode === 'RX' && !fileKey && !note.trim()) {
      toast.error('Vui lòng tải ảnh đơn thuốc hoặc mô tả danh sách thuốc trong đơn!');
      return;
    }
    if (mode === 'B2B_QUOTE' && !note.trim()) {
      toast.error('Vui lòng mô tả danh mục thuốc & số lượng dự kiến cần báo giá sỉ!');
      return;
    }

    setSubmitting(true);
    try {
      await storeApi.uploadPrescriptionConsultation({
        requestType: mode,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        companyName: companyName.trim() || undefined,
        taxCode: taxCode.trim() || undefined,
        prescriptionFileKey: fileKey || undefined,
        note:
          note.trim() ||
          (mode === 'B2B_QUOTE'
            ? 'Yêu cầu báo giá sỉ B2B & hợp đồng cung ứng'
            : 'Yêu cầu Dược sĩ gọi điện tư vấn đơn thuốc kê đơn (Rx)'),
      });
      setSubmitted(true);
      toast.success(
        mode === 'B2B_QUOTE'
          ? 'Đã gửi yêu cầu Báo giá Sỉ B2B! Bộ phận Dược sĩ / Kinh doanh sẽ liên hệ sớm.'
          : 'Đã gửi đơn thuốc thành công! Dược sĩ sẽ gọi lại trong 5 phút.'
      );
    } catch {
      toast.error('Không thể gửi yêu cầu. Vui lòng thử lại!');
    } finally {
      setSubmitting(false);
    }
  };

  const isB2B = mode === 'B2B_QUOTE';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
            isB2B ? 'bg-indigo-50 border-indigo-100' : 'bg-rose-50 border-rose-100'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`h-9 w-9 rounded-xl text-white flex items-center justify-center ${
                isB2B ? 'bg-indigo-600' : 'bg-rose-600'
              }`}
            >
              {isB2B ? <Building2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {isB2B ? 'Yêu Cầu Báo Giá Sỉ B2B / Phòng Khám' : 'Gửi Đơn Thuốc Bác Sĩ (Thuốc Kê Đơn Rx)'}
              </h3>
              <p className={`text-[11px] font-medium ${isB2B ? 'text-indigo-700' : 'text-rose-700'}`}>
                {isB2B
                  ? 'Dành cho Đại lý, Nhà thuốc & Phòng khám xác thực hóa đơn VAT / vận chuyển GDP'
                  : 'Tuân thủ quy định Bộ Y Tế: Dược sĩ thẩm định toa trước khi cấp phát'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/70 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        {!submitted && (
          <div className="px-5 pt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('RX')}
              className={`flex-1 h-8 rounded-lg text-xs font-bold border transition-colors ${
                !isB2B
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Tư vấn Đơn thuốc (Rx)
            </button>
            <button
              type="button"
              onClick={() => setMode('B2B_QUOTE')}
              className={`flex-1 h-8 rounded-lg text-xs font-bold border transition-colors ${
                isB2B
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Báo giá Sỉ B2B (Đại lý)
            </button>
          </div>
        )}

        <div className="overflow-y-auto">
          {submitted ? (
            <div className="p-6 text-center space-y-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-extrabold text-slate-900">
                  {isB2B ? 'Đã Tiếp Nhận Yêu Cầu Báo Giá Sỉ B2B!' : 'Đã Tiếp Nhận Đơn Thuốc Của Bạn!'}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Hồ sơ đã được chuyển trực tiếp vào hàng đợi Dược sĩ trực ca tại{' '}
                  <strong>CS1 - Nhà thuốc Trung Tâm</strong>. Chúng tôi sẽ gọi đến số{' '}
                  <strong className="text-teal-700">{phone}</strong> để báo giá và xác thực.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"
              >
                Quay lại cửa hàng
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5 text-amber-900">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  {isB2B
                    ? 'Đơn hàng bán buôn B2B và công nợ đại lý yêu cầu xác thực giấy phép GPP/GDP và tài khoản doanh nghiệp qua Dược sĩ phụ trách.'
                    : 'Đối với thuốc kháng sinh, tim mạch, huyết áp, tiểu đường... chỉ cần chụp ảnh đơn khám bệnh, Dược sĩ sẽ kiểm tra tương tác thuốc và tư vấn miễn phí.'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isB2B ? 'Người liên hệ *' : 'Họ tên bệnh nhân / người đặt *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nhập họ và tên..."
                    className="w-full h-9 rounded-xl border border-slate-300 px-3 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Số điện thoại liên hệ *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="VD: 0912345678"
                    className="w-full h-9 rounded-xl border border-slate-300 px-3 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Email / Gmail nhận phản hồi tư vấn của Dược sĩ (nên nhập)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vd: tenban@gmail.com (để nhận đơn tư vấn & liều dùng qua email)"
                  className="w-full h-9 rounded-xl border border-slate-300 px-3 focus:border-teal-600 focus:outline-none"
                />
              </div>

              {isB2B && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Tên Nhà thuốc / Phòng khám
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="VD: Phòng khám Đa khoa An Tâm"
                      className="w-full h-9 rounded-xl border border-slate-300 px-3 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Mã số thuế / Số chứng chỉ GPP
                    </label>
                    <input
                      type="text"
                      value={taxCode}
                      onChange={(e) => setTaxCode(e.target.value)}
                      placeholder="VD: 0108xxxxxx"
                      className="w-full h-9 rounded-xl border border-slate-300 px-3 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {!isB2B && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tải lên ảnh Đơn thuốc bảo mật (JPG, PNG, WEBP — tối đa 3MB)
                  </label>
                  <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-teal-50/40 hover:border-teal-400 p-4 cursor-pointer transition-colors">
                    {imagePreview ? (
                      <div className="space-y-2 text-center">
                        <img
                          src={imagePreview}
                          alt="Đơn thuốc"
                          className="max-h-36 mx-auto rounded-lg border shadow-xs object-contain"
                        />
                        <div className="text-[11px] font-semibold text-teal-700">
                          {uploadingFile ? 'Đang tải ảnh lên...' : `${fileName} (Đã tải lên an toàn)`}
                        </div>
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="h-7 w-7 text-teal-600 mb-1" />
                        <span className="font-semibold text-slate-700">
                          Nhấn để chọn ảnh toa thuốc từ máy hoặc điện thoại
                        </span>
                        <span className="text-[11px] text-slate-400 mt-0.5">
                          Hỗ trợ JPEG, PNG, WEBP tối đa 3MB
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleFileChange(e)}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isB2B
                    ? 'Danh mục thuốc & Số lượng dự kiến cần báo giá sỉ *'
                    : 'Ghi chú tiền sử dị ứng / triệu chứng / yêu cầu thêm'}
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    isB2B
                      ? 'VD: Cần báo giá 20 thùng Augmentin 1g, 30 thùng Efferalgan 500mg xuất VAT...'
                      : 'VD: Dị ứng Penicillin, cần giao trong buổi chiều...'
                  }
                  className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingFile}
                  className={`h-9 px-5 rounded-xl text-white font-bold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 ${
                    isB2B ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  <span>
                    {submitting
                      ? 'Đang gửi...'
                      : isB2B
                      ? 'Gửi Yêu Cầu Báo Giá Sỉ'
                      : 'Gửi Toa & Nhờ Dược Sĩ Tư Vấn'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
