import React from 'react';
import { X, Calendar, Package, Tag, Edit3, Copy } from 'lucide-react';
import { Product } from '../../types/product';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onClone: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onEdit,
  onClone,
}) => {
  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-teal-500/20 border border-teal-400/40 px-2.5 py-0.5 text-xs font-mono font-bold text-teal-300">
              #{product.ProductID}
            </span>
            <h2 className="text-base font-bold truncate max-w-md">{product.ProductName}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row gap-5">
            <img
              src={product.PathImage}
              alt={product.ProductName}
              className="h-36 w-36 rounded-2xl object-cover border border-slate-200 bg-slate-50 shrink-0"
            />
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 border border-teal-200">
                  <Tag className="h-3.5 w-3.5" />
                  {product.ProductType}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                  <Package className="h-3.5 w-3.5" />
                  Đơn vị: {product.Unit}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                  <div className="text-xs text-slate-500">Đơn giá (Price)</div>
                  <div className="text-lg font-extrabold text-teal-700">
                    {product.Price.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                  <div className="text-xs text-slate-500">Tồn kho (Quantity)</div>
                  <div className="text-lg font-extrabold text-slate-800">
                    {product.Quantity} <span className="text-xs font-normal">{product.Unit}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Mô tả Hoạt chất, Công dụng & Liều dùng (Description)
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {product.Description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span>
                Ngày tạo (CreateDate):{' '}
                <strong className="text-slate-700">
                  {new Date(product.CreateDate).toLocaleString('vi-VN')}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span>
                Cập nhật (UpdateDate):{' '}
                <strong className="text-slate-700">
                  {new Date(product.UpdateDate).toLocaleString('vi-VN')}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              onClick={() => {
                onClose();
                onClone(product);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              Sao chép bản ghi (Alt+C)
            </button>
            <button
              onClick={() => {
                onClose();
                onEdit(product);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <Edit3 className="h-4 w-4" />
              Chỉnh sửa (Alt+E)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
