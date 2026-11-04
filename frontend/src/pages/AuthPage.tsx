import React, { useState } from 'react';
import { LogOut, User } from 'lucide-react';
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
        toast.success(`Đã đăng nhập: ${res.user.FullName}`);
        onAuthSuccess(res.user, res.token);
      } else {
        const res = await formsApi.register({
          FullName: fullName,
          Email: email,
          Password: password,
          Phone: phone,
        });
        toast.success(`Đã khởi tạo tài khoản: ${res.user.FullName}`);
        onAuthSuccess(res.user, res.token);
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

  if (currentUser) {
    return (
      <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 space-y-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{currentUser.FullName}</h2>
            <p className="text-xs text-zinc-500">
              {currentUser.Email} • Phân quyền: <span className="font-medium text-zinc-700">{currentUser.Role}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Đăng xuất phiên làm việc</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">
          {mode === 'LOGIN' ? 'Đăng nhập hệ thống' : 'Tạo tài khoản nhân sự mới'}
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          {mode === 'LOGIN'
            ? 'Nhập thông tin tài khoản dược sĩ để truy cập'
            : 'Đăng ký tài khoản mới vào hệ thống quản trị nhà thuốc'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => setMode('LOGIN')}
          className={`rounded py-1.5 text-xs font-medium transition-colors ${
            mode === 'LOGIN' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
          }`}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => setMode('REGISTER')}
          className={`rounded py-1.5 text-xs font-medium transition-colors ${
            mode === 'REGISTER' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
          }`}
        >
          Đăng ký tài khoản
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === 'REGISTER' && (
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Họ và tên <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Email công vụ <span className="text-rose-500">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Mật khẩu <span className="text-rose-500">*</span>
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
          />
        </div>

        {mode === 'REGISTER' && (
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Số điện thoại
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 rounded-md bg-zinc-900 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {mode === 'LOGIN' ? 'Tiếp tục' : 'Hoàn tất đăng ký'}
        </button>
      </form>
    </div>
  );
};
