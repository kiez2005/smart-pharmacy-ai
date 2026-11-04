import React from 'react';
import { VisibilityState } from '@tanstack/react-table';
import { SlidersHorizontal } from 'lucide-react';

interface ColumnVisibilityMenuProps {
  columnVisibility: VisibilityState;
  onToggleColumn: (columnId: string) => void;
  onResetAll: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

const COLUMN_LIST: Array<{ id: string; label: string }> = [
  { id: 'ProductID', label: 'Mã SKU' },
  { id: 'PathImage', label: 'Ảnh minh họa' },
  { id: 'ProductName', label: 'Tên dược phẩm' },
  { id: 'ProductType', label: 'Nhóm dược lý' },
  { id: 'Quantity', label: 'Tồn kho' },
  { id: 'Unit', label: 'Đơn vị tính' },
  { id: 'Price', label: 'Giá bán lẻ' },
  { id: 'Description', label: 'Hoạt chất & Chỉ định' },
  { id: 'CreateDate', label: 'Ngày khởi tạo' },
  { id: 'UpdateDate', label: 'Cập nhật cuối' },
];

export const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({
  columnVisibility,
  onToggleColumn,
  onResetAll,
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
        <div className="absolute right-0 mt-1.5 w-56 rounded-lg bg-white p-2 shadow-lg border border-zinc-200 z-40">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-zinc-100">
            <span className="text-[11px] font-semibold text-zinc-500">
              Tùy chỉnh cột (Alt+K)
            </span>
            <button
              type="button"
              onClick={onResetAll}
              className="text-[11px] font-medium text-zinc-900 hover:underline"
            >
              Hiện tất cả
            </button>
          </div>

          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {COLUMN_LIST.map((col) => {
              const isVisible = columnVisibility[col.id] !== false;
              return (
                <label
                  key={col.id}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-100/80 transition-colors cursor-pointer select-none"
                >
                  <span>{col.label}</span>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => onToggleColumn(col.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
