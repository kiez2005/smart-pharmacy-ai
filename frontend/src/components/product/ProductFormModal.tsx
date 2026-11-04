import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { Product, ProductFormValues } from '../../types/product';

interface ProductFormModalProps {
  isOpen: boolean;
  editingProduct: Product | null;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

const DEFAULT_VALUES: ProductFormValues = {
  ProductName: '',
  PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
  ProductType: 'Giảm đau - Hạ sốt',
  Quantity: 100,
  Unit: 'Hộp',
  Price: 50000,
  Description: '',
};

const PRODUCT_TYPES = [
  'Giảm đau - Hạ sốt',
  'Kháng sinh',
  'Hô hấp',
  'Tiêu hóa',
  'Vitamin & Khoáng chất',
  'Thần kinh - Tuần hoàn',
  'Dị ứng',
  'Da liễu',
  'Chăm sóc mắt',
  'Dụng cụ y tế',
];

const PRODUCT_UNITS = ['Hộp', 'Vỉ', 'Viên', 'Chai', 'Tuýp', 'Gói', 'Ống'];

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  editingProduct,
  onClose,
  onSubmit,
}) => {
  const [values, setValues] = useState<ProductFormValues>(DEFAULT_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingProduct) {
      setValues({
        ProductName: editingProduct.ProductName,
        PathImage: editingProduct.PathImage,
        ProductType: editingProduct.ProductType,
        Quantity: editingProduct.Quantity,
        Unit: editingProduct.Unit,
        Price: editingProduct.Price,
        Description: editingProduct.Description,
      });
    } else {
      setValues(DEFAULT_VALUES);
    }
  }, [editingProduct, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleFormSubmit();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen) return null;

  const handleLocalImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setValues((prev) => ({ ...prev, PathImage: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!values.ProductName.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              {editingProduct ? 'Cập nhật thông tin dược phẩm' : 'Thêm dược phẩm mới'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {editingProduct
                ? `Mã định danh SKU #${editingProduct.ProductID}`
                : 'Điền thông tin chi tiết để đưa sản phẩm vào danh mục quản lý kho'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Tên thương mại & hàm lượng <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={values.ProductName}
                onChange={(e) => setValues({ ...values, ProductName: e.target.value })}
                placeholder="Ví dụ: Panadol Extra 500mg/65mg"
                className="w-full h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Nhóm dược lý
              </label>
              <select
                value={values.ProductType}
                onChange={(e) => setValues({ ...values, ProductType: e.target.value })}
                className="w-full h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Đơn vị quy đổi
              </label>
              <select
                value={values.Unit}
                onChange={(e) => setValues({ ...values, Unit: e.target.value })}
                className="w-full h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {PRODUCT_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Số lượng tồn kho
              </label>
              <input
                type="number"
                min={0}
                required
                value={values.Quantity}
                onChange={(e) => setValues({ ...values, Quantity: Number(e.target.value) })}
                className="w-full h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 tabular-nums shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Giá bán niêm yết (VNĐ)
              </label>
              <input
                type="number"
                min={0}
                step={500}
                required
                value={values.Price}
                onChange={(e) => setValues({ ...values, Price: Number(e.target.value) })}
                className="w-full h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 tabular-nums shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Hình ảnh sản phẩm: Tải file từ máy tính HOẶC nhập URL */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Hình ảnh sản phẩm (`PathImage` — Tải ảnh từ máy tính hoặc dán URL)
              </label>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden flex items-center justify-center">
                  {values.PathImage ? (
                    <img
                      src={values.PathImage}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-zinc-400" />
                  )}
                </div>
                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={values.PathImage}
                    onChange={(e) => setValues({ ...values, PathImage: e.target.value })}
                    placeholder="https://... hoặc chọn ảnh từ máy tính"
                    className="flex-1 h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLocalImageSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 shadow-sm"
                  >
                    <Upload className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Chọn tệp ảnh</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Hoạt chất, chỉ định & hướng dẫn sử dụng
              </label>
              <textarea
                rows={3}
                value={values.Description}
                onChange={(e) => setValues({ ...values, Description: e.target.value })}
                placeholder="Nhập thành phần hoạt chất, công dụng, liều lượng và lưu ý lâm sàng..."
                className="w-full rounded-lg border border-zinc-200 p-3 text-xs text-zinc-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
            <span className="text-xs text-zinc-400">
              Nhấn <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded font-mono text-[11px] text-zinc-600">Alt S</kbd> để lưu nhanh
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-sm"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {submitting ? 'Đang lưu...' : editingProduct ? 'Lưu thay đổi' : 'Tạo dược phẩm'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
