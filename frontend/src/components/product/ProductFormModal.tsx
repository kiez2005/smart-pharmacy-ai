import React, { useEffect, useState } from 'react';
import { X, Save, Pill } from 'lucide-react';
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

  // Hỗ trợ phím tắt Alt + S để Lưu form ngay lập tức (Yêu cầu #11)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-teal-700 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <Pill className="h-5 w-5" />
            <h2 className="text-lg font-bold">
              {editingProduct
                ? `Cập nhật Thuốc #${editingProduct.ProductID}`
                : 'Thêm Mới Sản Phẩm Thuốc (Product)'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-teal-100 hover:bg-teal-600 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tên thuốc (ProductName) *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={values.ProductName}
                onChange={(e) => setValues({ ...values, ProductName: e.target.value })}
                placeholder="VD: Panadol Extra Đỏ 500mg/65mg"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Nhóm thuốc (ProductType) *
              </label>
              <select
                value={values.ProductType}
                onChange={(e) => setValues({ ...values, ProductType: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none"
              >
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Đơn vị tính (Unit) *
              </label>
              <select
                value={values.Unit}
                onChange={(e) => setValues({ ...values, Unit: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none"
              >
                {PRODUCT_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Số lượng tồn kho (Quantity) *
              </label>
              <input
                type="number"
                min={0}
                required
                value={values.Quantity}
                onChange={(e) => setValues({ ...values, Quantity: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Đơn giá VNĐ (Price) *
              </label>
              <input
                type="number"
                min={0}
                step={500}
                required
                value={values.Price}
                onChange={(e) => setValues({ ...values, Price: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Đường dẫn hình ảnh (PathImage)
              </label>
              <input
                type="url"
                value={values.PathImage}
                onChange={(e) => setValues({ ...values, PathImage: e.target.value })}
                placeholder="https://..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Mô tả hoạt chất, công dụng & liều dùng (Description)
              </label>
              <textarea
                rows={3}
                value={values.Description}
                onChange={(e) => setValues({ ...values, Description: e.target.value })}
                placeholder="Nhập hoạt chất, chỉ định, liều dùng và chống chỉ định..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Phím tắt: Bấm <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded font-mono text-xs">Alt + S</kbd> để lưu nhanh
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Hủy (Esc)
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {submitting ? 'Đang lưu...' : 'Lưu Sản Phẩm (Alt+S)'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
