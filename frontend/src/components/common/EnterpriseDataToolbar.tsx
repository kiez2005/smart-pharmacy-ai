import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Mic,
  Upload,
  Download,
  SlidersHorizontal,
  Plus,
  FileSpreadsheet,
  FileJson,
  FileCode,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { enterpriseApi } from '../../services/enterprise.api';
import { ShortcutLegendBar } from '../product/ShortcutLegendBar';

export interface ColumnConfig {
  id: string;
  label: string;
}

interface EnterpriseToolbarProps {
  entity: string;
  title: string;
  subtitle: string;
  createLabel: string;
  search: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  columns: ColumnConfig[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (colId: string) => void;
  selectedCount: number;
  onClearSelection: () => void;
  onOpenCreate: () => void;
  onBulkDelete: () => void;
  onBulkClone: () => void;
  onEditSelected?: () => void;
  onViewSelected?: () => void;
  onCloneSelected?: () => void;
  onReload: () => Promise<void> | void;
  extraFilters?: React.ReactNode;
}

export const EnterpriseToolbar: React.FC<EnterpriseToolbarProps> = ({
  entity,
  title,
  subtitle,
  createLabel,
  search,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm theo mã, tên hoặc nội dung... (Alt + F)',
  columns,
  visibleColumns,
  onToggleColumn,
  selectedCount,
  onClearSelection,
  onOpenCreate,
  onBulkDelete,
  onBulkClone,
  onEditSelected,
  onViewSelected,
  onCloneSelected,
  onReload,
  extraFilters,
}) => {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isColumnOpen, setIsColumnOpen] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = (format: 'xlsx' | 'json' | 'xml') => {
    const url = enterpriseApi.getExportUrl(entity, format);
    window.open(url, '_blank');
    setIsExportOpen(false);
    toast.success(`Đang xuất tệp dữ liệu .${format}`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;
    setImporting(true);
    try {
      const count = await enterpriseApi.importFile(entity, pendingImportFile);
      toast.success(`Đã nhập thành công ${count} bản ghi từ "${pendingImportFile.name}"`);
      setPendingImportFile(null);
      await onReload();
    } catch {
      toast.error('Tệp nhập vào không hợp lệ (.xlsx, .json, .xml)');
    } finally {
      setImporting(false);
    }
  };

  const handleVoiceSearch = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Trình duyệt không hỗ trợ nhận diện giọng nói');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListeningVoice(true);
      toast.info('Đang nghe giọng nói Tiếng Việt...');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) {
        onSearchChange(transcript.replace(/\.$/, ''));
      }
    };

    recognition.onend = () => {
      setIsListeningVoice(false);
    };

    recognition.start();
  };

  // Phím tắt toàn cục chuẩn 11 chức năng (Alt + N/F/H/D/C/E/V/I/X/K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        onOpenCreate();
      } else if (key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (key === 'h') {
        e.preventDefault();
        onBulkDelete();
      } else if (key === 'd') {
        e.preventDefault();
        onBulkClone();
      } else if (key === 'c') {
        e.preventDefault();
        onCloneSelected?.();
      } else if (key === 'e') {
        e.preventDefault();
        onEditSelected?.();
      } else if (key === 'v') {
        e.preventDefault();
        onViewSelected?.();
      } else if (key === 'i') {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (key === 'x') {
        e.preventDefault();
        handleExport('xlsx');
      } else if (key === 'k') {
        e.preventDefault();
        setIsColumnOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <>
      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.json,.xml"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Nhập dữ liệu từ tệp Excel, JSON, XML (Alt + I)"
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>Nhập dữ liệu</span>
          </button>

          {/* Menu Xuất tệp (.xlsx, .json, .xml) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportOpen((p) => !p)}
              title="Xuất dữ liệu ra tệp (Alt + X)"
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Xuất tệp</span>
            </button>
            {isExportOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-30 text-xs">
                <button
                  type="button"
                  onClick={() => handleExport('xlsx')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  <FileJson className="h-3.5 w-3.5 text-amber-600" />
                  <span>JSON (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('xml')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  <FileCode className="h-3.5 w-3.5 text-sky-600" />
                  <span>XML (.xml)</span>
                </button>
              </div>
            )}
          </div>

          {/* Menu Ẩn/Hiện cột (Alt + K) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColumnOpen((p) => !p)}
              title="Tùy chỉnh ẩn/hiện cột (Alt + K)"
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <span>Hiển thị cột</span>
            </button>
            {isColumnOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg z-30 text-xs space-y-1">
                <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 border-b border-slate-100">
                  Tùy chỉnh cột hiển thị (Alt+K)
                </div>
                {columns.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.id] !== false}
                      onChange={() => onToggleColumn(col.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-slate-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 text-xs font-semibold text-white hover:bg-teal-700 shadow-xs transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{createLabel}</span>
          </button>
        </div>
      </div>

      {/* Thanh Tìm kiếm, Giọng nói & Bộ lọc */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-8.5 rounded-lg border border-slate-300 pl-8 pr-3 text-xs text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 focus:outline-none transition-all"
            />
          </div>
          <button
            type="button"
            onClick={handleVoiceSearch}
            title="Tìm kiếm bằng giọng nói Tiếng Việt"
            className={`inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border transition-colors ${
              isListeningVoice
                ? 'border-rose-500 bg-rose-50 text-rose-600'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
          </button>
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="inline-flex h-8.5 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Đặt lại</span>
            </button>
          )}
        </div>

        {extraFilters && <div className="flex items-center gap-2 flex-wrap">{extraFilters}</div>}
      </div>

      {/* Modal Xem trước & Xác nhận Tệp Import */}
      {pendingImportFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Xác nhận Nhập Dữ liệu từ Tệp
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Kiểm tra thông tin tệp trước khi đồng bộ vào bảng dữ liệu
              </p>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="rounded-md bg-zinc-50 p-3 border border-zinc-200/80 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tên tệp dữ liệu:</span>
                  <span className="font-mono font-semibold text-zinc-900">
                    {pendingImportFile.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Định dạng nhận diện:</span>
                  <span className="uppercase font-semibold text-emerald-700">
                    {pendingImportFile.name.split('.').pop()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Dung lượng tệp:</span>
                  <span className="tabular-nums text-zinc-800">
                    {(pendingImportFile.size / 1024).toFixed(2)} KB
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 bg-zinc-50/50">
              <button
                type="button"
                onClick={() => setPendingImportFile(null)}
                className="h-8 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => void handleConfirmImport()}
                className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white"
              >
                {importing ? 'Đang nhập...' : 'Xác nhận Nhập dữ liệu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thanh điều khiển nổi khi chọn Checkbox */}
      <ShortcutLegendBar
        onNew={onOpenCreate}
        onFocusSearch={() => searchInputRef.current?.focus()}
        onBulkDelete={onBulkDelete}
        onBulkClone={onBulkClone}
        onToggleColumns={() => setIsColumnOpen((p) => !p)}
        onImport={() => fileInputRef.current?.click()}
        onExportExcel={() => handleExport('xlsx')}
        selectedCount={selectedCount}
        onClearSelection={onClearSelection}
      />
    </>
  );
};

interface EnterprisePaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export const EnterprisePagination: React.FC<EnterprisePaginationProps> = ({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200/80 px-4 py-3 text-xs text-slate-500 bg-white">
      <div className="flex items-center gap-2">
        <span>Số dòng hiển thị</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
        >
          <option value={10}>10</option>
          <option value={12}>12</option>
          <option value={15}>15</option>
        </select>
        <span className="text-slate-300">|</span>
        <span className="tabular-nums">
          Trang <strong className="text-slate-800">{page}</strong> / {Math.max(1, totalPages)} ({totalItems} bản ghi)
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Trước</span>
        </button>

        {Array.from({ length: Math.max(1, totalPages) }, (_, idx) => idx + 1).map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => onPageChange(pageNum)}
            className={`h-7 min-w-[28px] rounded-md px-2 text-xs font-semibold tabular-nums transition-colors ${
              pageNum === page
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {pageNum}
          </button>
        ))}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <span>Sau</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
