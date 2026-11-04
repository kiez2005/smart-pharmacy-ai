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
  Sparkles,
  ShieldCheck,
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

const CLINICAL_REPLY_TEMPLATES = [
  {
    label: 'Hướng dẫn uống Kháng sinh',
    text: 'Chào anh/chị, thuốc kháng sinh cần uống sau bữa ăn 30 phút và duy trì đủ liều từ 5-7 ngày theo chỉ định bác sĩ. Tuyệt đối không tự ý ngưng thuốc sớm dù đã hết triệu chứng để tránh kháng thuốc.',
  },
  {
    label: 'Lưu ý thuốc Dạ dày (PPI)',
    text: 'Chào anh/chị, nhóm thuốc ức chế axit dạ dày (Esomeprazole/Omeprazole) đạt hiệu quả tối ưu khi uống trước bữa ăn sáng 30-60 phút. Hạn chế đồ chua cay, cà phê và rượu bia trong đợt điều trị.',
  },
  {
    label: 'Xử trí quên liều Huyết áp',
    text: 'Chào bác, nếu quên uống thuốc huyết áp trong ngày thì uống bổ sung ngay khi nhớ ra. Tuy nhiên nếu đã gần tới giờ uống liều kế tiếp thì bỏ qua liều quên, tuyệt đối không uống gấp đôi liều.',
  },
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
      if (selectedContact) {
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
      setReplyText('');
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
      toast.success('Đã lưu phản hồi chuyên môn của dược sĩ lâm sàng');
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
      if (selectedContact?.ContactID === c.ContactID) setSelectedContact(null);
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

  const pendingCount = useMemo(
    () => contacts.filter((c) => c.Status === 'NEW').length,
    [contacts]
  );
  const repliedCount = useMemo(
    () => contacts.filter((c) => c.Status === 'REPLIED').length,
    [contacts]
  );

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="contacts"
        title="Trung Tâm Tư Vấn Dược Sĩ & Chăm Sóc Khách Hàng (Clinical Consultations)"
        subtitle="Tiếp nhận câu hỏi liều dùng, phản hồi chuyên môn bằng mẫu lâm sàng nhanh (đầy đủ 11 chức năng CRUD, Nhân bản, Import/Export)."
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
                label: `Chờ tư vấn (${pendingCount})`,
              },
              {
                id: 'REPLIED',
                label: `Đã phản hồi (${repliedCount})`,
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setStatusFilter(t.id);
                  setPage(1);
                }}
                className={`h-8.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  statusFilter === t.id
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {/* 4 Thẻ KPI Tư vấn Dược lâm sàng */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng phiếu yêu cầu tư vấn</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <MessageSquare className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {contacts.length} phiếu
          </div>
          <div className="mt-1 text-xs text-slate-500">Từ ứng dụng di động & quầy nhà thuốc</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Đã phản hồi chuyên môn</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
            {repliedCount} phiếu
          </div>
          <div className="mt-1 text-xs text-slate-500">Dược sĩ đại học trực tiếp giải đáp</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Đang chờ xử lý</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {pendingCount} phiếu
          </div>
          <div className="mt-1 text-xs text-slate-500">Ưu tiên tư vấn đơn thuốc kháng sinh</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Cam kết thời gian phản hồi</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
            &lt; 15 phút
          </div>
          <div className="mt-1 text-xs text-slate-500">Tiêu chuẩn thực hành tốt nhà thuốc GPP</div>
        </div>
      </div>

      {/* BẢNG PHIẾU TƯ VẤN FULL-WIDTH 100% */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-9">
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
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                  />
                </th>
                {visibleColumns.ContactID !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Mã phiếu</th>
                )}
                {visibleColumns.FullName !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Người bệnh / Liên hệ</th>
                )}
                {visibleColumns.Subject !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Chủ đề & Nội dung câu hỏi</th>
                )}
                {visibleColumns.CreateDate !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Ngày gửi</th>
                )}
                {visibleColumns.Status !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Trạng thái</th>
                )}
                <th className="py-3 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Đang tải danh sách phiếu tư vấn...
                  </td>
                </tr>
              ) : (
                pagedContacts.map((c) => (
                  <tr
                    key={c.ContactID}
                    onClick={() => {
                      setSelectedContact(c);
                      setReplyText(c.ReplyNote || '');
                    }}
                    className="cursor-pointer transition-colors hover:bg-slate-50/80"
                  >
                    <td
                      className="py-3 px-4"
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
                        className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                      />
                    </td>
                    {visibleColumns.ContactID !== false && (
                      <td className="py-3 px-4 font-mono text-xs font-bold text-teal-700 whitespace-nowrap">
                        #TV-{String(c.ContactID).padStart(3, '0')}
                      </td>
                    )}
                    {visibleColumns.FullName !== false && (
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{c.FullName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{c.Phone}</div>
                      </td>
                    )}
                    {visibleColumns.Subject !== false && (
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-semibold text-slate-900 line-clamp-1">
                          {c.Subject}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                          {c.Message}
                        </div>
                      </td>
                    )}
                    {visibleColumns.CreateDate !== false && (
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {new Date(c.CreateDate).toLocaleDateString('vi-VN')}
                      </td>
                    )}
                    {visibleColumns.Status !== false && (
                      <td className="py-3 px-4 whitespace-nowrap">
                        {c.Status === 'REPLIED' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/70">
                            <CheckCircle2 className="h-3 w-3" />
                            Đã phản hồi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200/70">
                            <Clock className="h-3 w-3" />
                            Chờ dược sĩ
                          </span>
                        )}
                      </td>
                    )}
                    <td
                      className="py-3 px-4 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContact(c);
                            setReplyText(c.ReplyNote || '');
                          }}
                          title="Xem & Phản hồi chuyên môn (Alt+V)"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCloneOne(c)}
                          title="Nhân bản (Alt+C)"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteOne(c)}
                          title="Xóa (Alt+H)"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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

      {/* SLIDE-OVER RIGHT DRAWER: Chi tiết Câu hỏi & Phản hồi Dược sĩ Lâm sàng */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <form
            onSubmit={handleReply}
            className="w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70 sticky top-0 z-10">
                <div>
                  <span className="font-mono text-xs font-bold text-teal-700">
                    #TV-{String(selectedContact.ContactID).padStart(3, '0')}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Phiếu Tư vấn Dược Lâm Sàng
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Người bệnh:</span>
                    <strong className="text-slate-900">{selectedContact.FullName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Số điện thoại / Email:</span>
                    <span className="font-mono text-slate-800">
                      {selectedContact.Phone} · {selectedContact.Email}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Chủ đề:</span>
                    <strong className="text-teal-700">{selectedContact.Subject}</strong>
                  </div>
                </div>

                <div>
                  <div className="font-bold text-slate-800 mb-1.5">
                    Nội dung câu hỏi triệu chứng / liều dùng:
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-slate-800 leading-relaxed">
                    {selectedContact.Message}
                  </div>
                </div>

                {/* Mẫu Phản hồi Lâm sàng Nhanh 1-Click */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-teal-800">
                    <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                    <span>Mẫu Phản hồi Chuyên môn Nhanh (1-Click):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CLINICAL_REPLY_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => setReplyText(tpl.text)}
                        className="rounded-lg border border-teal-200 bg-teal-50/70 px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-600 hover:text-white transition-colors"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Nội dung tư vấn của Dược sĩ phụ trách (DS. Nguyễn Văn Trung):
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Nhập hướng dẫn liều dùng, thời điểm uống thuốc và lưu ý chống chỉ định..."
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:border-teal-600 focus:outline-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-end gap-2 sticky bottom-0">
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 shadow-xs"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Lưu & Gửi Phản Hồi Tư Vấn</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tạo Phiếu Tư Vấn Mới (Alt+N) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-bold text-slate-900">
                Tạo Phiếu Yêu Cầu Tư Vấn Dược Lâm Sàng
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Họ và tên bệnh nhân *
                </label>
                <input
                  type="text"
                  required
                  value={formData.FullName}
                  onChange={(e) => setFormData({ ...formData, FullName: e.target.value })}
                  className="w-full h-8.5 rounded-lg border border-slate-300 px-2.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    value={formData.Phone}
                    onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                    className="w-full h-8.5 rounded-lg border border-slate-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.Email}
                    onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                    className="w-full h-8.5 rounded-lg border border-slate-300 px-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chủ đề cần tư vấn *
                </label>
                <input
                  type="text"
                  required
                  value={formData.Subject}
                  onChange={(e) => setFormData({ ...formData, Subject: e.target.value })}
                  className="w-full h-8.5 rounded-lg border border-slate-300 px-2.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nội dung câu hỏi *
                </label>
                <textarea
                  rows={3}
                  required
                  value={formData.Message}
                  onChange={(e) => setFormData({ ...formData, Message: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2.5"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-8 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700"
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
