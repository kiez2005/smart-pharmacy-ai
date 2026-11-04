import React from 'react';
import { X, Copy, Pencil } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-2 sm:p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl border border-zinc-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 sm:px-6 py-3.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-mono font-medium text-zinc-600 tabular-nums shrink-0">
              SKU #{product.ProductID}
            </span>
            <h2 className="text-sm font-semibold text-zinc-900 truncate">
              {product.ProductName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          <div className="flex flex-col sm:flex-row gap-4">
            <img
              src={product.PathImage}
              alt={product.ProductName}
              className="h-28 w-28 sm:h-24 sm:w-24 rounded-lg object-cover border border-zinc-200 bg-zinc-50 shrink-0 self-center sm:self-start"
            />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  {product.ProductType}
                </span>
                <span className="inline-flex items-center rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                  Đơn vị: {product.Unit}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="text-xs text-zinc-500">Giá bán niêm yết</div>
                  <div className="text-base font-semibold text-zinc-900 tabular-nums mt-0.5">
                    {product.Price.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Tồn kho khả dụng</div>
                  <div className="text-base font-semibold text-zinc-900 tabular-nums mt-0.5">
                    {product.Quantity.toLocaleString('vi-VN')} {product.Unit}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-50 p-3.5 border border-zinc-200/80 space-y-1">
            <div className="text-xs font-medium text-zinc-500">
              Thành phần hoạt chất & hướng dẫn lâm sàng
            </div>
            <p className="text-xs text-zinc-800 leading-relaxed whitespace-pre-line">
              {product.Description || 'Chưa có thông tin mô tả chi tiết.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            <div>
              Ngày khởi tạo:{' '}
              <span className="font-medium text-zinc-700 tabular-nums">
                {new Date(product.CreateDate).toLocaleDateString('vi-VN')}
              </span>
            </div>
            <div className="sm:text-right">
              Cập nhật cuối:{' '}
              <span className="font-medium text-zinc-700 tabular-nums">
                {new Date(product.UpdateDate).toLocaleDateString('vi-VN')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t border-zinc-200 bg-zinc-50/50 shrink-0">
          <button
            onClick={() => {
              onClose();
              onClone(product);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <Copy className="h-3.5 w-3.5 text-zinc-500" />
            <span>Nhân bản</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onEdit(product);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Chỉnh sửa</span>
          </button>
        </div>
      </div>
    </div>
  );
};
