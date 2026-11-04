import React, { useState } from 'react';
import { LogIn, UserPlus, KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../types/forms';
import { formsApi } from '../services/forms.api';

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
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('trung.d18cnpm5@epu.edu.vn');
  const [password, setPassword] = useState('123456');
  const [phone, setPhone] = useState('0988123456');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'LOGIN') {
        const res = await formsApi.login(email, password);
        toast.success(`Chào mừng ${res.user.FullName} đã đăng nhập!`);
        onAuthSuccess(res.user, res.token);
      } else {
        const res = await formsApi.register({
          FullName: fullName,
          Email: email,
          Password: password,
          Phone: phone,
        });
        toast.success(`Đăng ký thành công tài khoản ${res.user.FullName}!`);
        onAuthSuccess(res.user, res.token);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Lỗi xác thực tài khoản';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (currentUser) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{currentUser.FullName}</h2>
            <p className="text-xs text-slate-500">
              {currentUser.Email} • Vai trò: <strong>{currentUser.Role}</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-xl border border-rose-300 bg-rose-50 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
        >
          Đăng xuất tài khoản
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-5">
      {/* Chuyển đổi giữa Form Đăng nhập & Form Đăng ký */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode('LOGIN')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
            mode === 'LOGIN' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          <LogIn className="h-4 w-4" />
          <span>Form Đăng Nhập</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('REGISTER')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
            mode === 'REGISTER' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          <UserPlus className="h-4 w-4" />
          <span>Form Đăng Ký</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'REGISTER' && (
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Họ và tên Dược sĩ / Khách hàng *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn Trung"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
            Địa chỉ Email *
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
            Mật khẩu *
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
        </div>

        {mode === 'REGISTER' && (
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Số điện thoại
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
          <span>{mode === 'LOGIN' ? 'Đăng Nhập Hệ Thống' : 'Đăng Ký Tài Khoản Mới'}</span>
        </button>
      </form>

      {mode === 'LOGIN' && (
        <div className="rounded-xl bg-teal-50 p-3 border border-teal-200 text-xs text-teal-800 space-y-1">
          <div className="font-bold">Tài khoản Demo tạo sẵn trong Seed DB:</div>
          <div>• Email: <code>trung.d18cnpm5@epu.edu.vn</code></div>
          <div>• Mật khẩu: <code>123456</code></div>
        </div>
      )}
    </div>
  );
};
