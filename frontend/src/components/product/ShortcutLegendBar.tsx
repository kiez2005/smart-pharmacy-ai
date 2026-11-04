import React from 'react';
import { Copy, Trash2, X } from 'lucide-react';

interface ShortcutLegendBarProps {
  onNew: () => void;
  onFocusSearch: () => void;
  onBulkDelete: () => void;
  onBulkClone: () => void;
  onToggleColumns: () => void;
  onImport: () => void;
  onExportExcel: () => void;
  selectedCount: number;
  onClearSelection?: () => void;
}

/**
 * FLOATING SELECTION BAR (Chuẩn thiết kế Linear / Shadcn Table)
 * Chỉ xuất hiện tinh tế ở giữa đáy màn hình khi người dùng chọn các dòng trong bảng.
 */
export const ShortcutLegendBar: React.FC<ShortcutLegendBarProps> = ({
  onBulkDelete,
  onBulkClone,
  selectedCount,
  onClearSelection,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-white shadow-xl border border-zinc-800">
        <div className="flex items-center gap-2 pr-2 border-r border-zinc-700 text-[13px] font-medium">
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded bg-teal-500/20 px-1.5 text-xs font-semibold text-teal-300 tabular-nums">
            {selectedCount}
          </span>
          <span className="text-zinc-200">mục đã chọn</span>
        </div>

        <button
          type="button"
          onClick={onBulkClone}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <Copy className="h-3.5 w-3.5 text-zinc-400" />
          <span>Nhân bản</span>
          <kbd className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-700">
            Alt D
          </kbd>
        </button>

        <button
          type="button"
          onClick={onBulkDelete}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-rose-300 hover:bg-rose-950/60 hover:text-rose-200 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5 text-rose-400" />
          <span>Xóa</span>
          <kbd className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-700">
            Alt H
          </kbd>
        </button>

        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            title="Bỏ chọn"
            className="ml-1 rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
