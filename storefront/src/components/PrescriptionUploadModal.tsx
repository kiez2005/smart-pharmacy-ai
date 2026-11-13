import React, { useState } from 'react';
import { X, UploadCloud, FileText, PhoneCall, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { storeApi } from '../services/api';

interface PrescriptionUploadModalProps {
  onClose: () => void;
}

export const PrescriptionUploadModal: React.FC<PrescriptionUploadModalProps> = ({ onClose }) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Kích thước ảnh đơn thuốc không được vượt quá 5MB');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      toast.error('Vui lòng nhập họ tên và số điện thoại liên hệ!');
      return;
    }
    if (!imagePreview && !note.trim()) {
      toast.error('Vui lòng tải ảnh đơn thuốc hoặc mô tả danh sách thuốc trong đơn!');
      return;
    }

    setSubmitting(true);
    try {
      await storeApi.uploadPrescriptionConsultation({
        fullName: fullName.trim(),
        phone: phone.trim(),
        prescriptionImage: fileName ? `[File: ${fileName}] ${imagePreview.slice(0, 120)}...` : 'Khách mô tả bằng văn bản',
        note: note.trim() || 'Yêu cầu Dược sĩ gọi điện tư vấn đơn thuốc kê đơn (Rx)',
      });
      setSubmitted(true);
      toast.success('Đã gửi đơn thuốc thành công! Dược sĩ sẽ gọi lại trong 5 phút.');
    } catch {
      toast.error('Không thể gửi yêu cầu tư vấn. Vui lòng thử lại!');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 bg-rose-50 border-b border-rose-100">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-rose-600 text-white flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Gửi Đơn Thuốc Bác Sĩ (Thuốc Kê Đơn Rx)
              </h3>
              <p className="text-[11px] text-rose-700 font-medium">
                Tuân thủ quy định Bộ Y Tế: Dược sĩ thẩm định toa trước khi cấp phát
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 text-center space-y-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-slate-900">
                Đã Tiếp Nhận Đơn Thuốc Của Bạn!
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Hồ sơ đã được chuyển trực tiếp vào Hàng đợi Dược sĩ trực ca tại{' '}
                <strong>CS1 - Nhà thuốc Trung Tâm</strong>. Dược sĩ sẽ gọi đến số{' '}
                <strong className="text-teal-700">{phone}</strong> trong ít phút để báo giá, tư vấn liều dùng và lên đơn giao tận nơi.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-10 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"
            >
              Quay lại mua sắm OTC
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5 text-amber-900">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                Đối với thuốc kháng sinh, tim mạch, huyết áp, tiểu đường... bạn chỉ cần chụp ảnh đơn khám bệnh, Dược sĩ sẽ kiểm tra tương tác thuốc và tư vấn liều an toàn miễn phí.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Họ tên bệnh nhân / người đặt *
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
                  Số điện thoại Dược sĩ gọi lại *
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
                Chụp / Tải lên ảnh Đơn thuốc (JPG, PNG)
              </label>
              <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-teal-50/40 hover:border-teal-400 p-4 cursor-pointer transition-colors">
                {imagePreview ? (
                  <div className="space-y-2 text-center">
                    <img
                      src={imagePreview}
                      alt="Đơn thuốc"
                      className="max-h-36 mx-auto rounded-lg border shadow-xs object-contain"
                    />
                    <div className="text-[11px] font-semibold text-teal-700">{fileName}</div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="h-7 w-7 text-teal-600 mb-1" />
                    <span className="font-semibold text-slate-700">
                      Nhấn để chọn ảnh toa thuốc từ máy hoặc điện thoại
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">Hỗ trợ PNG, JPG tối đa 5MB</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Ghi chú tiền sử dị ứng / triệu chứng / yêu cầu thêm
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Dị ứng Penicillin, cần giao trong buổi chiều..."
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
                disabled={submitting}
                className="h-9 px-5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 inline-flex items-center gap-1.5 shadow-sm"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                <span>{submitting ? 'Đang gửi đơn...' : 'Gửi Toa & Nhờ Dược Sĩ Tư Vấn'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
