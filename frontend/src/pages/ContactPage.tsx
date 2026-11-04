import React, { useEffect, useState } from 'react';
import { Send, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ContactRecord } from '../types/forms';
import { formsApi } from '../services/forms.api';

export const ContactPage: React.FC = () => {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyTextMap, setReplyTextMap] = useState<Record<number, string>>({});

  const loadContacts = async () => {
    try {
      const list = await formsApi.listContacts();
      setContacts(list);
    } catch {
      toast.error('Không thể tải danh sách phiếu tư vấn');
    }
  };

  useEffect(() => {
    void loadContacts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await formsApi.createContact({
        FullName: fullName,
        Email: email,
        Phone: phone,
        Subject: subject,
        Message: message,
      });
      toast.success('Đã tiếp nhận phiếu yêu cầu tư vấn');
      setFullName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
      await loadContacts();
    } catch {
      toast.error('Vui lòng kiểm tra lại thông tin liên hệ');
    }
  };

  const handleReply = async (contactId: number) => {
    const reply = replyTextMap[contactId]?.trim();
    if (!reply) return;
    try {
      await formsApi.replyContact(contactId, reply);
      toast.success('Đã cập nhật phản hồi chuyên môn');
      await loadContacts();
    } catch {
      toast.error('Không thể lưu phản hồi');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
          Chăm sóc khách hàng & Tư vấn dược lâm sàng
        </h1>
        <p className="text-[13px] text-zinc-500 mt-0.5">
          Tiếp nhận câu hỏi của bệnh nhân và quản lý lịch sử tư vấn sử dụng thuốc an toàn
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 space-y-4"
        >
          <h2 className="text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            Tạo phiếu yêu cầu tư vấn mới
          </h2>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Họ và tên khách hàng <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nhập họ và tên"
              className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domain.com"
                className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Số điện thoại <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0988..."
                className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] tabular-nums focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Nội dung cần tư vấn <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ví dụ: Tư vấn tương tác thuốc kháng sinh"
              className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Mô tả chi tiết triệu chứng / câu hỏi <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Nhập chi tiết tình trạng sức khỏe hoặc thuốc đang sử dụng..."
              className="w-full rounded-md border border-zinc-200 p-3 text-[13px] focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full inline-flex h-9 items-center justify-center gap-2 rounded-md bg-zinc-900 text-[13px] font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Gửi yêu cầu tư vấn</span>
          </button>
        </form>

        <div className="lg:col-span-7 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 className="text-sm font-semibold text-zinc-900">Danh sách phiếu tư vấn</h3>
            <span className="text-xs text-zinc-400 tabular-nums">{contacts.length} yêu cầu</span>
          </div>

          <div className="space-y-3">
            {contacts.map((c) => (
              <div
                key={c.ContactID}
                className="rounded-lg border border-zinc-200 p-4 space-y-2.5 bg-white"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-[13px] text-zinc-900">{c.Subject}</span>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {c.FullName} • <span className="tabular-nums">{c.Phone}</span> • {c.Email}
                    </div>
                  </div>
                  {c.Status === 'REPLIED' ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Đã phản hồi
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <Clock className="h-3 w-3" />
                      Chờ xử lý
                    </span>
                  )}
                </div>

                <p className="text-[13px] text-zinc-700 bg-zinc-50 p-3 rounded-md border border-zinc-200/60">
                  {c.Message}
                </p>

                {c.ReplyNote ? (
                  <div className="rounded-md bg-teal-50/60 p-3 border border-teal-200/70 text-[13px] text-teal-950">
                    <span className="font-medium">Phản hồi chuyên môn:</span> {c.ReplyNote}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyTextMap[c.ContactID] || ''}
                      onChange={(e) =>
                        setReplyTextMap({ ...replyTextMap, [c.ContactID]: e.target.value })
                      }
                      placeholder="Nhập nội dung tư vấn..."
                      className="flex-1 h-8 rounded-md border border-zinc-200 px-3 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleReply(c.ContactID)}
                      className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Gửi phản hồi
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
