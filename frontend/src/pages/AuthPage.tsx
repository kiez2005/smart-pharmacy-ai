import React, { useEffect, useMemo, useState } from 'react';
import {
  LogOut,
  User,
  UserPlus,
  KeyRound,
  CheckCircle2,
  Copy,
  Trash2,
  ShieldCheck,
  X,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../types/forms';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import {
  ColumnConfig,
  EnterprisePagination,
  EnterpriseToolbar,
} from '../components/common/EnterpriseDataToolbar';
import { ModalPortal } from '../components/common/ModalPortal';

interface AuthPageProps {
  currentUser: UserProfile | null;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
}

const STAFF_COLUMNS: ColumnConfig[] = [
  { id: 'UserID', label: 'Mã nhân sự' },
  { id: 'FullName', label: 'Họ tên & Email công vụ' },
  { id: 'License', label: 'Chứng chỉ hành nghề Dược' },
  { id: 'Phone', label: 'Số điện thoại' },
  { id: 'Role', label: 'Vai trò (RBAC)' },
  { id: 'Status', label: 'Trạng thái ca trực' },
];

const RBAC_PERMISSION_MATRIX = [
  {
    feature: 'Bán lẻ POS, Cắt liều Đa đơn vị (Hộp/Vỉ/Viên) & Tạo VietQR',
    admin: true,
    pharmacist: true,
    cashier: true,
  },
  {
    feature: 'Duyệt đơn thuốc kê đơn (Rx), Kiểm tra Dị ứng & Tư vấn Lâm sàng',
    admin: true,
    pharmacist: true,
    cashier: false,
  },
  {
    feature: 'Lập Phiếu Nhập Kho NCC, Kiểm kê Cân bằng kho & Xem Giá vốn',
    admin: true,
    pharmacist: true,
    cashier: false,
  },
  {
    feature: 'Hoàn trả Hóa đơn, Xuất Phiếu Chi Sổ Quỹ & Phân quyền RBAC',
    admin: true,
    pharmacist: false,
    cashier: false,
  },
];

