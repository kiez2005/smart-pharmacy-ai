import React from 'react';
import { Table } from '@tanstack/react-table';
import { Columns, Eye, EyeOff } from 'lucide-react';
import { Product } from '../../types/product';

interface ColumnVisibilityMenuProps {
  table: Table<Product>;
  isOpen: boolean;
  onToggle: () => void;
}

const COLUMN_LABELS: Record<string, string> = {
  ProductID: 'Mã SP (ProductID)',
  PathImage: 'Hình ảnh (PathImage)',
  ProductName: 'Tên thuốc (ProductName)',
  ProductType: 'Nhóm thuốc (ProductType)',
  Quantity: 'Số lượng (Quantity)',
  Unit: 'Đơn vị (Unit)',
  Price: 'Đơn giá (Price)',
  Description: 'Mô tả (Description)',
  CreateDate: 'Ngày tạo (CreateDate)',
  UpdateDate: 'Ngày sửa (UpdateDate)',
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
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        title="Cấu hình Ẩn/Hiện cột của Table (Phím tắt: Alt + K)"
      >
        <Columns className="h-4 w-4 text-teal-600" />
        <span>Ẩn/Hiện Cột (Alt+K)</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white p-3 shadow-xl border border-slate-200 z-40">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cấu hình cột (Yêu cầu #10)
            </span>
            <button
              type="button"
              onClick={() => table.toggleAllColumnsVisible(true)}
              className="text-xs font-semibold text-teal-600 hover:underline"
            >
              Hiện tất cả
            </button>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {table
              .getAllLeafColumns()
              .filter((col) => col.id !== 'select' && col.id !== 'actions')
              .map((column) => {
                const isVisible = column.getIsVisible();
                return (
                  <label
                    key={column.id}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={column.getToggleVisibilityHandler()}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span>{COLUMN_LABELS[column.id] || column.id}</span>
                    </div>
                    {isVisible ? (
                      <Eye className="h-3.5 w-3.5 text-teal-600" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </label>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
