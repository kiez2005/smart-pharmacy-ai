import React, { useEffect, useState } from 'react';
import { MessageSquareHeart, Send, CheckCircle2, Clock } from 'lucide-react';
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
      toast.error('Không thể tải danh sách liên hệ');
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
      toast.success('Đã gửi phiếu yêu cầu tư vấn tới Dược sĩ!');
      setFullName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
      await loadContacts();
    } catch {
      toast.error('Vui lòng điền đầy đủ thông tin hợp lệ');
    }
  };

  const handleReply = async (contactId: number) => {
    const reply = replyTextMap[contactId]?.trim();
    if (!reply) return;
    try {
      await formsApi.replyContact(contactId, reply);
      toast.success('Đã gửi phản hồi tư vấn của Dược sĩ');
      await loadContacts();
    } catch {
      toast.error('Lỗi khi lưu phản hồi');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* FORM LIÊN HỆ (FORM 7) */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-4"
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <MessageSquareHeart className="h-5 w-5 text-teal-600" />
          <h2 className="text-base font-extrabold text-slate-900">
            Form Liên Hệ & Đặt Câu Hỏi Tư Vấn Dược Sĩ
          </h2>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
            Họ và tên *
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nhập họ và tên của bạn"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Số điện thoại *
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0988..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
            Chủ đề cần tư vấn *
          </label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="VD: Tư vấn liều dùng thuốc kháng sinh / dị ứng thời tiết"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
            Nội dung triệu chứng hoặc câu hỏi chi tiết *
          </label>
          <textarea
            rows={4}
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mô tả triệu chứng, tiền sử dị ứng thuốc để Dược sĩ tư vấn..."
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
        >
          <Send className="h-4 w-4" />
          <span>Gửi Yêu Cầu Tư Vấn</span>
        </button>
      </form>

      {/* DANH SÁCH PHIẾU LIÊN HỆ & PHẢN HỒI CỦA DƯỢC SĨ */}
      <div className="lg:col-span-7 rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-4">
        <h3 className="text-base font-extrabold text-slate-900">
          Danh Sách Yêu Cầu Tư Vấn Từ Khách Hàng ({contacts.length})
        </h3>
        <div className="space-y-3">
          {contacts.map((c) => (
            <div
              key={c.ContactID}
              className="rounded-2xl border border-slate-200 p-4 space-y-2.5 bg-slate-50/50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-slate-900">{c.Subject}</span>
                  <div className="text-xs text-slate-500">
                    Khách hàng: <strong>{c.FullName}</strong> ({c.Phone} - {c.Email})
                  </div>
                </div>
                {c.Status === 'REPLIED' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Đã tư vấn
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200">
                    <Clock className="h-3.5 w-3.5" />
                    Chờ phản hồi
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                {c.Message}
              </p>

              {c.ReplyNote ? (
                <div className="rounded-xl bg-teal-50 p-3 border border-teal-200 text-xs text-teal-900">
                  <strong>Dược sĩ phản hồi:</strong> {c.ReplyNote}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyTextMap[c.ContactID] || ''}
                    onChange={(e) =>
                      setReplyTextMap({ ...replyTextMap, [c.ContactID]: e.target.value })
                    }
                    placeholder="Nhập câu trả lời tư vấn của Dược sĩ..."
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => void handleReply(c.ContactID)}
                    className="rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-700"
                  >
                    Trả lời
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
