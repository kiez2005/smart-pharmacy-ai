import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  RowSelectionState,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table';
import {
  Plus,
  Search,
  Trash2,
  Copy,
  Download,
  Upload,
  Eye,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Mic,
  FileSpreadsheet,
  FileJson,
  FileCode,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExportFormat, Product, ProductFormValues } from '../types/product';
import { productApi } from '../services/product.api';
import { ProductFormModal } from '../components/product/ProductFormModal';
import { ProductDetailModal } from '../components/product/ProductDetailModal';
import { ColumnVisibilityMenu } from '../components/product/ColumnVisibilityMenu';
import { ShortcutLegendBar } from '../components/product/ShortcutLegendBar';

export const ProductManagementPage: React.FC = () => {
  // Dữ liệu & Phân trang (Yêu cầu #1: 10 - 15 item/page)
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Bộ lọc & Tìm kiếm thông minh (Yêu cầu #6 & Gợi ý AI #8: Meilisearch / Fuse.js)
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [searchEngineInfo, setSearchEngineInfo] = useState<{
    engine: string;
    processingTimeMs: number;
  } | null>(null);

  // Trạng thái chọn dòng Checkbox & Ẩn/Hiện cột (Yêu cầu #5, #8, #10)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const saved = localStorage.getItem('pharmacy_product_columns');
    return saved ? (JSON.parse(saved) as VisibilityState) : {};
  });
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);

  // Modals (Thêm/Sửa/Chi tiết)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isListeningVoice, setIsListeningVoice] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lưu cấu hình Ẩn/Hiện cột vào localStorage
  useEffect(() => {
    localStorage.setItem('pharmacy_product_columns', JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  // Debounce từ khóa tìm kiếm 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Tải danh sách sản phẩm từ Backend
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productApi.list({
        page,
        limit,
        search: debouncedSearch,
        type: selectedType,
        unit: selectedUnit,
      });
      setProducts(data.items);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
      setAvailableTypes(data.filters.types);
      setAvailableUnits(data.filters.units);
      if (data.searchMeta) {
        setSearchEngineInfo(data.searchMeta);
      }
      setRowSelection({});
    } catch (error) {
      toast.error('Không thể tải danh sách thuốc từ máy chủ Backend');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, selectedType, selectedUnit]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // Danh sách các bản ghi đang được chọn từ ô Checkbox
  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((index) => products[Number(index)]?.ProductID)
      .filter((id): id is number => Boolean(id));
  }, [rowSelection, products]);

  // ============================================================================
  // CÁC HÀM XỬ LÝ NGHIỆP VỤ CRUD & BULK ACTIONS
  // ============================================================================

  const handleOpenCreate = useCallback(() => {
    setEditingProduct(null);
    setIsFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((product: Product) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  }, []);

  const handleFormSubmit = async (values: ProductFormValues) => {
    try {
      if (editingProduct) {
        await productApi.update(editingProduct.ProductID, values);
        toast.success(`Đã cập nhật thuốc "${values.ProductName}"`);
      } else {
        await productApi.create(values);
        toast.success(`Đã thêm mới thuốc "${values.ProductName}"`);
      }
      await loadProducts();
    } catch {
      toast.error('Lỗi khi lưu thông tin sản phẩm');
    }
  };

  // #5a: Xóa 1 bản ghi
  const handleDeleteOne = useCallback(
    async (product: Product) => {
      if (!window.confirm(`Bạn có chắc chắn muốn xóa thuốc "${product.ProductName}" (#${product.ProductID})?`)) {
        return;
      }
      try {
        await productApi.removeOne(product.ProductID);
        toast.success(`Đã xóa thuốc #${product.ProductID}`);
        await loadProducts();
      } catch {
        toast.error('Không thể xóa thuốc này (thuốc đang nằm trong hóa đơn đã bán)');
      }
    },
    [loadProducts]
  );

  // #5b: Xóa nhiều bản ghi từ ô Checkbox
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) {
      toast.warning('Vui lòng tick chọn ít nhất 1 ô checkbox để xóa!');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} sản phẩm đã chọn?`)) {
      return;
    }
    try {
      const count = await productApi.bulkRemove(selectedIds);
      toast.success(`Đã xóa hàng loạt ${count} sản phẩm`);
      await loadProducts();
    } catch {
      toast.error('Lỗi khi xóa hàng loạt bản ghi');
    }
  }, [selectedIds, loadProducts]);

  // #7: Sao chép 1 bản ghi
  const handleCloneOne = useCallback(
    async (product: Product) => {
      try {
        const cloned = await productApi.cloneOne(product.ProductID);
        toast.success(`Đã sao chép "${product.ProductName}" -> Mã mới #${cloned.ProductID}`);
        await loadProducts();
      } catch {
        toast.error('Lỗi khi sao chép sản phẩm');
      }
    },
    [loadProducts]
  );

  // #8: Sao chép nhiều bản ghi từ ô Checkbox
  const handleBulkClone = useCallback(async () => {
    if (selectedIds.length === 0) {
      toast.warning('Vui lòng tick chọn ít nhất 1 ô checkbox để sao chép hàng loạt!');
      return;
    }
    try {
      const clonedList = await productApi.bulkClone(selectedIds);
      toast.success(`Đã sao chép hàng loạt ${clonedList.length} sản phẩm!`);
      await loadProducts();
    } catch {
      toast.error('Lỗi khi sao chép nhiều bản ghi');
    }
  }, [selectedIds, loadProducts]);

  // #9a: Xuất dữ liệu ra Excel (.xlsx), JSON (.json), XML (.xml)
  const handleExport = useCallback((format: ExportFormat) => {
    const url = productApi.getExportUrl(format);
    window.open(url, '_blank');
    setIsExportMenuOpen(false);
    toast.success(`Đang tải xuống file định dạng .${format.toUpperCase()}`);
  }, []);

  // #9b: Nhập dữ liệu từ file Excel (.xlsx), JSON (.json), XML (.xml)
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await productApi.importFile(file);
      toast.success(`Đã Import thành công ${count} sản phẩm từ file "${file.name}"`);
      await loadProducts();
    } catch {
      toast.error('File Import không đúng định dạng (.xlsx, .json, .xml)');
    } finally {
      e.target.value = '';
    }
  };

  // Gợi ý AI #4: Trợ lý giọng nói tiếng Việt để tìm thuốc nhanh
  const handleVoiceSearch = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Trình duyệt của bạn không hỗ trợ Web Speech API');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListeningVoice(true);
      toast.info('🎙️ Đang lắng nghe giọng nói tiếng Việt... Hãy đọc tên thuốc hoặc triệu chứng!');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) {
        setSearchInput(transcript.replace(/\.$/, ''));
        toast.success(`Đã nhận diện giọng nói: "${transcript}"`);
      }
    };

    recognition.onend = () => {
      setIsListeningVoice(false);
    };

    recognition.start();
  };

  // ============================================================================
  // #11: LẮNG NGHE PHÍM TẮT TOÀN CỤC (Alt + N, H, C, D, I, X, F, K, E, V)
  // ============================================================================
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const key = e.key.toLowerCase();

      if (key === 'n') {
        e.preventDefault();
        handleOpenCreate();
      } else if (key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (key === 'h') {
        e.preventDefault();
        void handleBulkDelete();
      } else if (key === 'd') {
        e.preventDefault();
        void handleBulkClone();
      } else if (key === 'c') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          const target = products.find((p) => p.ProductID === selectedIds[0]);
          if (target) void handleCloneOne(target);
        } else {
          toast.info('Tick chọn 1 dòng để bấm Alt+C (hoặc Alt+D để sao chép nhiều dòng)');
        }
      } else if (key === 'e') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          const target = products.find((p) => p.ProductID === selectedIds[0]);
          if (target) handleOpenEdit(target);
        } else {
          toast.info('Tick chọn 1 dòng để bấm Alt+E sửa nhanh');
        }
      } else if (key === 'v') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          const target = products.find((p) => p.ProductID === selectedIds[0]);
          if (target) setViewingProduct(target);
        }
      } else if (key === 'i') {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (key === 'x') {
        e.preventDefault();
        handleExport('xlsx');
      } else if (key === 'k') {
        e.preventDefault();
        setIsColumnMenuOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    handleOpenCreate,
    handleBulkDelete,
    handleBulkClone,
    handleCloneOne,
    handleOpenEdit,
    handleExport,
    selectedIds,
    products,
  ]);

  // ============================================================================
  // ĐỊNH NGHĨA 10 CỘT CHUẨN CỦA BẢNG PRODUCT (TANSTACK TABLE V8)
  // ============================================================================
  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
          />
        ),
      },
      {
        accessorKey: 'ProductID',
        header: 'Mã SP',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-slate-600">
            #{row.original.ProductID}
          </span>
        ),
      },
      {
        accessorKey: 'PathImage',
        header: 'Ảnh',
        cell: ({ row }) => (
          <img
            src={row.original.PathImage}
            alt={row.original.ProductName}
            className="h-11 w-11 rounded-xl object-cover border border-slate-200 bg-slate-100"
          />
        ),
      },
      {
        accessorKey: 'ProductName',
        header: 'Tên Thuốc (ProductName)',
        cell: ({ row }) => (
          <div className="max-w-xs">
            <button
              type="button"
              onClick={() => setViewingProduct(row.original)}
              className="text-left font-bold text-slate-800 hover:text-teal-700 hover:underline line-clamp-1"
            >
              {row.original.ProductName}
            </button>
            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
              {row.original.Description}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'ProductType',
        header: 'Nhóm Thuốc',
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 border border-teal-200">
            {row.original.ProductType}
          </span>
        ),
      },
      {
        accessorKey: 'Quantity',
        header: 'Số Lượng',
        cell: ({ row }) => {
          const qty = row.original.Quantity;
          return (
            <span
              className={`font-bold text-sm ${
                qty <= 30 ? 'text-amber-600' : 'text-slate-800'
              }`}
            >
              {qty.toLocaleString('vi-VN')}
            </span>
          );
        },
      },
      {
        accessorKey: 'Unit',
        header: 'Đơn Vị',
        cell: ({ row }) => (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {row.original.Unit}
          </span>
        ),
      },
      {
        accessorKey: 'Price',
        header: 'Đơn Giá',
        cell: ({ row }) => (
          <span className="font-extrabold text-teal-700 text-sm">
            {row.original.Price.toLocaleString('vi-VN')} ₫
          </span>
        ),
      },
      {
        accessorKey: 'Description',
        header: 'Mô Tả Công Dụng',
        cell: ({ row }) => (
          <p className="max-w-[220px] text-xs text-slate-600 line-clamp-2">
            {row.original.Description}
          </p>
        ),
      },
      {
        accessorKey: 'CreateDate',
        header: 'Ngày Tạo',
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">
            {new Date(row.original.CreateDate).toLocaleDateString('vi-VN')}
          </span>
        ),
      },
      {
        accessorKey: 'UpdateDate',
        header: 'Cập Nhật',
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">
            {new Date(row.original.UpdateDate).toLocaleDateString('vi-VN')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Thao Tác CRUD',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewingProduct(item)}
                title="Xem chi tiết (Alt+V)"
                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-teal-700"
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleOpenEdit(item)}
                title="Cập nhật (Alt+E)"
                className="rounded-lg p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleCloneOne(item)}
                title="Sao chép 1 bản ghi (Alt+C)"
                className="rounded-lg p-1.5 text-slate-600 hover:bg-teal-50 hover:text-teal-700"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteOne(item)}
                title="Xóa bản ghi (Alt+H)"
                className="rounded-lg p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        },
      },
    ],
    [handleOpenEdit, handleCloneOne, handleDeleteOne]
  );

  const table = useReactTable({
    data: products,
    columns,
    state: {
      rowSelection,
      columnVisibility,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-5 pb-16">
      {/* Thanh tiêu đề & Nút chức năng chính */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900">
              Quản Lý Danh Mục Dược Phẩm (Module Product)
            </h1>
            <span className="rounded-full bg-teal-100 px-3 py-0.5 text-xs font-bold text-teal-800">
              {total} sản phẩm
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Đáp ứng đầy đủ 10 trường chuẩn & 11 chức năng CRUD nâng cao theo yêu cầu Bài tập lớn
          </p>
        </div>

        {/* Cụm nút Import / Export / Ẩn hiện cột / Thêm mới */}
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.json,.xml"
            onChange={handleImportFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            title="Import từ file Excel, JSON, XML (Phím tắt: Alt + I)"
          >
            <Upload className="h-4 w-4 text-teal-600" />
            <span>Import (Alt+I)</span>
          </button>

          {/* Menu Dropdown Export 3 định dạng */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="h-4 w-4 text-blue-600" />
              <span>Export (Alt+X)</span>
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white p-2 shadow-xl border border-slate-200 z-40 space-y-1">
                <button
                  type="button"
                  onClick={() => handleExport('xlsx')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-700"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Xuất file Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-700"
                >
                  <FileJson className="h-4 w-4 text-amber-600" />
                  <span>Xuất file JSON (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('xml')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-700"
                >
                  <FileCode className="h-4 w-4 text-indigo-600" />
                  <span>Xuất file XML (.xml)</span>
                </button>
              </div>
            )}
          </div>

          {/* #10: Cấu hình Ẩn/Hiện cột */}
          <ColumnVisibilityMenu
            table={table}
            isOpen={isColumnMenuOpen}
            onToggle={() => setIsColumnMenuOpen((prev) => !prev)}
          />

          {/* #2: Thêm mới */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm Thuốc Mới (Alt+N)</span>
          </button>
        </div>
      </div>

      {/* Thanh Tìm kiếm Meilisearch/Fuse.js + Trợ lý Giọng nói + Bộ lọc */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
        <div className="lg:col-span-6 relative flex items-center">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên thuốc, hoạt chất, triệu chứng, mã SP (chấp nhận gõ sai chính tả VD: paracetamon)... [Alt+F]"
            className="w-full rounded-xl border border-slate-300 pl-10 pr-24 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
          <button
            type="button"
            onClick={handleVoiceSearch}
            title="Tìm kiếm bằng Giọng nói Tiếng Việt (Gợi ý AI #4)"
            className={`absolute right-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              isListeningVoice
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-700'
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>Giọng nói</span>
          </button>
        </div>

        <div className="lg:col-span-3">
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="ALL">Tất cả nhóm thuốc (ProductType)</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-3 flex items-center gap-2">
          <select
            value={selectedUnit}
            onChange={(e) => {
              setSelectedUnit(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="ALL">Tất cả đơn vị (Unit)</option>
            {availableUnits.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setSelectedType('ALL');
              setSelectedUnit('ALL');
              setPage(1);
            }}
            title="Làm mới bộ lọc"
            className="rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Badge hiển thị Engine tìm kiếm AI (#8) */}
        {debouncedSearch && searchEngineInfo && (
          <div className="lg:col-span-12 flex items-center gap-2 text-xs text-teal-700 bg-teal-50/80 border border-teal-200 rounded-xl px-3.5 py-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>
              Đang kích hoạt <strong>Tìm kiếm thông minh Typo-Tolerant</strong> (Engine:{' '}
              <code className="font-mono font-bold uppercase">{searchEngineInfo.engine}</code> — Thời
              gian phản hồi: <strong>{searchEngineInfo.processingTimeMs}ms</strong>). Tìm thấy{' '}
              <strong>{total}</strong> kết quả khớp với <em>"{debouncedSearch}"</em>.
            </span>
          </div>
        )}
      </div>

      {/* Thanh Thao tác Hàng loạt khi tick Checkbox (Yêu cầu #5b & #8) */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-lg">
          <div className="text-xs font-semibold">
            Đã chọn <span className="text-teal-400 font-bold text-sm">{selectedIds.length}</span> bản
            ghi từ ô Checkbox (Mã: {selectedIds.map((id) => `#${id}`).join(', ')})
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleBulkClone()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-500"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Sao chép {selectedIds.length} bản ghi (Alt+D)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xóa {selectedIds.length} bản ghi (Alt+H)</span>
            </button>
          </div>
        </div>
      )}

      {/* Bảng dữ liệu chính TanStack Table */}
      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3.5 whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-slate-400">
                    Đang tải dữ liệu bảng Product...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-slate-500">
                    Không tìm thấy sản phẩm thuốc nào khớp với tiêu chí tìm kiếm.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`transition hover:bg-slate-50/90 ${
                      row.getIsSelected() ? 'bg-teal-50/60' : ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh Phân Trang (Yêu cầu #1: 10 - 15 item in page) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Hiển thị:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value={10}>10 dòng / trang (Chuẩn đề bài)</option>
              <option value={12}>12 dòng / trang</option>
              <option value={15}>15 dòng / trang (Chuẩn đề bài)</option>
            </select>
            <span className="text-slate-400">|</span>
            <span>
              Tổng số: <strong className="text-slate-800">{total}</strong> bản ghi
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Trước</span>
            </button>

            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setPage(pageNum)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                  pageNum === page
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <span>Sau</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Thêm / Cập nhật Thuốc */}
      <ProductFormModal
        isOpen={isFormOpen}
        editingProduct={editingProduct}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* Modal Xem Chi Tiết Thuốc */}
      <ProductDetailModal
        product={viewingProduct}
        onClose={() => setViewingProduct(null)}
        onEdit={handleOpenEdit}
        onClone={(item) => void handleCloneOne(item)}
      />

      {/* Thanh Phím Tắt CRUD cố định ở đáy màn hình (#11) */}
      <ShortcutLegendBar
        onNew={handleOpenCreate}
        onFocusSearch={() => searchInputRef.current?.focus()}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => void handleBulkClone()}
        onToggleColumns={() => setIsColumnMenuOpen((prev) => !prev)}
        onImport={() => fileInputRef.current?.click()}
        onExportExcel={() => handleExport('xlsx')}
        selectedCount={selectedIds.length}
      />
    </div>
  );
};
