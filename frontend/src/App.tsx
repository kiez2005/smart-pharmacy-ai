import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
  Menu,
  Building2,
  ChevronRight,
  ExternalLink,
  LogOut,
  MapPin,
} from 'lucide-react';
import type { PosCartItem } from './pages/PosTerminalPage';
import type { OcrTransferMeta } from './pages/PrescriptionOcrPage';
import { LoginPage } from './pages/LoginPage';
import { ModalPortal } from './components/common/ModalPortal';
import { UserProfile } from './types/forms';
import { formsApi } from './services/forms.api';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const ProductManagementPage = lazy(() =>
  import('./pages/ProductManagementPage').then((m) => ({ default: m.ProductManagementPage }))
);
const ProductStockCardPage = lazy(() =>
  import('./pages/ProductStockCardPage').then((m) => ({ default: m.ProductStockCardPage }))
);
const SuppliersAndPurchaseOrdersPage = lazy(() =>
  import('./pages/SuppliersAndPurchaseOrdersPage').then((m) => ({
    default: m.SuppliersAndPurchaseOrdersPage,
  }))
);
const PosTerminalPage = lazy(() =>
  import('./pages/PosTerminalPage').then((m) => ({ default: m.PosTerminalPage }))
);
const StaffOnlineOrdersPage = lazy(() =>
  import('./pages/StaffOnlineOrdersPage').then((m) => ({ default: m.StaffOnlineOrdersPage }))
);
const InvoicesManagementPage = lazy(() =>
  import('./pages/InvoicesManagementPage').then((m) => ({ default: m.InvoicesManagementPage }))
);
const PaymentsLedgerPage = lazy(() =>
  import('./pages/PaymentsLedgerPage').then((m) => ({ default: m.PaymentsLedgerPage }))
);
const CustomersPage = lazy(() =>
  import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage }))
);
const PrescriptionOcrPage = lazy(() =>
  import('./pages/PrescriptionOcrPage').then((m) => ({ default: m.PrescriptionOcrPage }))
);
const ClinicalAiAndInteractionPage = lazy(() =>
  import('./pages/ClinicalAiAndInteractionPage').then((m) => ({
    default: m.ClinicalAiAndInteractionPage,
  }))
);
const ContactPage = lazy(() =>
  import('./pages/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5174';

const ROLE_DISPLAY_LABEL: Record<string, string> = {
  ADMIN: 'Quản trị hệ thống',
  PHARMACIST: 'Dược sĩ lâm sàng',
  CASHIER: 'Thu ngân & Bán hàng',
};

const TabLoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[320px] gap-3 text-slate-500">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    <span className="text-sm font-medium">Đang tải phân hệ ERP...</span>
  </div>
);

export type ActiveTab =
  | 'DASHBOARD'
  | 'PRODUCTS'
  | 'STOCK_CARD'
  | 'IMPORTS'
  | 'POS'
  | 'STAFF_ORDERS'
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
  const [posOcrMeta, setPosOcrMeta] = useState<OcrTransferMeta | undefined>(undefined);
  const [pendingOcrFileKey, setPendingOcrFileKey] = useState<string | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const token = localStorage.getItem('pharmacore_token');
    const savedUser = localStorage.getItem('pharmacore_user');
    if (token && savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        localStorage.removeItem('pharmacore_token');
        localStorage.removeItem('pharmacore_user');
        return null;
      }
    }
    localStorage.removeItem('pharmacore_token');
    localStorage.removeItem('pharmacore_user');
    return null;
  });
  const [sessionExpired, setSessionExpired] = useState(false);
  const unauthorizedHandled = useRef(false);

  // Lắng nghe sự kiện hết hạn / thu hồi token 401 từ Axios Interceptor + Xác thực phiên thực từ /auth/me (A3)
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
      localStorage.removeItem('pharmacore_token');
      localStorage.removeItem('pharmacore_user');
      setSessionExpired(true);
      if (!unauthorizedHandled.current) {
        unauthorizedHandled.current = true;
        toast.error('Phiên làm việc đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại!');
      }
    };
    window.addEventListener('pharmacore_unauthorized', handleUnauthorized);

    if (localStorage.getItem('pharmacore_token')) {
      formsApi
        .getMe()
        .then((freshUser) => {
          setCurrentUser(freshUser);
          localStorage.setItem('pharmacore_user', JSON.stringify(freshUser));
        })
        .catch(() => {
          // 401 interceptor sẽ xử lý nếu token đã bị thu hồi
        });
    }

    return () => window.removeEventListener('pharmacore_unauthorized', handleUnauthorized);
  }, []);

  const handleOpenStockCard = (productId: number) => {
    setSelectedStockCardProductId(productId);
    setActiveTab('STOCK_CARD');
  };

  const handleTransferOcrToPos = (items: PosCartItem[], ocrMeta?: OcrTransferMeta) => {
    setPosInitialCart(items);
    setPosOcrMeta(ocrMeta);
    setActiveTab('POS');
  };

  const handleLogout = async () => {
    await formsApi.logout();
    setCurrentUser(null);
    setSessionExpired(false);
    setIsMobileMenuOpen(false);
    toast.success('Đã đăng xuất và thu hồi phiên đăng nhập');
  };

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{
      id: ActiveTab;
      label: string;
      icon: React.ElementType;
      badge?: string;
      roles?: Array<'ADMIN' | 'PHARMACIST' | 'CASHIER'>;
    }>;
  }> = [
    {
      groupLabel: 'Phân khu 1: Quản trị Kho & Dược phẩm',
      items: [
        {
          id: 'DASHBOARD',
          label: 'Tổng quan điều hành',
          icon: LayoutDashboard,
          roles: ['ADMIN', 'PHARMACIST'],
        },
        { id: 'PRODUCTS', label: 'Danh mục dược phẩm', icon: Package, badge: 'GPP/GDP' },
        {
          id: 'STOCK_CARD',
          label: 'Thẻ kho & Kiểm kê',
          icon: FileSpreadsheet,
          badge: 'FEFO',
          roles: ['ADMIN', 'PHARMACIST'],
        },
        {
          id: 'IMPORTS',
          label: 'Nhà cung cấp & Nhập kho',
          icon: Truck,
          roles: ['ADMIN', 'PHARMACIST'],
        },
      ],
    },
    {
      groupLabel: 'Phân khu 2: Bán lẻ, Bán buôn & Online',
      items: [
        { id: 'POS', label: 'Bán lẻ POS & Bán buôn B2B', icon: ShoppingCart, badge: 'POS/B2B' },
        { id: 'STAFF_ORDERS', label: 'Đơn online (Xử lý & Duyệt)', icon: Truck, badge: 'ONLINE' },
        { id: 'INVOICES', label: 'Hóa đơn, Công nợ & Hoàn trả', icon: Receipt },
        {
          id: 'PAYMENTS',
          label: 'Sổ quỹ Thu - Chi & VietQR',
          icon: Wallet,
          roles: ['ADMIN', 'PHARMACIST'],
        },
        { id: 'CUSTOMERS', label: 'Bệnh nhân & Đại lý B2B', icon: Users },
        {
          id: 'AUTH',
          label: 'Nhân sự & Phân quyền',
          icon: Shield,
          roles: ['ADMIN'],
        },
      ],
    },
    {
      groupLabel: 'Phân khu 3: AI Dược lâm sàng & Tư vấn',
      items: [
        {
          id: 'AI_OCR',
          label: 'AI Quét đơn (OCR)',
          icon: ScanLine,
          badge: 'OCR',
          roles: ['ADMIN', 'PHARMACIST'],
        },
        {
          id: 'AI_CLINICAL',
          label: 'AI Lâm sàng & Tương tác',
          icon: Stethoscope,
          badge: 'AI',
          roles: ['ADMIN', 'PHARMACIST'],
        },
        {
          id: 'CONTACT',
          label: 'Hộp thư Dược sĩ',
          icon: MessageSquare,
          roles: ['ADMIN', 'PHARMACIST'],
        },
      ],
    },
  ];

  // P2-01: Tự động điều hướng về màn hình hợp lệ nếu vai trò hiện tại không có quyền truy cập tab đang chọn
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.Role === 'CASHIER') {
      const allowedCashierTabs: ActiveTab[] = [
        'POS',
        'PRODUCTS',
        'STAFF_ORDERS',
        'INVOICES',
        'CUSTOMERS',
      ];
      if (!allowedCashierTabs.includes(activeTab)) {
        setActiveTab('POS');
      }
    } else if (currentUser.Role === 'PHARMACIST' && activeTab === 'AUTH') {
      setActiveTab('DASHBOARD');
    }
  }, [currentUser, activeTab]);

  const isNavItemVisible = (item: { roles?: Array<'ADMIN' | 'PHARMACIST' | 'CASHIER'> }) => {
    if (!item.roles || !currentUser) return true;
    return item.roles.includes(currentUser.Role as 'ADMIN' | 'PHARMACIST' | 'CASHIER');
  };

  const visibleNavGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter(isNavItemVisible),
    }))
    .filter((g) => g.items.length > 0);

  const activeGroup = visibleNavGroups.find((g) => g.items.some((i) => i.id === activeTab));
  const activeLabel =
    visibleNavGroups.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label || '';

  if (!currentUser) {
    return (
      <>
        <Toaster position="bottom-right" richColors />
        <LoginPage
          sessionExpired={sessionExpired}
          onAuthSuccess={(user, token) => {
            unauthorizedHandled.current = false;
            setSessionExpired(false);
            setCurrentUser(user);
            localStorage.setItem('pharmacore_user', JSON.stringify(user));
            localStorage.setItem('pharmacore_token', token);
            if (user.Role === 'CASHIER') {
              setActiveTab('POS');
            }
          }}
        />
      </>
    );
  }

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
            v2.5
          </span>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {visibleNavGroups.map((group) => (
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

          <div className="flex items-center gap-1.5">
            <div
              onClick={() => {
                if (currentUser.Role === 'ADMIN') {
                  setActiveTab('AUTH');
                }
              }}
              className={`${
                currentUser.Role === 'ADMIN' ? 'cursor-pointer hover:border-teal-300' : 'cursor-default'
              } flex flex-1 min-w-0 items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 border border-slate-200/90 shadow-2xs transition-colors`}
            >
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                {currentUser.FullName.slice(0, 2).toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {currentUser.FullName}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {ROLE_DISPLAY_LABEL[currentUser.Role] || currentUser.Role}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất & thu hồi token"
              className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MOBILE NAVIGATION DRAWER (Slide-over từ bên trái trên thiết bị di động & máy tính bảng) */}
      {isMobileMenuOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex md:hidden bg-slate-950/60 backdrop-blur-xs">
            <div className="w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col justify-between border-r border-slate-200 animate-in slide-in-from-left duration-200">
            <div>
              {/* Mobile Drawer Header */}
              <div className="h-14 flex items-center justify-between border-b border-slate-200 px-4 bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
                    <Building2 className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 leading-tight">PharmaCore ERP</div>
                    <div className="text-[10px] font-semibold text-teal-600">Chuẩn GPP Bộ Y Tế</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Mobile Single Verified Branch Badge (Issue 17) */}
              <div className="p-3 border-b border-slate-100 bg-teal-50/60 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-teal-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">
                    Cơ sở vận hành
                  </div>
                  <div className="text-xs font-bold text-slate-800 truncate">
                    CS1 - Nhà thuốc Trung Tâm (GPP)
                  </div>
                </div>
              </div>

              {/* Mobile Navigation Links */}
              <nav className="p-3 space-y-4 max-h-[calc(100vh-210px)] overflow-y-auto">
                {visibleNavGroups.map((group) => (
                  <div key={group.groupLabel} className="space-y-1">
                    <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group.groupLabel}
                    </div>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                            isActive
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                            <span>{item.label}</span>
                          </span>
                          {item.badge && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
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
            </div>

            {/* Mobile Footer Pharmacist Info */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
              <div
                onClick={() => {
                  if (currentUser.Role === 'ADMIN') {
                    setActiveTab('AUTH');
                    setIsMobileMenuOpen(false);
                  }
                }}
                className={`${
                  currentUser.Role === 'ADMIN' ? 'cursor-pointer' : 'cursor-default'
                } flex flex-1 min-w-0 items-center gap-2.5 rounded-lg bg-white p-2 border border-slate-200 shadow-2xs`}
              >
                <div className="h-8 w-8 shrink-0 rounded-full bg-teal-600 text-xs font-bold text-white flex items-center justify-center">
                  {currentUser.FullName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {currentUser.FullName}
                  </div>
                  <div className="text-[10px] text-teal-700 truncate">
                    {ROLE_DISPLAY_LABEL[currentUser.Role] || currentUser.Role}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất"
                className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Enterprise Topbar with Mobile Hamburger & Quick Actions */}
        <header className="sticky top-0 z-20 h-14 border-b border-slate-200/80 bg-white/95 backdrop-blur px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
              title="Mở menu danh mục"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-1.5 text-xs sm:text-[13px] min-w-0">
              <span className="text-slate-400 font-medium hidden sm:inline">PharmaCore</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden sm:inline" />
              <span className="text-slate-500 hidden lg:inline">{activeGroup?.groupLabel}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden lg:inline" />
              <span className="font-bold text-slate-900 truncate max-w-[150px] xs:max-w-[200px] sm:max-w-none">
                {activeLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Cơ sở Nhà thuốc Trung Tâm xác thực GPP (Issue 17) */}
            <div className="hidden xl:flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/80 px-3 h-9 text-xs font-semibold text-teal-900 shadow-2xs">
              <MapPin className="h-3.5 w-3.5 text-teal-600" />
              <span>CS1 - Nhà thuốc Trung Tâm (GPP)</span>
            </div>

            <a
              href={STOREFRONT_URL}
              target="_blank"
              rel="noreferrer"
              title="Mở Website Nhà thuốc trực tuyến dành cho khách hàng"
              className="hidden md:inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100 shadow-2xs transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Website Nhà thuốc</span>
            </a>

            <button
              type="button"
              onClick={() => setActiveTab('POS')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 sm:px-3.5 text-xs font-semibold text-white hover:bg-teal-700 shadow-2xs transition-colors"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">POS & Bán buôn B2B</span>
              <span className="xs:hidden">POS</span>
            </button>

            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-2xs"
            >
              <Keyboard className="h-3.5 w-3.5 text-slate-400" />
              <span className="hidden sm:inline">Phím tắt</span>
            </button>
          </div>
        </header>

        {/* Workspace Content (Lazy-loaded Code-split Modules) */}
        <main className="flex-1 p-3.5 sm:p-5 md:p-6 max-w-[1480px] w-full mx-auto">
          <Suspense fallback={<TabLoadingFallback />}>
            {activeTab === 'DASHBOARD' && currentUser.Role !== 'CASHIER' && (
              <DashboardPage
                onOpenStockCard={handleOpenStockCard}
                onNavigateToImports={() => setActiveTab('IMPORTS')}
                onNavigateToPos={() => setActiveTab('POS')}
              />
            )}
            {activeTab === 'PRODUCTS' && (
              <ProductManagementPage onOpenStockCard={handleOpenStockCard} />
            )}
            {activeTab === 'STOCK_CARD' && currentUser.Role !== 'CASHIER' && (
              <ProductStockCardPage
                productId={selectedStockCardProductId}
                onBack={() => setActiveTab('PRODUCTS')}
              />
            )}
            {activeTab === 'IMPORTS' && currentUser.Role !== 'CASHIER' && (
              <SuppliersAndPurchaseOrdersPage />
            )}
            {activeTab === 'POS' && (
              <PosTerminalPage
                initialCartItems={posInitialCart}
                initialOcrMeta={posOcrMeta}
                onClearInitialCart={() => {
                  setPosInitialCart(undefined);
                  setPosOcrMeta(undefined);
                }}
                onNavigateToInvoices={() => setActiveTab('INVOICES')}
              />
            )}
            {activeTab === 'STAFF_ORDERS' && <StaffOnlineOrdersPage />}
            {activeTab === 'INVOICES' && <InvoicesManagementPage />}
            {activeTab === 'PAYMENTS' && currentUser.Role !== 'CASHIER' && <PaymentsLedgerPage />}
            {activeTab === 'CUSTOMERS' && <CustomersPage />}
            {activeTab === 'AI_OCR' && currentUser.Role !== 'CASHIER' && (
              <PrescriptionOcrPage
                onTransferToPos={handleTransferOcrToPos}
                initialAttachmentFileKey={pendingOcrFileKey}
                onClearInitialAttachment={() => setPendingOcrFileKey(null)}
              />
            )}
            {activeTab === 'AI_CLINICAL' && currentUser.Role !== 'CASHIER' && (
              <ClinicalAiAndInteractionPage />
            )}
            {activeTab === 'CONTACT' && currentUser.Role !== 'CASHIER' && (
              <ContactPage
                onScanAttachmentWithOcr={(fileKey) => {
                  setPendingOcrFileKey(fileKey);
                  setActiveTab('AI_OCR');
                }}
              />
            )}
            {activeTab === 'AUTH' && currentUser.Role === 'ADMIN' && (
              <AuthPage
                currentUser={currentUser}
                onAuthSuccess={(user, token) => {
                  setCurrentUser(user);
                  localStorage.setItem('pharmacore_user', JSON.stringify(user));
                  if (token) localStorage.setItem('pharmacore_token', token);
                }}
                onLogout={handleLogout}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Modal Tra cứu Phím tắt Bàn phím */}
      {showShortcutsModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
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
        </ModalPortal>
      )}
    </div>
  );
};

export default App;
