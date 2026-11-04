import React, { useEffect, useMemo, useState } from 'react';
import {
  Send,
  CheckCircle2,
  Clock,
  Eye,
  Copy,
  Trash2,
  MessageSquare,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ContactRecord } from '../types/forms';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import {
  ColumnConfig,
  EnterprisePagination,
  EnterpriseToolbar,
} from '../components/common/EnterpriseDataToolbar';

const CONTACT_COLUMNS: ColumnConfig[] = [
  { id: 'ContactID', label: 'Mã phiếu' },
  { id: 'FullName', label: 'Người bệnh / Khách hàng' },
  { id: 'Subject', label: 'Chủ đề tư vấn' },
  { id: 'CreateDate', label: 'Ngày gửi' },
  { id: 'Status', label: 'Trạng thái' },
];

export const ContactPage: React.FC = () => {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const [replyText, setReplyText] = useState<string>('');

  // 11 Chức năng Data Grid
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  // Modal Tạo Phiếu Tư Vấn Mới (Alt+N)
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    FullName: '',
    Email: '',
    Phone: '',
    Subject: '',
    Message: '',
  });

  const loadContacts = async () => {
    setLoading(true);
    try {
      const list = await formsApi.listContacts();
      setContacts(list);
      setSelectedIds([]);
      if (list.length > 0 && !selectedContact) {
        setSelectedContact(list[0]);
        setReplyText(list[0].ReplyNote || '');
      } else if (selectedContact) {
        const updated = list.find((c) => c.ContactID === selectedContact.ContactID);
        if (updated) {
          setSelectedContact(updated);
          setReplyText(updated.ReplyNote || '');
        }
      }
    } catch {
      toast.error('Không thể tải danh sách phiếu tư vấn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await formsApi.createContact(formData);
      toast.success('Đã tiếp nhận phiếu yêu cầu tư vấn mới');
      setShowCreateModal(false);
      setFormData({ FullName: '', Email: '', Phone: '', Subject: '', Message: '' });
      setSelectedContact(created);
      await loadContacts();
    } catch {
      toast.error('Vui lòng kiểm tra lại thông tin liên hệ');
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !replyText.trim()) return;
    try {
      await formsApi.replyContact(selectedContact.ContactID, replyText.trim());
      toast.success('Đã lưu phản hồi chuyên môn của dược sĩ');
      await loadContacts();
    } catch {
      toast.error('Không thể lưu phản hồi');
    }
  };

  const handleDeleteOne = async (c: ContactRecord) => {
    if (!window.confirm(`Xác nhận xóa phiếu tư vấn #${c.ContactID}?`)) return;
    try {
      await enterpriseApi.deleteRecord('contacts', c.ContactID);
      toast.success(`Đã xóa phiếu tư vấn #${c.ContactID}`);
      await loadContacts();
    } catch {
      toast.error('Không thể xóa phiếu tư vấn');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 phiếu tư vấn');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} phiếu tư vấn đã chọn?`)) return;
    try {
      const count = await enterpriseApi.bulkDelete('contacts', selectedIds);
      toast.success(`Đã xóa ${count} phiếu tư vấn`);
      await loadContacts();
    } catch {
      toast.error('Không thể xóa hàng loạt');
    }
  };

  const handleCloneOne = async (c: ContactRecord) => {
    try {
      await enterpriseApi.cloneRecord('contacts', c.ContactID);
      toast.success(`Đã nhân bản phiếu tư vấn #${c.ContactID}`);
      await loadContacts();
    } catch {
      toast.error('Không thể nhân bản phiếu tư vấn');
    }
  };

  const handleBulkClone = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 phiếu để nhân bản');
      return;
    }
    try {
      const count = await enterpriseApi.bulkClone('contacts', selectedIds);
      toast.success(`Đã nhân bản ${count} phiếu tư vấn`);
      await loadContacts();
    } catch {
      toast.error('Không thể nhân bản hàng loạt');
    }
  };

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const matchStatus = statusFilter === 'ALL' || c.Status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchQuery =
        !q ||
        c.FullName.toLowerCase().includes(q) ||
        c.Subject.toLowerCase().includes(q) ||
        c.Phone.toLowerCase().includes(q) ||
        c.Message.toLowerCase().includes(q);
      return matchStatus && matchQuery;
    });
  }, [contacts, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedContacts = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="contacts"
        title="Trung Tâm Tư Vấn Dược Sĩ & Chăm Sóc Khách Hàng (Clinical Consultations)"
        subtitle="Tiếp nhận câu hỏi liều dùng, phản hồi chuyên môn (đầy đủ 11 chức năng CRUD, Nhân bản, Import/Export Excel/JSON/XML, Ẩn/Hiện cột)."
        createLabel="Tạo Phiếu tư vấn (Alt+N)"
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo tên bệnh nhân, SĐT, chủ đề hoặc câu hỏi... (Alt + F)"
        columns={CONTACT_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={(colId) =>
          setVisibleColumns((prev) => ({
            ...prev,
            [colId]: prev[colId] === false ? true : false,
          }))
        }
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onOpenCreate={() => setShowCreateModal(true)}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => void handleBulkClone()}
        onViewSelected={() => {
          if (selectedIds.length === 1) {
            const found = contacts.find((c) => c.ContactID === selectedIds[0]);
            if (found) {
              setSelectedContact(found);
              setReplyText(found.ReplyNote || '');
            }
          }
        }}
        onCloneSelected={() => {
          if (selectedIds.length === 1) {
            const found = contacts.find((c) => c.ContactID === selectedIds[0]);
            if (found) void handleCloneOne(found);
          }
        }}
        onReload={loadContacts}
        extraFilters={
          <div className="flex items-center gap-1.5">
            {[
              { id: 'ALL', label: `Tất cả (${contacts.length})` },
              {
                id: 'NEW',
                label: `Chờ tư vấn (${contacts.filter((c) => c.Status === 'NEW').length})`,
              },
              {
                id: 'REPLIED',
                label: `Đã phản hồi (${contacts.filter((c) => c.Status === 'REPLIED').length})`,
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setStatusFilter(t.id);
                  setPage(1);
                }}
                className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                  statusFilter === t.id
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Bảng Danh sách Phiếu Tư vấn chuẩn 11 chức năng */}
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={
                        pagedContacts.length > 0 &&
                        pagedContacts.every((c) => selectedIds.includes(c.ContactID))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(pagedContacts.map((c) => c.ContactID));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                    />
                  </th>
                  {visibleColumns.ContactID !== false && <th className="py-2.5 px-3">Mã phiếu</th>}
                  {visibleColumns.FullName !== false && (
                    <th className="py-2.5 px-3">Người bệnh / Liên hệ</th>
                  )}
                  {visibleColumns.Subject !== false && (
                    <th className="py-2.5 px-3">Chủ đề cần tư vấn</th>
                  )}
                  {visibleColumns.CreateDate !== false && (
                    <th className="py-2.5 px-3">Ngày gửi</th>
                  )}
                  {visibleColumns.Status !== false && (
                    <th className="py-2.5 px-3 text-right">Trạng thái</th>
                  )}
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-400">
                      Đang tải danh sách phiếu tư vấn...
                    </td>
                  </tr>
                ) : (
                  pagedContacts.map((c) => {
                    const isSelected = selectedContact?.ContactID === c.ContactID;
                    return (
                      <tr
                        key={c.ContactID}
                        onClick={() => {
                          setSelectedContact(c);
                          setReplyText(c.ReplyNote || '');
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-100/90' : 'hover:bg-zinc-50'
                        }`}
                      >
                        <td
                          className="py-3 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.ContactID)}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(c.ContactID)
                                  ? prev.filter((id) => id !== c.ContactID)
                                  : [...prev, c.ContactID]
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                          />
                        </td>
                        {visibleColumns.ContactID !== false && (
                          <td className="py-3 px-3 font-mono font-semibold text-zinc-600">
                            #TV-{String(c.ContactID).padStart(3, '0')}
                          </td>
                        )}
                        {visibleColumns.FullName !== false && (
                          <td className="py-3 px-3">
                            <div className="font-semibold text-zinc-900">{c.FullName}</div>
                            <div className="text-[11px] text-zinc-500">{c.Phone}</div>
                          </td>
                        )}
                        {visibleColumns.Subject !== false && (
                          <td className="py-3 px-3">
                            <div className="font-medium text-zinc-900 line-clamp-1">
                              {c.Subject}
                            </div>
                            <div className="text-[11px] text-zinc-500 line-clamp-1">
                              {c.Message}
                            </div>
                          </td>
                        )}
                        {visibleColumns.CreateDate !== false && (
                          <td className="py-3 px-3 text-zinc-500 tabular-nums">
                            {new Date(c.CreateDate).toLocaleDateString('vi-VN')}
                          </td>
                        )}
                        {visibleColumns.Status !== false && (
                          <td className="py-3 px-3 text-right">
                            {c.Status === 'REPLIED' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                                <CheckCircle2 className="h-3 w-3" />
                                Đã phản hồi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200/60">
                                <Clock className="h-3 w-3" />
                                Chờ xử lý
                              </span>
                            )}
                          </td>
                        )}
                        <td
                          className="py-3 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedContact(c);
                                setReplyText(c.ReplyNote || '');
                              }}
                              title="Xem & Phản hồi (Alt+V)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCloneOne(c)}
                              title="Nhân bản (Alt+C)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteOne(c)}
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

        {/* Chi tiết & Form Dược sĩ Phản hồi */}
        <div className="lg:col-span-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs">
          {!selectedContact ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              Chọn một phiếu tư vấn bên trái để xem câu hỏi và gửi phản hồi chuyên môn
            </div>
          ) : (
            <form onSubmit={handleReply} className="space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-zinc-900" />
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Chi tiết Tư vấn #TV-{String(selectedContact.ContactID).padStart(3, '0')}
                  </h2>
                </div>
              </div>

              <div className="rounded-md bg-zinc-50 p-3 border border-zinc-200/70 space-y-1">
                <div>
                  <span className="text-zinc-500">Người gửi: </span>
                  <strong className="text-zinc-900">{selectedContact.FullName}</strong> (
                  {selectedContact.Phone} · {selectedContact.Email})
                </div>
                <div>
                  <span className="text-zinc-500">Chủ đề: </span>
                  <strong className="text-zinc-900">{selectedContact.Subject}</strong>
                </div>
              </div>

              <div>
                <div className="font-medium text-zinc-700 mb-1">Nội dung câu hỏi của bệnh nhân:</div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 text-zinc-800 leading-relaxed">
                  {selectedContact.Message}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-teal-800 mb-1">
                  Phản hồi chuyên môn của Dược sĩ lâm sàng:
                </label>
                <textarea
                  rows={4}
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Nhập hướng dẫn liều dùng, thời điểm uống thuốc và lưu ý chống chỉ định..."
                  className="w-full rounded-md border border-zinc-300 p-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full h-9 rounded-md bg-zinc-900 text-xs font-medium text-white hover:bg-zinc-800 inline-flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Lưu & Gửi Phản Hồi Tư Vấn</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Modal Tạo Phiếu Tư Vấn Mới (Alt+N) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Tạo Phiếu Yêu Cầu Tư Vấn Dược Lâm Sàng
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Họ và tên bệnh nhân *</label>
                <input
                  type="text"
                  required
                  value={formData.FullName}
                  onChange={(e) => setFormData({ ...formData, FullName: e.target.value })}
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    value={formData.Phone}
                    onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.Email}
                    onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Chủ đề cần tư vấn *</label>
                <input
                  type="text"
                  required
                  value={formData.Subject}
                  onChange={(e) => setFormData({ ...formData, Subject: e.target.value })}
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Nội dung câu hỏi *</label>
                <textarea
                  rows={3}
                  required
                  value={formData.Message}
                  onChange={(e) => setFormData({ ...formData, Message: e.target.value })}
                  className="w-full rounded border border-zinc-300 p-2.5"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 bg-zinc-50">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="h-8 rounded border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-8 rounded bg-zinc-900 px-4 text-xs font-medium text-white"
              >
                Lưu Phiếu tư vấn
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
