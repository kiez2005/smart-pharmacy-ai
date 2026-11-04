import React, { useEffect, useMemo, useState } from 'react';
import {
  LogOut,
  User,
  UserPlus,
  KeyRound,
  CheckCircle2,
  Copy,
  Trash2,
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

interface AuthPageProps {
  currentUser: UserProfile | null;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
}

const STAFF_COLUMNS: ColumnConfig[] = [
  { id: 'UserID', label: 'Mã nhân sự' },
  { id: 'FullName', label: 'Họ tên & Email công vụ' },
  { id: 'Phone', label: 'Số điện thoại' },
  { id: 'Role', label: 'Vai trò (RBAC)' },
  { id: 'Status', label: 'Trạng thái' },
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

  // Form Đăng nhập / Tạo tài khoản mới
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('REGISTER');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('trung.d18cnpm5@epu.edu.vn');
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
      } else {
        const res = await formsApi.register({
          FullName: fullName,
          Email: email,
          Password: password,
          Phone: phone,
        });
        toast.success(`Đã tạo tài khoản nhân sự: ${res.user.FullName}`);
        onAuthSuccess(res.user, res.token);
        setFullName('');
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
        subtitle="Quản lý danh sách tài khoản dược sĩ, thu ngân, phân quyền vai trò (đầy đủ 11 chức năng CRUD, Nhân bản, Export Excel/JSON/XML, Ẩn/Hiện cột)."
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
        onOpenCreate={() => setMode('REGISTER')}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => void handleBulkClone()}
        onCloneSelected={() => {
          if (selectedIds.length === 1) {
            const found = staffList.find((u) => u.UserID === selectedIds[0]);
            if (found) void handleCloneOne(found);
          }
        }}
        onReload={loadStaff}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Cột Trái (7 cols): Bảng Đội ngũ Nhân sự & Phân quyền chuẩn 11 chức năng */}
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-3 w-8">
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
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                    />
                  </th>
                  {visibleColumns.UserID !== false && <th className="py-2.5 px-3">Mã NV</th>}
                  {visibleColumns.FullName !== false && (
                    <th className="py-2.5 px-3">Họ tên & Email công vụ</th>
                  )}
                  {visibleColumns.Phone !== false && <th className="py-2.5 px-3">Số điện thoại</th>}
                  {visibleColumns.Role !== false && <th className="py-2.5 px-3">Vai trò (RBAC)</th>}
                  {visibleColumns.Status !== false && (
                    <th className="py-2.5 px-3 text-right">Trạng thái</th>
                  )}
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {loadingStaff ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-400">
                      Đang tải danh sách nhân sự...
                    </td>
                  </tr>
                ) : (
                  pagedStaff.map((u) => {
                    const isCurrent = currentUser?.Email === u.Email;
                    return (
                      <tr key={u.UserID} className="hover:bg-zinc-50">
                        <td className="py-3 px-3">
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
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                          />
                        </td>
                        {visibleColumns.UserID !== false && (
                          <td className="py-3 px-3 font-mono text-zinc-500">
                            NV-{String(u.UserID).padStart(3, '0')}
                          </td>
                        )}
                        {visibleColumns.FullName !== false && (
                          <td className="py-3 px-3">
                            <div className="font-semibold text-zinc-900 flex items-center gap-1.5">
                              <span>{u.FullName}</span>
                              {isCurrent && (
                                <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  Đang trực
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500">{u.Email}</div>
                          </td>
                        )}
                        {visibleColumns.Phone !== false && (
                          <td className="py-3 px-3 text-zinc-600">{u.Phone || '---'}</td>
                        )}
                        {visibleColumns.Role !== false && (
                          <td className="py-3 px-3">
                            <select
                              value={u.Role}
                              onChange={(e) => void handleRoleChange(u.UserID, e.target.value)}
                              className="h-7 rounded border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-800"
                            >
                              <option value="ADMIN">ADMIN (Quản trị trưởng)</option>
                              <option value="PHARMACIST">PHARMACIST (Dược sĩ)</option>
                              <option value="CASHIER">CASHIER (Thu ngân POS)</option>
                            </select>
                          </td>
                        )}
                        {visibleColumns.Status !== false && (
                          <td className="py-3 px-3 text-right">
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                              <CheckCircle2 className="h-3 w-3" />
                              Hoạt động
                            </span>
                          </td>
                        )}
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => void handleCloneOne(u)}
                              title="Nhân bản (Alt+C)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteOne(u)}
                              title="Xóa (Alt+H)"
                              className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
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

        {/* Cột Phải (5 cols): Thông tin Phiên đăng nhập & Form Đăng nhập / Đăng ký */}
        <div className="lg:col-span-5 space-y-5">
          {currentUser && (
            <div className="rounded-lg bg-white p-5 shadow-2xs border border-zinc-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Phiên làm việc hiện tại</div>
                    <h3 className="text-sm font-semibold text-zinc-900">{currentUser.FullName}</h3>
                    <p className="text-xs text-zinc-500">
                      {currentUser.Email} · Quyền: <strong>{currentUser.Role}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-white p-5 shadow-2xs border border-zinc-200 space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setMode('LOGIN')}
                className={`inline-flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors ${
                  mode === 'LOGIN' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Đăng nhập ca trực</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('REGISTER')}
                className={`inline-flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors ${
                  mode === 'REGISTER' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Tạo tài khoản mới</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              {mode === 'REGISTER' && (
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Họ và tên dược sĩ / nhân viên <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="VD: DS. Phạm Thu Hà"
                    className="w-full h-9 rounded-md border border-zinc-300 px-3"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Email công vụ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-300 px-3"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Mật khẩu xác thực <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-300 px-3"
                />
              </div>

              {mode === 'REGISTER' && (
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-300 px-3"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 rounded-md bg-zinc-900 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {loading
                  ? 'Đang xử lý...'
                  : mode === 'LOGIN'
                  ? 'Xác thực Đăng nhập'
                  : 'Cấp Tài khoản Nhân sự Mới'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
