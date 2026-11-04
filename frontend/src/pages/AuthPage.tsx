import React, { useEffect, useState } from 'react';
import { LogOut, User, Shield, UserPlus, KeyRound, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../types/forms';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';

interface AuthPageProps {
  currentUser: UserProfile | null;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  currentUser,
  onAuthSuccess,
  onLogout,
}) => {
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [loadingStaff, setLoadingStaff] = useState<boolean>(true);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            Quản Trị Nhân Sự Dược Sĩ & Phân Quyền Hệ Thống (RBAC & Auth)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Quản lý danh sách tài khoản dược sĩ, thu ngân, phân quyền vai trò truy cập và xác thực phiên làm việc JWT.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Cột Trái (7 cols): Bảng Đội ngũ Nhân sự & Phân quyền */}
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-zinc-900" />
              <h2 className="text-sm font-semibold text-zinc-900">
                Danh sách Nhân sự Nhà thuốc ({staffList.length} tài khoản)
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-4">Mã NV</th>
                  <th className="py-2.5 px-4">Họ tên & Email công vụ</th>
                  <th className="py-2.5 px-4">Số điện thoại</th>
                  <th className="py-2.5 px-4">Vai trò (RBAC)</th>
                  <th className="py-2.5 px-4 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {loadingStaff ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-400">
                      Đang tải danh sách nhân sự...
                    </td>
                  </tr>
                ) : (
                  staffList.map((u) => {
                    const isCurrent = currentUser?.Email === u.Email;
                    return (
                      <tr key={u.UserID} className="hover:bg-zinc-50">
                        <td className="py-3 px-4 font-mono text-zinc-500">
                          NV-{String(u.UserID).padStart(3, '0')}
                        </td>
                        <td className="py-3 px-4">
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
                        <td className="py-3 px-4 text-zinc-600">{u.Phone || '---'}</td>
                        <td className="py-3 px-4">
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
                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                            <CheckCircle2 className="h-3 w-3" />
                            Hoạt động
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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

          {/* Form Chuyển đổi tài khoản hoặc Cấp tài khoản nhân sự mới */}
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
