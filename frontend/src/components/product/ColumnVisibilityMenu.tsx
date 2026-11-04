import React from 'react';
import { Table } from '@tanstack/react-table';
import { SlidersHorizontal, Check } from 'lucide-react';
import { Product } from '../../types/product';

interface ColumnVisibilityMenuProps {
  table: Table<Product>;
  isOpen: boolean;
  onToggle: () => void;
}

const COLUMN_LABELS: Record<string, string> = {
  ProductID: 'Mã SKU',
  PathImage: 'Ảnh minh họa',
  ProductName: 'Tên dược phẩm',
  ProductType: 'Nhóm dược lý',
  Quantity: 'Tồn kho',
  Unit: 'Đơn vị tính',
  Price: 'Giá bán lẻ',
  Description: 'Hoạt chất & Chỉ định',
  CreateDate: 'Ngày khởi tạo',
  UpdateDate: 'Cập nhật cuối',
};

export const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({
  table,
  isOpen,
  onToggle,
}) => {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:bg-zinc-50 transition-colors"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.75} />
        <span>Cột hiển thị</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-lg bg-white p-1.5 shadow-lg border border-zinc-200 z-40">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-zinc-100">
            <span className="text-[11px] font-medium text-zinc-500">Tùy chỉnh cột dữ liệu</span>
            <button
              type="button"
              onClick={() => table.toggleAllColumnsVisible(true)}
              className="text-[11px] font-medium text-zinc-900 hover:underline"
            >
              Mặc định
            </button>
          </div>

          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {table
              .getAllLeafColumns()
              .filter((col) => col.id !== 'select' && col.id !== 'actions')
              .map((column) => {
                const isVisible = column.getIsVisible();
                return (
                  <button
                    key={column.id}
                    type="button"
                    onClick={column.getToggleVisibilityHandler()}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-100/80 transition-colors"
                  >
                    <span>{COLUMN_LABELS[column.id] || column.id}</span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        isVisible
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-300 bg-white'
                      }`}
                    >
                      {isVisible && <Check className="h-3 w-3" strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
