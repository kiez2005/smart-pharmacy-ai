import React, { useState } from 'react';
import { Toaster } from 'sonner';
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
  { key: 'Alt + N', desc: 'Mở cửa sổ thêm dược phẩm mới' },
  { key: 'Alt + S', desc: 'Lưu nhanh biểu mẫu đang mở' },
  { key: 'Alt + F', desc: 'Đưa con trỏ vào thanh tìm kiếm' },
  { key: 'Alt + E', desc: 'Chỉnh sửa dòng dược phẩm đang chọn' },
  { key: 'Alt + V', desc: 'Xem chi tiết dòng dược phẩm đang chọn' },
  { key: 'Alt + C', desc: 'Nhân bản 1 bản ghi đang chọn' },
  { key: 'Alt + D', desc: 'Nhân bản hàng loạt các mục đã đánh dấu' },
  { key: 'Alt + H', desc: 'Xóa các mục đã đánh dấu' },
  { key: 'Alt + I', desc: 'Nhập dữ liệu từ tệp (.xlsx, .json, .xml)' },
  { key: 'Alt + X', desc: 'Xuất nhanh danh mục ra Excel (.xlsx)' },
  { key: 'Alt + K', desc: 'Bật/tắt tùy chỉnh cột hiển thị' },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD');
  const [selectedStockCardProductId, setSelectedStockCardProductId] = useState<number>(1);
  const [posInitialCart, setPosInitialCart] = useState<PosCartItem[] | undefined>(undefined);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

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

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{ id: ActiveTab; label: string; icon: React.ElementType }>;
  }> = [
    {
      groupLabel: 'Quản trị Kho & Dược phẩm',
      items: [
        { id: 'DASHBOARD', label: 'Tổng quan điều hành', icon: LayoutDashboard },
        { id: 'PRODUCTS', label: 'Danh mục dược phẩm', icon: Package },
        { id: 'STOCK_CARD', label: 'Hồ sơ thuốc & Thẻ kho', icon: FileSpreadsheet },
        { id: 'IMPORTS', label: 'Nhà cung cấp & Nhập kho', icon: Truck },
      ],
    },
    {
      groupLabel: 'Bán lẻ POS & Tài chính',
      items: [
        { id: 'POS', label: 'Quầy thu ngân POS', icon: ShoppingCart },
        { id: 'INVOICES', label: 'Hóa đơn & Hoàn trả hàng', icon: Receipt },
        { id: 'PAYMENTS', label: 'Sổ quỹ & Đối soát VietQR', icon: Wallet },
        { id: 'CUSTOMERS', label: 'Hồ sơ bệnh nhân & Dị ứng', icon: Users },
      ],
    },
    {
      groupLabel: 'Lâm sàng AI & Hệ thống',
      items: [
        { id: 'AI_OCR', label: 'Số hóa đơn thuốc (OCR)', icon: ScanLine },
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
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 flex">
      <Toaster position="bottom-right" />

      {/* ENTERPRISE SIDEBAR (12 Phân hệ Chuẩn Doanh Nghiệp — Cố định khi cuộn trang) */}
      <aside className="hidden md:flex w-64 flex-col border-r border-zinc-200/80 bg-white shrink-0 select-none sticky top-0 h-screen">
        {/* Brand Header */}
        <div className="h-14 flex items-center gap-2.5 border-b border-zinc-200/80 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[13px] font-semibold text-zinc-900 truncate">PharmaCore ERP</div>
            <div className="text-[11px] text-zinc-400 truncate">Hệ thống nhà thuốc chuẩn GPP</div>
          </div>
        </div>

        {/* 12-Module Navigation Groups */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.groupLabel} className="space-y-0.5">
              <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
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
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-white' : 'text-zinc-400'
                      }`}
                      strokeWidth={1.75}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-zinc-200/80 p-3 space-y-2">
          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Keyboard className="h-3.5 w-3.5" />
              <span>Phím tắt thao tác</span>
            </span>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              Alt
            </kbd>
          </button>

          <div
            onClick={() => setActiveTab('AUTH')}
            className="cursor-pointer flex items-center gap-2.5 rounded-md bg-zinc-50 px-2.5 py-2 border border-zinc-200/60 hover:bg-zinc-100 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
              NT
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-zinc-900 truncate">
                {currentUser ? currentUser.FullName : 'Chưa đăng nhập'}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {currentUser ? `Quyền: ${currentUser.Role}` : 'Nhấn để đăng nhập'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Slim Enterprise Topbar */}
        <header className="sticky top-0 z-20 h-14 border-b border-zinc-200/80 bg-white/90 backdrop-blur px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-zinc-400">PharmaCore</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
            <span className="text-zinc-500 hidden sm:inline">{activeGroup?.groupLabel}</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-300 hidden sm:inline" />
            <span className="font-semibold text-zinc-900">{activeLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile Nav Selector */}
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as ActiveTab)}
              className="md:hidden h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800"
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
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Quầy POS</span>
            </button>

            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              <Keyboard className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Phím tắt</span>
            </button>
          </div>
        </header>

        {/* Workspace Content (12 Modules) */}
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">Tổ hợp phím tắt hệ thống</h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 divide-y divide-zinc-100 max-h-96 overflow-y-auto">
              {SHORTCUT_ITEMS.map((sc) => (
                <div key={sc.key} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-zinc-600">{sc.desc}</span>
                  <kbd className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs font-medium text-zinc-800">
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
