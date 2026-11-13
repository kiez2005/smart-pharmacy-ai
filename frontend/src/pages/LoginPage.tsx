import React, { FormEvent, useState } from 'react';
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { formsApi } from '../services/forms.api';
import { UserProfile } from '../types/forms';

interface LoginPageProps {
  sessionExpired?: boolean;
  onAuthSuccess: (user: UserProfile, token: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ sessionExpired = false, onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user, token } = await formsApi.login(email.trim(), password);
      onAuthSuccess(user, token);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể đăng nhập. Vui lòng kiểm tra kết nối và thử lại.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-tight text-slate-900">PharmaCore ERP</p>
            <p className="text-sm font-medium text-teal-700">Quản trị nhà thuốc · Chuẩn GPP</p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900">Đăng nhập hệ thống</h1>
            <p className="mt-1 text-sm text-slate-500">
              Dùng tài khoản nhân sự đã được quản trị viên kích hoạt.
            </p>
          </div>

          {sessionExpired && (
            <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
              Phiên làm việc đã hết hạn. Đăng nhập lại để tiếp tục.
            </div>
          )}

          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Email công vụ
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ten@nhathuoc.vn"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Mật khẩu
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {loading ? 'Đang xác thực…' : 'Đăng nhập'}
            </button>
          </form>
        </section>

        <p className="mt-5 text-center text-xs text-slate-500">
          Chỉ nhân sự được cấp quyền mới truy cập được dữ liệu vận hành.
        </p>
      </div>
    </main>
  );
};
