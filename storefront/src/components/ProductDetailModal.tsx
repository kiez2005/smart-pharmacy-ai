import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Minus,
  ShoppingBag,
  FilePlus2,
  Package,
} from 'lucide-react';
import { Product, UnitMode } from '../types';
import {
  formatVND,
  getEffectivePrice,
  getMaxStockForMode,
  getPackagingSpec,
  getStockStatusBadgeInfo,
  getUnitLabel,
  getUnitName,
} from '../utils/packaging';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, mode: UnitMode, quantity: number) => void;
  onOpenPrescriptionModal: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onOpenPrescriptionModal,
}) => {
  const spec = getPackagingSpec(product);
  const [unitMode, setUnitMode] = useState<UnitMode>('BASE');
  const [quantity, setQuantity] = useState(1);

  const unitOptions: Array<{ mode: UnitMode; label: string; max: number }> = [
    {
      mode: 'BASE',
      label: spec.PackageUnit,
      max: getMaxStockForMode(product, 'BASE'),
    },
  ];
  if (spec.BlisterUnit && spec.BlistersPerPackage && spec.BlistersPerPackage > 1) {
    unitOptions.push({
      mode: 'BLISTER',
      label: spec.BlisterUnit,
      max: getMaxStockForMode(product, 'BLISTER'),
    });
  }
  if (spec.AllowFractionalSale && spec.UnitsPerPackage > 1) {
    unitOptions.push({
      mode: 'PILL',
      label: `${spec.SmallestUnit} lẻ`,
      max: getMaxStockForMode(product, 'PILL'),
    });
  }

  const maxStock = getMaxStockForMode(product, unitMode);
  const currentPrice = getEffectivePrice(product, unitMode);
  const stockBadge = getStockStatusBadgeInfo(product);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
              {product.ProductType}
            </span>
            {product.IsRx ? (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                Thuốc Kê Đơn (Rx)
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                Thuốc Không Kê Đơn (OTC)
              </span>
            )}
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${stockBadge.className}`}>
              {stockBadge.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-5 gap-5 text-xs">
          {/* Image */}
          <div className="md:col-span-2 space-y-3">
            <div className="aspect-square rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden">
              <img
                src={product.PathImage}
                alt={product.ProductName}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-[11px]">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-teal-600" />
                <span>Quy cách đóng gói:</span>
              </div>
              <div className="text-slate-600">
                1 {spec.PackageUnit} ={' '}
                {spec.BlistersPerPackage ? `${spec.BlistersPerPackage} ${spec.BlisterUnit} = ` : ''}
                {spec.UnitsPerPackage} {spec.SmallestUnit}
              </div>
              <div className="text-slate-600 pt-1 border-t border-slate-200/70">
                Xuất kho kiểm duyệt FEFO chuẩn GPP — kiểm tra hạn dùng khi nhận hàng.
              </div>
            </div>
          </div>

          {/* Info & Buy Controls */}
          <div className="md:col-span-3 space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 leading-snug">
                {product.ProductName}
              </h2>
              <p className="text-slate-600 mt-1.5 leading-relaxed">{product.Description}</p>
            </div>

            {product.IsRx && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2 text-rose-900">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Quy định thuốc kê đơn (Rx):</strong> Cần có chỉ định của Bác sĩ & xác nhận của Dược sĩ lâm sàng trước khi giao thuốc. Bạn có thể gửi ảnh toa thuốc hoặc đính kèm ảnh toa ngay trong bước thanh toán.
                </div>
              </div>
            )}

            <div className="rounded-xl bg-teal-50/70 border border-teal-200 p-3.5">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-teal-800 tabular-nums">
                  {formatVND(currentPrice)}
                </span>
                <span className="text-slate-500 font-medium">
                  / {getUnitLabel(product, unitMode)}
                </span>
              </div>
            </div>

            {/* Chọn đơn vị tính */}
            <div className="space-y-1.5">
              <div className="font-bold text-slate-700">Chọn đơn vị mua:</div>
              <div className="flex flex-wrap gap-2">
                {unitOptions.map((opt) => (
                  <button
                    key={opt.mode}
                    type="button"
                    disabled={opt.max <= 0}
                    onClick={() => {
                      setUnitMode(opt.mode);
                      setQuantity(1);
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      unitMode === opt.mode
                        ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                        : opt.max <= 0
                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Số lượng */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-700">Số lượng:</span>
                <div className="flex items-center rounded-xl border border-slate-300 bg-white">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="h-8 w-8 flex items-center justify-center hover:bg-slate-100 rounded-l-xl"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center font-extrabold tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(Math.max(1, maxStock), q + 1))}
                    className="h-8 w-8 flex items-center justify-center hover:bg-slate-100 rounded-r-xl"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                Đặt tối đa/đơn: <strong className="text-teal-700">{maxStock}</strong>{' '}
                {getUnitName(product, unitMode)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                disabled={maxStock <= 0}
                onClick={() => {
                  onAddToCart(product, unitMode, quantity);
                  onClose();
                }}
                className={`flex-1 h-10 rounded-xl font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors ${
                  maxStock <= 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-teal-600 text-white hover:bg-teal-700'
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                <span>
                  {maxStock <= 0
                    ? 'Tạm hết hàng'
                    : `Thêm vào giỏ · ${formatVND(currentPrice * quantity)}`}
                </span>
              </button>

              {product.IsRx && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPrescriptionModal();
                  }}
                  className="h-10 px-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 inline-flex items-center justify-center gap-1.5"
                >
                  <FilePlus2 className="h-4 w-4" />
                  <span>Gửi Toa Nhờ Tư Vấn</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-medium pt-1">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Cam kết thuốc thật 100%, kiểm tra hạn dùng trước khi nhận hàng</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
