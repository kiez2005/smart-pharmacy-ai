import React from 'react';
import { Keyboard } from 'lucide-react';

interface ShortcutLegendBarProps {
  onNew: () => void;
  onFocusSearch: () => void;
  onBulkDelete: () => void;
  onBulkClone: () => void;
  onToggleColumns: () => void;
  onImport: () => void;
  onExportExcel: () => void;
  selectedCount: number;
}

export const ShortcutLegendBar: React.FC<ShortcutLegendBarProps> = ({
  onNew,
  onFocusSearch,
  onBulkDelete,
  onBulkClone,
  onToggleColumns,
  onImport,
  onExportExcel,
  selectedCount,
}) => {
  const shortcuts = [
    { key: 'Alt + N', label: 'Thêm mới', action: onNew },
    { key: 'Alt + S', label: 'Lưu Form', action: () => {} },
    { key: 'Alt + F', label: 'Tìm kiếm', action: onFocusSearch },
    {
      key: 'Alt + H',
      label: `Xóa (${selectedCount})`,
      action: onBulkDelete,
      highlight: selectedCount > 0,
    },
    {
      key: 'Alt + D',
      label: `Sao chép nhiều (${selectedCount})`,
      action: onBulkClone,
      highlight: selectedCount > 0,
    },
    { key: 'Alt + I', label: 'Import File', action: onImport },
    { key: 'Alt + X', label: 'Export Excel', action: onExportExcel },
    { key: 'Alt + K', label: 'Ẩn/Hiện cột', action: onToggleColumns },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-slate-900/95 backdrop-blur px-4 py-2 text-white shadow-lg">
      <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-teal-400">
          <Keyboard className="h-4 w-4" />
          <span>Phím tắt CRUD (Yêu cầu #11):</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shortcuts.map((sc) => (
            <button
              key={sc.key}
              type="button"
              onClick={sc.action}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition ${
                sc.highlight
                  ? 'bg-teal-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <kbd className="rounded bg-slate-950/70 px-1.5 py-0.5 font-mono text-[11px] text-teal-300 border border-slate-700">
                {sc.key}
              </kbd>
              <span>{sc.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
