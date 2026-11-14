import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { Product, ProductFormValues } from '../../types/product';
import { ModalPortal } from '../common/ModalPortal';

interface ProductFormModalProps {
  isOpen: boolean;
  editingProduct: Product | null;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

const SUSPECTED_RX_TYPE_KEYWORDS = [
  'kháng sinh',
  'khang sinh',
  'tim mạch',
  'tiểu đường',
  'huyết áp',
  'thần kinh',
  'điều trị',
  'kê đơn',
];

const SUSPECTED_RX_TEXT_KEYWORDS = [
  'amoxicillin',
  'augmentin',
  'cefixime',
  'cefuroxime',
  'azithromycin',
  'ciprofloxacin',
  'levofloxacin',
  'metformin',
  'atorvastatin',
  'rosuvastatin',
  'amlodipine',
  'losartan',
  'omeprazol',
  'prednisolon',
  'medrol',
  'kê đơn',
  'bán theo đơn',
];

function isSuspectedRxProduct(name: string, type: string, description: string): boolean {
  const lowerType = (type || '').toLowerCase();
  const lowerText = `${name || ''} ${description || ''}`.toLowerCase();
  if (SUSPECTED_RX_TYPE_KEYWORDS.some((kw) => lowerType.includes(kw))) return true;
  if (SUSPECTED_RX_TEXT_KEYWORDS.some((kw) => lowerText.includes(kw))) return true;
  return /\(rx\)|\[rx\]/i.test(lowerText);
}

const DEFAULT_VALUES: ProductFormValues = {
  ProductName: '',
  PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
  ProductType: 'Giảm đau - Hạ sốt',
  Quantity: 0,
  Unit: 'Hộp',
  Price: 50000,
  Description: '',
  InitialBatchNumber: '',
  InitialExpiryDate: '',
  packaging: {
    PackageUnit: 'Hộp',
    BlisterUnit: 'Vỉ',
    SmallestUnit: 'Viên',
    CartonUnit: 'Thùng',
    BoxesPerCarton: 20,
    BlistersPerPackage: 10,
    UnitsPerPackage: 100,
    AllowFractionalSale: true,
    IsRx: undefined,
    confirmOtcOverride: false,
    WholesalePrice: 44000,
    MinWholesaleQty: 10,
  },
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
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFormError(null);
    if (editingProduct) {
      const pkg = editingProduct.packaging;
      const isTabletBox = editingProduct.Unit.toLowerCase().includes('hộp');
      setValues({
        ProductName: editingProduct.ProductName,
        PathImage: editingProduct.PathImage,
        ProductType: editingProduct.ProductType,
        Quantity: editingProduct.Quantity,
        Unit: editingProduct.Unit,
        Price: editingProduct.Price,
        Description: editingProduct.Description,
        InitialBatchNumber: '',
        InitialExpiryDate: '',
        packaging: {
          PackageUnit: editingProduct.Unit,
          BlisterUnit: pkg?.BlisterUnit ?? (isTabletBox ? 'Vỉ' : null),
          SmallestUnit: pkg?.SmallestUnit ?? (isTabletBox ? 'Viên' : editingProduct.Unit),
          CartonUnit: pkg?.CartonUnit ?? 'Thùng',
          BoxesPerCarton: pkg?.BoxesPerCarton ?? 20,
          BlistersPerPackage: pkg?.BlistersPerPackage ?? (isTabletBox ? 10 : null),
          UnitsPerPackage: pkg?.UnitsPerPackage ?? (isTabletBox ? 100 : 1),
          AllowFractionalSale: pkg?.AllowFractionalSale ?? isTabletBox,
          IsRx: typeof pkg?.IsRx === 'boolean' ? pkg.IsRx : undefined,
          confirmOtcOverride: false,
          WholesalePrice: pkg?.WholesalePrice ?? Math.round((editingProduct.Price * 0.88) / 500) * 500,
          MinWholesaleQty: pkg?.MinWholesaleQty ?? 10,
        },
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
    if (!values.ProductName.trim()) {
      setFormError('Vui lòng nhập tên dược phẩm.');
      return;
    }

    if (typeof values.packaging?.IsRx !== 'boolean') {
      setFormError('Vui lòng chọn rõ phân loại Thuốc không kê đơn (OTC) hoặc Thuốc kê đơn (Rx) trước khi lưu.');
      return;
    }

    const suspectedRx = isSuspectedRxProduct(
      values.ProductName,
      values.ProductType,
      values.Description
    );
    if (values.packaging.IsRx === false && suspectedRx && !values.packaging.confirmOtcOverride) {
      setFormError(
        'Tên hoặc nhóm thuốc có dấu hiệu thuộc danh mục kê đơn (Rx). Vui lòng chọn Rx hoặc tích xác nhận ngoại lệ OTC.'
      );
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    if (!editingProduct && values.Quantity > 0) {
      const batch = (values.InitialBatchNumber || '').trim();
      const expiry = (values.InitialExpiryDate || '').trim();
      if (batch.length < 2) {
        setFormError('Khi khai báo tồn đầu kỳ (> 0), vui lòng nhập Số lô sản xuất thật (tối thiểu 2 ký tự).');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry < todayIso) {
        setFormError('Khi khai báo tồn đầu kỳ (> 0), vui lòng nhập Hạn dùng hợp lệ (không ở quá khứ).');
        return;
      }
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const payload: ProductFormValues = {
        ...values,
        InitialBatchNumber:
          !editingProduct && values.Quantity > 0
            ? (values.InitialBatchNumber || '').trim()
            : undefined,
        InitialExpiryDate:
          !editingProduct && values.Quantity > 0
            ? (values.InitialExpiryDate || '').trim()
            : undefined,
      };
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể lưu dữ liệu dược phẩm';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4">
        <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 sm:px-6 py-3.5 shrink-0">
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
        <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
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
                  {editingProduct
                    ? 'Số lượng tồn kho (Điều chỉnh qua Nhập/Kiểm kê)'
                    : 'Số lượng tồn kho ban đầu (Khuyến nghị = 0)'}
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  readOnly={Boolean(editingProduct)}
                  value={values.Quantity}
                  onChange={(e) => setValues({ ...values, Quantity: Number(e.target.value) })}
                  className={`w-full h-9 rounded-lg border border-zinc-200 px-3 text-xs tabular-nums shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                    editingProduct
                      ? 'bg-zinc-100 text-zinc-500 cursor-not-allowed'
                      : 'bg-white text-zinc-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Giá bán lẻ niêm yết (VNĐ / {values.Unit})
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  required
                  value={values.Price}
                  onChange={(e) => {
                    const price = Number(e.target.value);
                    setValues({
                      ...values,
                      Price: price,
                      packaging: {
                        ...values.packaging,
                        WholesalePrice: Math.round((price * 0.88) / 500) * 500,
                      },
                    });
                  }}
                  className="w-full h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 tabular-nums shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {!editingProduct && values.Quantity > 0 && (
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">
                      Số lô SX đầu kỳ (Bắt buộc) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: LOT-2026A"
                      value={values.InitialBatchNumber || ''}
                      onChange={(e) =>
                        setValues({ ...values, InitialBatchNumber: e.target.value })
                      }
                      className="w-full h-9 rounded-lg border border-amber-300 bg-white px-3 font-mono text-xs text-zinc-900 shadow-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">
                      Hạn dùng (ExpiryDate) *
                    </label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().slice(0, 10)}
                      value={values.InitialExpiryDate || ''}
                      onChange={(e) =>
                        setValues({ ...values, InitialExpiryDate: e.target.value })
                      }
                      className="w-full h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs text-zinc-900 shadow-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {formError && (
                <div className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {formError}
                </div>
              )}

              {/* Khối Cấu hình Quy cách Đóng gói 4 cấp & Giá Bán Buôn B2B */}
              <div className="sm:col-span-2 rounded-xl border border-teal-200/80 bg-teal-50/40 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-teal-900">
                      Quy cách đóng gói 4 cấp (GPP) & Giá Bán Buôn Đại lý B2B (GDP)
                    </h3>
                    <p className="text-[11px] text-teal-700/80">
                      Hỗ trợ bán lẻ cắt liều (Hộp → Vỉ → Viên) và phân loại thuốc kê đơn (Rx)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(values.packaging?.AllowFractionalSale)}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            packaging: {
                              ...values.packaging,
                              AllowFractionalSale: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span>Cho phép bán lẻ Vỉ/Viên</span>
                    </label>
                  </div>

                  {/* Phân loại kê đơn (Rx / OTC) — Bắt buộc chọn tường minh, không mặc định false */}
                  <div className="mt-2 rounded-lg border border-rose-200/80 bg-white/80 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-800">
                        Phân loại kiểm soát kê đơn <span className="text-rose-500">*</span>
                      </span>
                      {typeof values.packaging?.IsRx !== 'boolean' && (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          Chưa chọn OTC / Rx
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                          values.packaging?.IsRx === false
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="product-rx-classification"
                          checked={values.packaging?.IsRx === false}
                          onChange={() =>
                            setValues({
                              ...values,
                              packaging: {
                                ...values.packaging,
                                IsRx: false,
                                confirmOtcOverride: false,
                              },
                            })
                          }
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Không kê đơn (OTC)</span>
                      </label>
                      <label
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                          values.packaging?.IsRx === true
                            ? 'border-rose-500 bg-rose-50 text-rose-900'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="product-rx-classification"
                          checked={values.packaging?.IsRx === true}
                          onChange={() =>
                            setValues({
                              ...values,
                              packaging: {
                                ...values.packaging,
                                IsRx: true,
                                confirmOtcOverride: false,
                              },
                            })
                          }
                          className="text-rose-600 focus:ring-rose-500"
                        />
                        <span>Thuốc kê đơn (Rx — bắt buộc toa)</span>
                      </label>
                    </div>
                    {isSuspectedRxProduct(values.ProductName, values.ProductType, values.Description) &&
                      values.packaging?.IsRx !== true && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 space-y-1.5">
                          <div className="font-semibold">
                            Gợi ý: Tên hoặc nhóm thuốc này có dấu hiệu là thuốc kê đơn (Rx).
                          </div>
                          {values.packaging?.IsRx === false && (
                            <label className="flex items-start gap-2 font-semibold text-amber-950 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(values.packaging?.confirmOtcOverride)}
                                onChange={(e) =>
                                  setValues({
                                    ...values,
                                    packaging: {
                                      ...values.packaging,
                                      confirmOtcOverride: e.target.checked,
                                    },
                                  })
                                }
                                className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                              />
                              <span>
                                Xác nhận Dược sĩ: sản phẩm này thực sự là thuốc không kê đơn (OTC)
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Giá sỉ B2B (VNĐ/{values.Unit})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={values.packaging?.WholesalePrice ?? Math.round(values.Price * 0.88)}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          packaging: {
                            ...values.packaging,
                            WholesalePrice: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-indigo-700 tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      SL tối thiểu hưởng giá sỉ
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={values.packaging?.MinWholesaleQty ?? 10}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          packaging: {
                            ...values.packaging,
                            MinWholesaleQty: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Số {values.Unit} / 1 Thùng
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={values.packaging?.BoxesPerCarton ?? 20}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          packaging: {
                            ...values.packaging,
                            BoxesPerCarton: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Tổng Viên / 1 {values.Unit}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={values.packaging?.UnitsPerPackage ?? 100}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          packaging: {
                            ...values.packaging,
                            UnitsPerPackage: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 tabular-nums"
                    />
                  </div>
                </div>
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
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-zinc-200 bg-zinc-50/50 shrink-0">
            <span className="hidden sm:inline text-xs text-zinc-400">
              Nhấn <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded font-mono text-[11px] text-zinc-600">Alt S</kbd> để lưu nhanh
            </span>
            <div className="flex items-center gap-2 ml-auto">
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
    </ModalPortal>
  );
};
