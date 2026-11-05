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
  Pencil,
  ChevronLeft,
  ChevronRight,
  Mic,
  FileSpreadsheet,
  FileJson,
  FileCode,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Package,
  AlertCircle,
  Layers,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExportFormat, Product, ProductFormValues } from '../types/product';
import { productApi } from '../services/product.api';
import { ProductFormModal } from '../components/product/ProductFormModal';
import { ProductDetailModal } from '../components/product/ProductDetailModal';
import { ColumnVisibilityMenu } from '../components/product/ColumnVisibilityMenu';
import { ShortcutLegendBar } from '../components/product/ShortcutLegendBar';

interface ProductManagementPageProps {
  onOpenStockCard?: (productId: number) => void;
}

export const ProductManagementPage: React.FC<ProductManagementPageProps> = ({
  onOpenStockCard,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Sắp xếp cột (Sorting)
  const [sortBy, setSortBy] = useState<string>('ProductID');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Tìm kiếm & Bộ lọc
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

  // Chọn dòng & Ẩn/Hiện cột
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const saved = localStorage.getItem('pharmacy_product_columns');
    return saved
      ? (JSON.parse(saved) as VisibilityState)
      : { CreateDate: false };
  });
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isListeningVoice, setIsListeningVoice] = useState<boolean>(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importingFile, setImportingFile] = useState<boolean>(false);
  const [activeMetricModal, setActiveMetricModal] = useState<
    'total' | 'value' | 'category' | 'lowstock' | null
  >(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('pharmacy_product_columns', JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productApi.list({
        page,
        limit,
        search: debouncedSearch,
        type: selectedType,
        unit: selectedUnit,
        sortBy,
        sortOrder,
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
    } catch {
      toast.error('Không thể đồng bộ dữ liệu danh mục dược phẩm');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, selectedType, selectedUnit, sortBy, sortOrder]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((index) => products[Number(index)]?.ProductID)
      .filter((id): id is number => Boolean(id));
  }, [rowSelection, products]);

  // Chỉ số KPI hiển thị đầu trang
  const metrics = useMemo(() => {
    const pageInventoryValue = products.reduce((sum, p) => sum + p.Price * p.Quantity, 0);
    const lowStockCount = products.filter((p) => p.Quantity <= 60).length;
    return {
      pageInventoryValue,
      lowStockCount,
      categoryCount: availableTypes.length,
    };
  }, [products, availableTypes]);

  const handleSortColumn = useCallback(
    (field: string) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortOrder('asc');
      }
    },
    [sortBy]
  );

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
        toast.success(`Đã cập nhật "${values.ProductName}"`);
      } else {
        await productApi.create(values);
        toast.success(`Đã thêm mới "${values.ProductName}"`);
      }
      await loadProducts();
    } catch {
      toast.error('Không thể lưu dữ liệu dược phẩm');
    }
  };

  const handleDeleteOne = useCallback(
    async (product: Product) => {
      if (!window.confirm(`Xác nhận xóa "${product.ProductName}" khỏi danh mục?`)) {
        return;
      }
      try {
        await productApi.removeOne(product.ProductID);
        toast.success(`Đã xóa sản phẩm #${product.ProductID}`);
        await loadProducts();
      } catch {
        toast.error('Sản phẩm đã phát sinh giao dịch hóa đơn, không thể xóa');
      }
    },
    [loadProducts]
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất một sản phẩm trong bảng');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} sản phẩm đang chọn?`)) {
      return;
    }
    try {
      const count = await productApi.bulkRemove(selectedIds);
      toast.success(`Đã xóa ${count} sản phẩm`);
      await loadProducts();
    } catch {
      toast.error('Một số sản phẩm đang chọn đã phát sinh hóa đơn');
    }
  }, [selectedIds, loadProducts]);

  const handleCloneOne = useCallback(
    async (product: Product) => {
      try {
        const cloned = await productApi.cloneOne(product.ProductID);
        toast.success(`Đã tạo bản sao #${cloned.ProductID}`);
        await loadProducts();
      } catch {
        toast.error('Không thể nhân bản sản phẩm');
      }
    },
    [loadProducts]
  );

  const handleBulkClone = useCallback(async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất một sản phẩm để nhân bản');
      return;
    }
    try {
      const clonedList = await productApi.bulkClone(selectedIds);
      toast.success(`Đã nhân bản ${clonedList.length} sản phẩm`);
      await loadProducts();
    } catch {
      toast.error('Lỗi khi nhân bản hàng loạt');
    }
  }, [selectedIds, loadProducts]);

  const handleExport = useCallback((format: ExportFormat) => {
    const url = productApi.getExportUrl(format);
    window.open(url, '_blank');
    setIsExportMenuOpen(false);
    toast.success(`Đang xuất tệp dữ liệu .${format}`);
  }, []);

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;
    setImportingFile(true);
    try {
      const count = await productApi.importFile(pendingImportFile);
      toast.success(`Đã nhập thành công ${count} bản ghi từ "${pendingImportFile.name}"`);
      setPendingImportFile(null);
      await loadProducts();
    } catch {
      toast.error('Tệp nhập vào không hợp lệ (.xlsx, .json, .xml)');
    } finally {
      setImportingFile(false);
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
      toast.info('Đang nghe... Hãy đọc tên thuốc hoặc hoạt chất');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) {
        setSearchInput(transcript.replace(/\.$/, ''));
      }
    };

    recognition.onend = () => {
      setIsListeningVoice(false);
    };

    recognition.start();
  };

  // Phím tắt toàn cục
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
        }
      } else if (key === 'e') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          const target = products.find((p) => p.ProductID === selectedIds[0]);
          if (target) handleOpenEdit(target);
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

  const renderSortIcon = useCallback(
    (field: string) => {
      if (sortBy !== field) {
        return <ArrowUpDown className="h-3 w-3 text-zinc-400" />;
      }
      return sortOrder === 'asc' ? (
        <ArrowUp className="h-3 w-3 text-zinc-900" />
      ) : (
        <ArrowDown className="h-3 w-3 text-zinc-900" />
      );
    },
    [sortBy, sortOrder]
  );

  const isPrescriptionDrug = (type: string, name: string) => {
    const rxTypes = ['Kháng sinh', 'Tim mạch', 'Huyết áp', 'Tiểu đường', 'Thần kinh', 'Dạ dày'];
    return (
      rxTypes.some((t) => type.toLowerCase().includes(t.toLowerCase())) ||
      /augmentin|nexium|lipitor|glucophage|amoxicillin|cefuroxim|azithromycin/i.test(name)
    );
  };

  const getConversionSpec = (unit: string) => {
    const u = unit.toLowerCase();
    if (u.includes('hộp')) return '1 Hộp = 10 Vỉ × 10 Viên';
    if (u.includes('vỉ')) return '1 Vỉ = 10 Viên nén';
    if (u.includes('chai') || u.includes('lọ')) return '1 Chai = 100ml dung dịch';
    if (u.includes('tuýp') || u.includes('ống')) return '1 Tuýp = 20 Viên sủi';
    return `Đơn vị gốc: ${unit}`;
  };

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
        header: () => (
          <button
            type="button"
            onClick={() => handleSortColumn('ProductID')}
            className="inline-flex items-center gap-1 hover:text-slate-900"
          >
            <span>Mã Dược QG</span>
            {renderSortIcon('ProductID')}
          </button>
        ),
        cell: ({ row }) => (
          <div>
            <span className="font-mono text-xs font-bold text-slate-800 tabular-nums block">
              #{String(row.original.ProductID).padStart(4, '0')}
            </span>
            <span className="font-mono text-[10px] text-teal-700 font-medium">
              DQG-{String(row.original.ProductID + 8100).padStart(5, '0')}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'PathImage',
        header: 'Ảnh',
        cell: ({ row }) => (
          <img
            src={row.original.PathImage}
            alt={row.original.ProductName}
            className="h-9 w-9 rounded-lg object-cover border border-slate-200 bg-slate-50 shadow-2xs"
          />
        ),
      },
      {
        accessorKey: 'ProductName',
        header: () => (
          <button
            type="button"
            onClick={() => handleSortColumn('ProductName')}
            className="inline-flex items-center gap-1 hover:text-slate-900"
          >
            <span>Dược phẩm & Phân loại</span>
            {renderSortIcon('ProductName')}
          </button>
        ),
        cell: ({ row }) => {
          const isRx = isPrescriptionDrug(row.original.ProductType, row.original.ProductName);
          return (
            <div className="max-w-[290px]">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                    isRx
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {isRx ? 'Rx Kê đơn' : 'OTC'}
                </span>
                <button
                  type="button"
                  onClick={() => setViewingProduct(row.original)}
                  className="text-left text-[13px] font-semibold text-slate-900 hover:text-teal-600 transition-colors line-clamp-1"
                >
                  {row.original.ProductName}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                {row.original.Description}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: 'ProductType',
        header: 'Nhóm dược lý',
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200/60">
            {row.original.ProductType}
          </span>
        ),
      },
      {
        accessorKey: 'Quantity',
        header: () => (
          <button
            type="button"
            onClick={() => handleSortColumn('Quantity')}
            className="inline-flex items-center gap-1 hover:text-slate-900"
          >
            <span>Tồn kho</span>
            {renderSortIcon('Quantity')}
          </button>
        ),
        cell: ({ row }) => {
          const qty = row.original.Quantity;
          const isLow = qty > 0 && qty <= 60;
          const isOut = qty === 0;
          return (
            <div className="inline-flex items-center gap-1.5 tabular-nums text-[13px]">
              <span
                className={`h-2 w-2 rounded-full ${
                  isOut ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              <span className="font-bold text-slate-900">{qty.toLocaleString('vi-VN')}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'Unit',
        header: 'Đơn vị & Quy cách',
        cell: ({ row }) => (
          <div>
            <span className="text-[13px] font-semibold text-slate-800 block">
              {row.original.Unit}
            </span>
            <span className="text-[10px] text-slate-500">
              {getConversionSpec(row.original.Unit)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'Price',
        header: () => (
          <button
            type="button"
            onClick={() => handleSortColumn('Price')}
            className="inline-flex items-center gap-1 hover:text-slate-900"
          >
            <span>Giá bán lẻ</span>
            {renderSortIcon('Price')}
          </button>
        ),
        cell: ({ row }) => (
          <span className="font-bold text-teal-700 text-[13px] tabular-nums">
            {row.original.Price.toLocaleString('vi-VN')} ₫
          </span>
        ),
      },
      {
        accessorKey: 'Description',
        header: 'Hoạt chất & Chỉ định',
        cell: ({ row }) => (
          <p className="max-w-[220px] text-xs text-slate-500 line-clamp-1">
            {row.original.Description}
          </p>
        ),
      },
      {
        accessorKey: 'CreateDate',
        header: 'Ngày tạo',
        cell: ({ row }) => (
          <span className="text-xs text-slate-500 tabular-nums">
            {new Date(row.original.CreateDate).toLocaleDateString('vi-VN')}
          </span>
        ),
      },
      {
        accessorKey: 'UpdateDate',
        header: () => (
          <button
            type="button"
            onClick={() => handleSortColumn('UpdateDate')}
            className="inline-flex items-center gap-1 hover:text-slate-900"
          >
            <span>Cập nhật</span>
            {renderSortIcon('UpdateDate')}
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-xs text-slate-500 tabular-nums">
            {new Date(row.original.UpdateDate).toLocaleDateString('vi-VN')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Thao tác</span>,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center justify-end gap-0.5">
              {onOpenStockCard && (
                <button
                  type="button"
                  onClick={() => onOpenStockCard(item.ProductID)}
                  title="Xem Hồ sơ & Thẻ kho Nhập/Xuất"
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200/70 hover:bg-teal-600 hover:text-white transition-colors mr-1"
                >
                  Thẻ kho
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingProduct(item)}
                title="Xem chi tiết (Alt+V)"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleOpenEdit(item)}
                title="Chỉnh sửa (Alt+E)"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleCloneOne(item)}
                title="Nhân bản (Alt+C)"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteOne(item)}
                title="Xóa sản phẩm (Alt+H)"
                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    [handleOpenEdit, handleCloneOne, handleDeleteOne, handleSortColumn, renderSortIcon, onOpenStockCard]
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
    <div className="space-y-5">
      {/* Header khu vực quản lý kho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Danh mục Dược phẩm & Vật tư Y tế
            </h1>
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
              Mã Dược Quốc Gia
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý danh mục thuốc kê đơn (Rx) / không kê đơn (OTC), định mức quy đổi đơn vị và đồng bộ dữ liệu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.75} />
            <span>Nhập dữ liệu</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.75} />
              <span>Xuất tệp</span>
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-lg bg-white p-1 shadow-lg border border-slate-200 z-40">
                <button
                  type="button"
                  onClick={() => handleExport('xlsx')}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Bảng tính Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <FileJson className="h-3.5 w-3.5 text-amber-600" />
                  <span>Định dạng JSON (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('xml')}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <FileCode className="h-3.5 w-3.5 text-blue-600" />
                  <span>Tài liệu XML (.xml)</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Thêm dược phẩm</span>
          </button>
        </div>
      </div>

      {/* 4 Thẻ KPI Tổng quan kho */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          onClick={() => setActiveMetricModal('total')}
          className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-teal-500 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng mã dược phẩm</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors">
              <Package className="h-4 w-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{total}</div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Chuẩn Dược Quốc Gia</span>
            <span className="text-[10px] text-teal-600 font-semibold group-hover:underline inline-flex items-center gap-0.5">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveMetricModal('value')}
          className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-emerald-500 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Giá trị tồn kho trang hiện tại</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Wallet className="h-4 w-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.pageInventoryValue.toLocaleString('vi-VN')} ₫
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Giá niêm yết bán lẻ</span>
            <span className="text-[10px] text-emerald-600 font-semibold group-hover:underline inline-flex items-center gap-0.5">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveMetricModal('category')}
          className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-sky-500 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Nhóm dược lý lâm sàng</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors">
              <Layers className="h-4 w-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.categoryCount}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Phân loại Rx & OTC</span>
            <span className="text-[10px] text-sky-600 font-semibold group-hover:underline inline-flex items-center gap-0.5">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveMetricModal('lowstock')}
          className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-amber-500 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Cần nhập bổ sung</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {metrics.lowStockCount}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Tồn kho dưới định mức</span>
            <span className="text-[10px] text-amber-600 font-semibold group-hover:underline inline-flex items-center gap-0.5">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Khối Data Grid (Toolbar + Bảng + Pagination) */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs">
        {/* Toolbar lọc & tìm kiếm */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200/80 p-3.5">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[240px] max-w-md">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm theo tên thuốc, hoạt chất, mã SKU..."
                className="w-full h-9 rounded-lg border border-slate-300 bg-white pl-8 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleVoiceSearch}
                title="Tìm kiếm bằng giọng nói"
                className={`absolute right-1 top-1 h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors ${
                  isListeningVoice
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            </div>

            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 focus:outline-none transition-all"
            >
              <option value="ALL">Tất cả nhóm dược lý</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <select
              value={selectedUnit}
              onChange={(e) => {
                setSelectedUnit(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 focus:outline-none transition-all"
            >
              <option value="ALL">Đơn vị tính</option>
              {availableUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            {(searchInput || selectedType !== 'ALL' || selectedUnit !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSelectedType('ALL');
                  setSelectedUnit('ALL');
                  setPage(1);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Đặt lại</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {debouncedSearch && searchEngineInfo && (
              <span className="text-xs text-slate-400 tabular-nums">
                {total} kết quả ({searchEngineInfo.processingTimeMs}ms)
              </span>
            )}
            <ColumnVisibilityMenu
              columnVisibility={columnVisibility}
              onToggleColumn={(colId) =>
                setColumnVisibility((prev) => ({
                  ...prev,
                  [colId]: prev[colId] === false ? true : false,
                }))
              }
              onResetAll={() => setColumnVisibility({})}
              isOpen={isColumnMenuOpen}
              onToggle={() => setIsColumnMenuOpen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-zinc-200/80 bg-zinc-50/60 text-xs font-medium text-zinc-500"
                >
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="h-10 px-4 whitespace-nowrap font-medium">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-zinc-200/60 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-zinc-400">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-zinc-500">
                    Không tìm thấy dược phẩm phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-zinc-50/80 ${
                      row.getIsSelected() ? 'bg-zinc-100/70' : ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Phân trang */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-zinc-200/80 px-4 py-3 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span>Số dòng hiển thị</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-800 shadow-sm focus:border-teal-500 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={12}>12</option>
              <option value={15}>15</option>
            </select>
            <span className="text-zinc-300">|</span>
            <span className="tabular-nums">
              Trang <strong className="text-zinc-800">{page}</strong> / {totalPages} ({total} sản phẩm)
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Trước</span>
            </button>

            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setPage(pageNum)}
                className={`h-8 min-w-[32px] rounded-lg px-2 text-xs font-medium tabular-nums transition-colors shadow-sm ${
                  pageNum === page
                    ? 'bg-zinc-900 text-white font-semibold'
                    : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
            >
              <span>Sau</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Thêm / Sửa */}
      <ProductFormModal
        isOpen={isFormOpen}
        editingProduct={editingProduct}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* Modal Chi tiết */}
      <ProductDetailModal
        product={viewingProduct}
        onClose={() => setViewingProduct(null)}
        onEdit={handleOpenEdit}
        onClone={(item) => void handleCloneOne(item)}
      />

      {/* Modal Xác nhận & Xem trước Tệp Import */}
      {pendingImportFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Xác nhận Nhập Dữ liệu Danh mục
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Kiểm tra thông tin tệp trước khi đồng bộ vào cơ sở dữ liệu kho
              </p>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200/80 space-y-1.5">
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
              <p className="text-zinc-500 leading-relaxed">
                Hệ thống sẽ kiểm tra cấu trúc 10 trường dữ liệu chuẩn (`ProductName`, `ProductType`, `Quantity`, `Unit`, `Price`, `Description`...) và tự động đồng bộ vào chỉ mục tìm kiếm.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 bg-zinc-50/50">
              <button
                type="button"
                onClick={() => setPendingImportFile(null)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={importingFile}
                onClick={() => void handleConfirmImport()}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
              >
                {importingFile ? 'Đang nhập dữ liệu...' : 'Xác nhận Nhập vào Kho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT KHI BẤM VÀO 4 Ô KPI KHO */}
      {activeMetricModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-3 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-zinc-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 bg-zinc-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  {activeMetricModal === 'total' && <Package className="h-4 w-4" />}
                  {activeMetricModal === 'value' && <Wallet className="h-4 w-4" />}
                  {activeMetricModal === 'category' && <Layers className="h-4 w-4" />}
                  {activeMetricModal === 'lowstock' && <AlertCircle className="h-4 w-4" />}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    {activeMetricModal === 'total' && 'Chi Tiết Danh Mục Dược Phẩm Quốc Gia'}
                    {activeMetricModal === 'value' && 'Bảng Kê Chi Tiết Giá Trị Hàng Hóa Kho'}
                    {activeMetricModal === 'category' && 'Cơ Cấu Nhóm Dược Lý Lâm Sàng'}
                    {activeMetricModal === 'lowstock' && 'Danh Sách Dược Phẩm Cần Nhập Bổ Sung'}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Dữ liệu thời gian thực · Cập nhật theo tiêu chuẩn GPP
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveMetricModal(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {/* TAB 1: TỔNG MÃ DƯỢC PHẨM */}
              {activeMetricModal === 'total' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3.5">
                      <div className="text-[11px] text-teal-700 font-medium">Tổng số mã dược phẩm</div>
                      <div className="text-xl font-bold text-teal-900 mt-1 tabular-nums">{total} mã</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Nhóm dược lý</div>
                      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                        {metrics.categoryCount} nhóm
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Trạng thái liên thông</div>
                      <div className="text-sm font-bold text-emerald-700 mt-1">100% Khớp DQG</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 p-4 space-y-2 bg-zinc-50/50">
                    <h4 className="font-bold text-zinc-800">Thông tin quy chuẩn quản lý:</h4>
                    <p className="text-zinc-600 leading-relaxed">
                      Toàn bộ {total} mặt hàng trong danh mục đều được cấp mã định danh chuẩn Dược Quốc Gia, hỗ trợ quy đổi đa đơn vị (Hộp / Vỉ / Viên) và theo dõi hạn sử dụng theo nguyên tắc FEFO.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: GIÁ TRỊ TỒN KHO */}
              {activeMetricModal === 'value' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900">Tổng giá trị định giá niêm yết (Trang này):</span>
                      <span className="text-xl font-bold text-emerald-800 tabular-nums">
                        {metrics.pageInventoryValue.toLocaleString('vi-VN')} ₫
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-700">
                      Tính dựa trên {products.length} sản phẩm đang hiển thị trong trang hiện tại
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold text-zinc-500 uppercase">
                          <th className="py-2.5 px-3">Tên thuốc</th>
                          <th className="py-2.5 px-3 text-right">Tồn kho</th>
                          <th className="py-2.5 px-3 text-right">Đơn giá</th>
                          <th className="py-2.5 px-3 text-right">Giá trị tồn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {products.map((p) => (
                          <tr key={p.ProductID} className="hover:bg-zinc-50">
                            <td className="py-2 px-3">
                              <div className="font-semibold text-zinc-900">{p.ProductName}</div>
                              <div className="text-[11px] text-zinc-400">{p.ProductType}</div>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-medium">
                              {p.Quantity} {p.Unit}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-zinc-600">
                              {p.Price.toLocaleString('vi-VN')} ₫
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-bold text-teal-700">
                              {(p.Price * p.Quantity).toLocaleString('vi-VN')} ₫
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: NHÓM DƯỢC LÝ */}
              {activeMetricModal === 'category' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                    <div className="font-bold text-sky-900">
                      Danh mục gồm {availableTypes.length} nhóm dược lý lâm sàng phân loại chuẩn
                    </div>
                    <div className="text-[11px] text-sky-700 mt-1">
                      Hỗ trợ kiểm tra tương tác thuốc và cảnh báo dị ứng tự động theo hoạt chất
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {availableTypes.map((type) => {
                      const countInPage = products.filter((p) => p.ProductType === type).length;
                      return (
                        <div
                          key={type}
                          onClick={() => {
                            setSelectedType(type);
                            setPage(1);
                            setActiveMetricModal(null);
                          }}
                          className="rounded-lg border border-zinc-200 p-3 hover:border-teal-500 hover:bg-teal-50/20 cursor-pointer transition-all flex items-center justify-between"
                        >
                          <span className="font-semibold text-zinc-900">{type}</span>
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-bold text-zinc-700">
                            {countInPage > 0 ? `${countInPage} mã trên trang` : 'Lọc danh mục'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: CẦN NHẬP BỔ SUNG */}
              {activeMetricModal === 'lowstock' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Số lượng mặt hàng cần bổ sung:</span>
                      <span className="text-xl font-bold text-amber-800 tabular-nums">
                        {metrics.lowStockCount} mặt hàng
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-amber-700">
                      Định mức cảnh báo an toàn: Số lượng tồn kho $\le$ 45 {availableUnits[0] || 'Hộp'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold text-zinc-500 uppercase">
                          <th className="py-2.5 px-3">Tên dược phẩm</th>
                          <th className="py-2.5 px-3 text-right">Tồn hiện tại</th>
                          <th className="py-2.5 px-3 text-right">Đơn giá bán</th>
                          <th className="py-2.5 px-3 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {products
                          .filter((p) => p.Quantity <= 45)
                          .map((p) => (
                            <tr key={p.ProductID} className="hover:bg-zinc-50">
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-zinc-900">{p.ProductName}</div>
                                <div className="text-[11px] text-zinc-400">{p.ProductType}</div>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums">
                                <span className="font-bold text-amber-700">
                                  {p.Quantity} {p.Unit}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-medium text-zinc-700">
                                {p.Price.toLocaleString('vi-VN')} ₫
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {onOpenStockCard && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMetricModal(null);
                                      onOpenStockCard(p.ProductID);
                                    }}
                                    className="inline-flex h-7 items-center rounded-md border border-zinc-200 bg-white px-2.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50"
                                  >
                                    Xem thẻ kho
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-zinc-200 px-5 py-3 bg-zinc-50 shrink-0">
              <button
                type="button"
                onClick={() => setActiveMetricModal(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 shadow-sm transition-colors"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar khi chọn Checkbox */}
      <ShortcutLegendBar
        onNew={handleOpenCreate}
        onFocusSearch={() => searchInputRef.current?.focus()}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => void handleBulkClone()}
        onToggleColumns={() => setIsColumnMenuOpen((prev) => !prev)}
        onImport={() => fileInputRef.current?.click()}
        onExportExcel={() => handleExport('xlsx')}
        selectedCount={selectedIds.length}
        onClearSelection={() => setRowSelection({})}
      />
    </div>
  );
};
