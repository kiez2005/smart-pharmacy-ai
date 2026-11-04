import React, { useState } from 'react';
import { Toaster, toast } from 'sonner';
import {
  LayoutDashboard,
  Package,
  FileSpreadsheet,
  Truck,
  ShoppingCart,
  Receipt,
  Wallet,
  Users,
  ScanLine,
  Stethoscope,
  MessageSquare,
  Shield,
  Keyboard,
  X,
  Building2,
  ChevronRight,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { DashboardPage } from './pages/DashboardPage';
import { ProductManagementPage } from './pages/ProductManagementPage';
import { ProductStockCardPage } from './pages/ProductStockCardPage';
import { SuppliersAndPurchaseOrdersPage } from './pages/SuppliersAndPurchaseOrdersPage';
import { PosTerminalPage, PosCartItem } from './pages/PosTerminalPage';
import { InvoicesManagementPage } from './pages/InvoicesManagementPage';
import { PaymentsLedgerPage } from './pages/PaymentsLedgerPage';
import { CustomersPage } from './pages/CustomersPage';
import { PrescriptionOcrPage } from './pages/PrescriptionOcrPage';
import { ClinicalAiAndInteractionPage } from './pages/ClinicalAiAndInteractionPage';
import { ContactPage } from './pages/ContactPage';
import { AuthPage } from './pages/AuthPage';
import { UserProfile } from './types/forms';

export type ActiveTab =
  | 'DASHBOARD'
  | 'PRODUCTS'
  | 'STOCK_CARD'
  | 'IMPORTS'
  | 'POS'
  | 'INVOICES'
  | 'PAYMENTS'
  | 'CUSTOMERS'
  | 'AI_OCR'
  | 'AI_CLINICAL'
  | 'CONTACT'
  | 'AUTH';

const SHORTCUT_ITEMS = [
  { key: 'Alt + N', desc: 'Mở biểu mẫu thêm mới bản ghi' },
  { key: 'Alt + S', desc: 'Lưu nhanh biểu mẫu đang mở' },
  { key: 'Alt + F', desc: 'Đưa con trỏ vào thanh tìm kiếm' },
  { key: 'Alt + E', desc: 'Chỉnh sửa dòng dữ liệu đang chọn' },
  { key: 'Alt + V', desc: 'Xem chi tiết hồ sơ đang chọn' },
  { key: 'Alt + C', desc: 'Nhân bản 1 bản ghi đang chọn' },
  { key: 'Alt + D', desc: 'Nhân bản hàng loạt các mục đã đánh dấu' },
  { key: 'Alt + H', desc: 'Xóa các mục đã đánh dấu' },
  { key: 'Alt + I', desc: 'Nhập dữ liệu từ tệp (.xlsx, .json, .xml)' },
  { key: 'Alt + X', desc: 'Xuất nhanh danh sách ra Excel (.xlsx)' },
  { key: 'Alt + K', desc: 'Bật/tắt tùy chỉnh cột hiển thị' },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD');
  const [selectedStockCardProductId, setSelectedStockCardProductId] = useState<number>(1);
  const [posInitialCart, setPosInitialCart] = useState<PosCartItem[] | undefined>(undefined);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('CS1 - Nhà thuốc Trung Tâm (GPP)');
  const [syncingNationalPortal, setSyncingNationalPortal] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>({
    UserID: 1,
    FullName: 'DS. Nguyễn Văn Trung',
    Email: 'trung.d18cnpm5@epu.edu.vn',
    Role: 'ADMIN',
  });

  const handleOpenStockCard = (productId: number) => {
    setSelectedStockCardProductId(productId);
    setActiveTab('STOCK_CARD');
  };

  const handleTransferOcrToPos = (items: PosCartItem[]) => {
    setPosInitialCart(items);
    setActiveTab('POS');
  };

  const handleSyncNationalPortal = () => {
    setSyncingNationalPortal(true);
    setTimeout(() => {
      setSyncingNationalPortal(false);
      toast.success(
        'Đã đồng bộ dữ liệu Xuất-Nhập-Tồn và Hóa đơn lên Cổng Dược Quốc Gia (duocquocgia.com.vn)!'
      );
    }, 600);
  };

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{
      id: ActiveTab;
      label: string;
      icon: React.ElementType;
      badge?: string;
    }>;
  }> = [
    {
      groupLabel: 'Quản trị Kho & Dược phẩm',
      items: [
        { id: 'DASHBOARD', label: 'Tổng quan điều hành', icon: LayoutDashboard },
        { id: 'PRODUCTS', label: 'Danh mục dược phẩm', icon: Package, badge: 'GPP' },
        { id: 'STOCK_CARD', label: 'Thẻ kho & Kiểm kê', icon: FileSpreadsheet, badge: 'FEFO' },
        { id: 'IMPORTS', label: 'Nhà cung cấp & Nhập kho', icon: Truck },
      ],
    },
    {
      groupLabel: 'Bán lẻ POS & Tài chính',
      items: [
        { id: 'POS', label: 'Quầy thu ngân POS', icon: ShoppingCart, badge: 'POS' },
        { id: 'INVOICES', label: 'Hóa đơn & Hoàn trả hàng', icon: Receipt },
        { id: 'PAYMENTS', label: 'Sổ quỹ Thu - Chi & VietQR', icon: Wallet },
        { id: 'CUSTOMERS', label: 'Hồ sơ bệnh nhân & Dị ứng', icon: Users },
      ],
    },
    {
      groupLabel: 'Lâm sàng AI & Hệ thống',
      items: [
        { id: 'AI_OCR', label: 'Số hóa đơn thuốc (OCR)', icon: ScanLine, badge: 'AI' },
        { id: 'AI_CLINICAL', label: 'Dược lâm sàng & Tương tác', icon: Stethoscope },
        { id: 'CONTACT', label: 'Tư vấn dược sĩ & CSKH', icon: MessageSquare },
        { id: 'AUTH', label: 'Nhân sự & Phân quyền', icon: Shield },
      ],
    },
  ];

  const activeGroup = navGroups.find((g) => g.items.some((i) => i.id === activeTab));
  const activeLabel =
    navGroups.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label || '';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex">
      <Toaster position="bottom-right" richColors />

      {/* ENTERPRISE SIDEBAR (Cố định 100% chiều cao màn hình khi cuộn trang) */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200/90 bg-white shrink-0 select-none sticky top-0 h-screen z-30">
        {/* Brand Header */}
        <div className="h-14 flex items-center justify-between border-b border-slate-200/80 px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
              <Building2 className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-[13px] font-bold tracking-tight text-slate-900 truncate">
                PharmaCore ERP
              </div>
              <div className="text-[11px] font-medium text-teal-600 truncate">
                Chuẩn GPP Bộ Y Tế
              </div>
            </div>
          </div>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 border border-slate-200">
            v2.4
          </span>
        </div>

        {/* 12-Module Navigation Groups */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.groupLabel} className="space-y-0.5">
              <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {group.groupLabel}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-all ${
                      isActive
                        ? 'bg-teal-50/90 text-teal-900 font-semibold border border-teal-200/80 shadow-2xs'
                        : 'text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? 'text-teal-600' : 'text-slate-400'
                        }`}
                        strokeWidth={isActive ? 2 : 1.75}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge && (
                      <span
                        className={`ml-1.5 rounded px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                          isActive
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer — Cố định ở đáy Sidebar */}
        <div className="border-t border-slate-200/80 p-3 space-y-2 bg-slate-50/40">
          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Keyboard className="h-3.5 w-3.5 text-slate-400" />
              <span>Bảng phím tắt nhanh</span>
            </span>
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
              Alt + Key
            </kbd>
          </button>

          <div
            onClick={() => setActiveTab('AUTH')}
            className="cursor-pointer flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 border border-slate-200/90 shadow-2xs hover:border-teal-300 transition-colors"
          >
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
              NT
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {currentUser ? currentUser.FullName : 'Chưa đăng nhập'}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {currentUser
                  ? `Dược sĩ phụ trách • ${currentUser.Role}`
                  : 'Nhấn để đăng nhập'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Enterprise Topbar with National Pharmacy Portal Status & Branch Switcher */}
        <header className="sticky top-0 z-20 h-14 border-b border-slate-200/80 bg-white/95 backdrop-blur px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[13px] min-w-0">
            <span className="text-slate-400 font-medium hidden sm:inline">PharmaCore</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden sm:inline" />
            <span className="text-slate-500 hidden lg:inline">{activeGroup?.groupLabel}</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden lg:inline" />
            <span className="font-semibold text-slate-900 truncate">{activeLabel}</span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Chọn Cơ sở / Chi nhánh nhà thuốc */}
            <div className="hidden xl:flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
              <MapPin className="h-3.5 w-3.5 text-teal-600" />
              <select
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  toast.info(`Đã chuyển sang dữ liệu: ${e.target.value}`);
                }}
                className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="CS1 - Nhà thuốc Trung Tâm (GPP)">
                  CS1 - Nhà thuốc Trung Tâm (GPP)
                </option>
                <option value="CS2 - Nhà thuốc Đa Khoa Quận 1">
                  CS2 - Nhà thuốc Đa Khoa Quận 1
                </option>
                <option value="Kho Tổng Dược Phẩm GDP">Kho Tổng Dược Phẩm GDP</option>
              </select>
            </div>

            {/* Trạng thái Liên thông Dược Quốc Gia */}
            <button
              type="button"
              onClick={handleSyncNationalPortal}
              title="Nhấn để đồng bộ tức thời với Cổng Dược Quốc Gia (duocquocgia.com.vn)"
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Cổng Dược QG: Online</span>
              <RefreshCw
                className={`h-3 w-3 text-emerald-700 ${
                  syncingNationalPortal ? 'animate-spin' : ''
                }`}
              />
            </button>

            {/* Mobile Nav Selector */}
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as ActiveTab)}
              className="md:hidden h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800"
            >
              {navGroups
                .flatMap((g) => g.items)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={() => setActiveTab('POS')}
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-md bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 shadow-2xs transition-colors"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Bán hàng POS</span>
            </button>

            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Keyboard className="h-3.5 w-3.5 text-slate-400" />
              <span className="hidden sm:inline">Phím tắt</span>
            </button>
          </div>
        </header>

        {/* Workspace Content (12 Modules) */}
        <main className="flex-1 p-6 max-w-[1480px] w-full mx-auto">
          {activeTab === 'DASHBOARD' && (
            <DashboardPage
              onOpenStockCard={handleOpenStockCard}
              onNavigateToImports={() => setActiveTab('IMPORTS')}
              onNavigateToPos={() => setActiveTab('POS')}
            />
          )}
          {activeTab === 'PRODUCTS' && (
            <ProductManagementPage onOpenStockCard={handleOpenStockCard} />
          )}
          {activeTab === 'STOCK_CARD' && (
            <ProductStockCardPage
              productId={selectedStockCardProductId}
              onBack={() => setActiveTab('PRODUCTS')}
            />
          )}
          {activeTab === 'IMPORTS' && <SuppliersAndPurchaseOrdersPage />}
          {activeTab === 'POS' && (
            <PosTerminalPage
              initialCartItems={posInitialCart}
              onClearInitialCart={() => setPosInitialCart(undefined)}
              onNavigateToInvoices={() => setActiveTab('INVOICES')}
            />
          )}
          {activeTab === 'INVOICES' && <InvoicesManagementPage />}
          {activeTab === 'PAYMENTS' && <PaymentsLedgerPage />}
          {activeTab === 'CUSTOMERS' && <CustomersPage />}
          {activeTab === 'AI_OCR' && (
            <PrescriptionOcrPage onTransferToPos={handleTransferOcrToPos} />
          )}
          {activeTab === 'AI_CLINICAL' && <ClinicalAiAndInteractionPage />}
          {activeTab === 'CONTACT' && <ContactPage />}
          {activeTab === 'AUTH' && (
            <AuthPage
              currentUser={currentUser}
              onAuthSuccess={(user) => setCurrentUser(user)}
              onLogout={() => setCurrentUser(null)}
            />
          )}
        </main>
      </div>

      {/* Modal Tra cứu Phím tắt Bàn phím */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-900">
                Tổ hợp phím tắt điều khiển nhanh
              </h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {SHORTCUT_ITEMS.map((sc) => (
                <div key={sc.key} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-slate-600">{sc.desc}</span>
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-semibold text-teal-700">
                    {sc.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