export const AuthPage: React.FC<AuthPageProps> = ({
  currentUser,
  onAuthSuccess,
  onLogout,
}) => {
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [loadingStaff, setLoadingStaff] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // 11 Chức năng Data Grid
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  // Modal Đăng nhập / Cấp tài khoản mới
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('REGISTER');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('trung.nguyen@pharmacore.vn');
  const [password, setPassword] = useState('123456');
  const [phone, setPhone] = useState('0988123456');
  const [loading, setLoading] = useState(false);

  const loadStaff = async () => {
    setLoadingStaff(true);
    try {
      const list = await enterpriseApi.getStaff();
      setStaffList(list);
      setSelectedIds([]);
    } catch {
      toast.error('Không thể tải danh sách nhân sự');
    } finally {
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    void loadStaff();
  }, []);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      const updated = await enterpriseApi.updateStaffRole(userId, newRole);
      toast.success(`Đã cập nhật quyền của "${updated.FullName}" thành ${updated.Role}`);
      await loadStaff();
    } catch {
      toast.error('Không thể cập nhật phân quyền nhân sự');
    }
  };

  const handleDeleteOne = async (u: UserProfile) => {
    if (!window.confirm(`Xác nhận xóa tài khoản nhân sự "${u.FullName}"?`)) return;
    try {
      await enterpriseApi.deleteRecord('staff', u.UserID);
      toast.success(`Đã xóa nhân sự ${u.FullName}`);
      await loadStaff();
    } catch {
      toast.error('Nhân sự đã phát sinh chứng từ hóa đơn, không thể xóa');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 nhân sự trong bảng');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} tài khoản đã chọn?`)) return;
    try {
      const count = await enterpriseApi.bulkDelete('staff', selectedIds);
      toast.success(`Đã xóa ${count} tài khoản nhân sự`);
      await loadStaff();
    } catch {
      toast.error('Không thể xóa tài khoản đã có chứng từ');
    }
  };

  const handleCloneOne = async (u: UserProfile) => {
    try {
      await enterpriseApi.cloneRecord('staff', u.UserID);
      toast.success(`Đã nhân bản hồ sơ nhân sự "${u.FullName}"`);
      await loadStaff();
    } catch {
      toast.error('Không thể nhân bản tài khoản');
    }
  };

  const handleBulkClone = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 nhân sự để nhân bản');
      return;
    }
    try {
      const count = await enterpriseApi.bulkClone('staff', selectedIds);
      toast.success(`Đã nhân bản ${count} tài khoản nhân sự`);
      await loadStaff();
    } catch {
      toast.error('Không thể nhân bản hàng loạt');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'LOGIN') {
        const res = await formsApi.login(email, password);
        toast.success(`Đã đăng nhập phiên làm việc: ${res.user.FullName}`);
        onAuthSuccess(res.user, res.token);
        setShowAuthModal(false);
      } else {
        const res = await formsApi.register({
          FullName: fullName,
          Email: email,
          Password: password,
          Phone: phone,
        });
        toast.info(res.message || 'Đăng ký thành công! Tài khoản đang chờ Quản trị viên kích hoạt.');
        setFullName('');
        setEmail('');
        setPassword('');
        setShowAuthModal(false);
        await loadStaff();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể xác thực tài khoản';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(
      (u) =>
        u.FullName.toLowerCase().includes(q) ||
        u.Email.toLowerCase().includes(q) ||
        (u.Phone || '').toLowerCase().includes(q) ||
        u.Role.toLowerCase().includes(q)
    );
  }, [staffList, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedStaff = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  return (
    <div className="space-y-6">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="staff"
        title="Quản Trị Nhân Sự Dược Sĩ & Phân Quyền Hệ Thống (RBAC & Auth)"
        subtitle="Quản lý chứng chỉ hành nghề Dược, phân quyền vai trò theo chuẩn GPP (đầy đủ 11 chức năng CRUD, Nhân bản, Export Excel/JSON/XML)."
        createLabel="Cấp Tài khoản mới (Alt+N)"
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo họ tên dược sĩ, email công vụ, SĐT hoặc quyền... (Alt + F)"
        columns={STAFF_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={(colId) =>
          setVisibleColumns((prev) => ({
            ...prev,
            [colId]: prev[colId] === false ? true : false,
          }))
        }
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onOpenCreate={() => {
          setMode('REGISTER');
          setShowAuthModal(true);
        }}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => void handleBulkClone()}
        onCloneSelected={() => {
          if (selectedIds.length === 1) {
            const found = staffList.find((u) => u.UserID === selectedIds[0]);
            if (found) void handleCloneOne(found);
          }
        }}
        onReload={loadStaff}
        extraFilters={
          <button
            type="button"
            onClick={() => {
              setMode('LOGIN');
              setShowAuthModal(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3.5 text-xs font-semibold text-teal-800 shadow-sm hover:bg-teal-100 transition-colors"
          >
            <KeyRound className="h-3.5 w-3.5 text-teal-600" />
            <span>Đổi Ca Trực / Đăng Nhập</span>
          </button>
        }
      />

      {/* Phiên đăng nhập hiện tại */}
      {currentUser && (
        <div className="rounded-xl bg-gradient-to-r from-teal-50/90 via-white to-slate-50 p-4 shadow-2xs border border-teal-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  Dược sĩ phụ trách ca trực: {currentUser.FullName}
                </span>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-800">
                  Quyền: {currentUser.Role}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Email công vụ: {currentUser.Email} · Chứng chỉ hành nghề: CCHN-HN-004921/BYT
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Kết thúc ca / Đăng xuất</span>
          </button>
        </div>
      )}

      {/* BẢNG ĐỘI NGŨ NHÂN SỰ FULL-WIDTH 100% */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-9">
                  <input
                    type="checkbox"
                    checked={
                      pagedStaff.length > 0 &&
                      pagedStaff.every((u) => selectedIds.includes(u.UserID))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(pagedStaff.map((u) => u.UserID));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                  />
                </th>
                {visibleColumns.UserID !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Mã NV</th>
                )}
                {visibleColumns.FullName !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Họ tên & Email công vụ</th>
                )}
                {visibleColumns.License !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Chứng chỉ hành nghề</th>
                )}
                {visibleColumns.Phone !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Số điện thoại</th>
                )}
                {visibleColumns.Role !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Vai trò Phân quyền (RBAC)</th>
                )}
                {visibleColumns.Status !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Trạng thái</th>
                )}
                <th className="py-3 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-[13px]">
              {loadingStaff ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Đang tải danh sách nhân sự...
                  </td>
                </tr>
              ) : (
                pagedStaff.map((u) => {
                  const isCurrent = currentUser?.Email === u.Email;
                  return (
                    <tr key={u.UserID} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.UserID)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(u.UserID)
                                ? prev.filter((id) => id !== u.UserID)
                                : [...prev, u.UserID]
                            )
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                        />
                      </td>
                      {visibleColumns.UserID !== false && (
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                          NV-{String(u.UserID).padStart(3, '0')}
                        </td>
                      )}
                      {visibleColumns.FullName !== false && (
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{u.FullName}</span>
                            {isCurrent && (
                              <span className="rounded-md bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                Đang trực
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{u.Email}</div>
                        </td>
                      )}
                      {visibleColumns.License !== false && (
                        <td className="py-3 px-4 font-mono text-xs text-teal-700 whitespace-nowrap">
                          CCHN-{String(u.UserID + 4900).padStart(5, '0')}/BYT
                        </td>
                      )}
                      {visibleColumns.Phone !== false && (
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {u.Phone || '0988123456'}
                        </td>
                      )}
                      {visibleColumns.Role !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          <select
                            value={u.Role}
                            onChange={(e) => void handleRoleChange(u.UserID, e.target.value)}
                            className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-teal-600 focus:outline-none"
                          >
                            <option value="ADMIN">ADMIN (Dược sĩ Phụ trách)</option>
                            <option value="PHARMACIST">PHARMACIST (Dược sĩ Lâm sàng)</option>
                            <option value="CASHIER">CASHIER (Thu ngân POS)</option>
                          </select>
                        </td>
                      )}
                      {visibleColumns.Status !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/70">
                            <CheckCircle2 className="h-3 w-3" />
                            Đang hoạt động
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => void handleCloneOne(u)}
                            title="Nhân bản (Alt+C)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteOne(u)}
                            title="Xóa (Alt+H)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <EnterprisePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* MA TRẬN PHÂN QUYỀN CHỨC NĂNG (RBAC PERMISSION MATRIX) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Ma Trận Phân Quyền Nghiệp Vụ Chuẩn GPP (Role-Based Access Control Matrix)
            </h2>
          </div>
          <span className="text-xs text-slate-500">Áp dụng tự động theo Token JWT</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/40 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Nghiệp vụ / Phân hệ chức năng</th>
                <th className="py-2.5 px-4 text-center">ADMIN (DS. Phụ trách)</th>
                <th className="py-2.5 px-4 text-center">PHARMACIST (DS. Lâm sàng)</th>
                <th className="py-2.5 px-4 text-center">CASHIER (Thu ngân POS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-xs">
              {RBAC_PERMISSION_MATRIX.map((row) => (
                <tr key={row.feature} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{row.feature}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Toàn quyền
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {row.pharmacist ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Được phép
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                        <Lock className="h-3 w-3" /> Giới hạn
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {row.cashier ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Được phép
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                        <Lock className="h-3 w-3" /> Giới hạn
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Đăng nhập / Cấp Tài khoản mới */}
      {showAuthModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4">
            <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 py-3.5 bg-slate-50/70 shrink-0">
              <h3 className="text-sm font-bold text-slate-900">
                {mode === 'LOGIN'
                  ? 'Xác thực Đăng nhập Ca trực'
                  : 'Cấp Tài khoản Nhân sự Mới'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode('LOGIN')}
                  className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-lg py-1 text-xs font-semibold transition-colors ${
                    mode === 'LOGIN' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Đăng nhập ca trực</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('REGISTER')}
                  className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-lg py-1 text-xs font-semibold transition-colors ${
                    mode === 'REGISTER' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Cấp tài khoản mới</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                {mode === 'LOGIN' && (
                  <div className="rounded-lg bg-teal-50/80 border border-teal-200/80 p-2.5 space-y-1.5">
                    <div className="text-[11px] font-bold text-teal-900 flex items-center justify-between">
                      <span>⚡ Chọn nhanh tài khoản demo (Mật khẩu: 123456):</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('trung.d18cnpm5@epu.edu.vn');
                          setPassword('123456');
                        }}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-white border border-teal-200 text-[11px] hover:bg-teal-100/70 flex items-center justify-between transition-colors shadow-2xs"
                      >
                        <span className="font-semibold text-slate-800">1. DS. Nguyễn Văn Trung</span>
                        <span className="rounded bg-rose-50 text-rose-700 px-1.5 py-0.5 font-bold text-[10px] border border-rose-200">
                          ADMIN
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('duc.d18cnpm5@epu.edu.vn');
                          setPassword('123456');
                        }}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-white border border-teal-200 text-[11px] hover:bg-teal-100/70 flex items-center justify-between transition-colors shadow-2xs"
                      >
                        <span className="font-semibold text-slate-800">2. DS. Đặng Minh Đức</span>
                        <span className="rounded bg-teal-50 text-teal-700 px-1.5 py-0.5 font-bold text-[10px] border border-teal-200">
                          PHARMACIST
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('baongoc.pharmacore@epu.edu.vn');
                          setPassword('123456');
                        }}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-white border border-teal-200 text-[11px] hover:bg-teal-100/70 flex items-center justify-between transition-colors shadow-2xs"
                      >
                        <span className="font-semibold text-slate-800">3. DS. Lê Hoàng Bảo Ngọc</span>
                        <span className="rounded bg-slate-100 text-slate-700 px-1.5 py-0.5 font-bold text-[10px] border border-slate-200">
                          CASHIER
                        </span>
                      </button>
                    </div>
                  </div>
                )}
                {mode === 'REGISTER' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Họ và tên dược sĩ / nhân viên <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="VD: DS. Phạm Thu Hà"
                      className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email công vụ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mật khẩu xác thực <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>

                {mode === 'REGISTER' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Số điện thoại</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                )}

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(false)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors"
                  >
                    {loading
                      ? 'Đang xử lý...'
                      : mode === 'LOGIN'
                      ? 'Xác thực Đăng nhập'
                      : 'Cấp Tài khoản Nhân sự'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
