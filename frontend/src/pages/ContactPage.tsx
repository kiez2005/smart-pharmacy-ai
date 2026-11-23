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
  Mail,
  MailCheck,
  AlertTriangle,
  Image as ImageIcon,
  Maximize2,
  ExternalLink,
  ScanLine,
  BookOpen,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ContactAiDraftResponse,
  ContactRecord,
  MailConfigStatus,
} from '../types/forms';
import { extractAiErrorMessage } from '../services/ai.api';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import {
  ColumnConfig,
  EnterprisePagination,
  EnterpriseToolbar,
} from '../components/common/EnterpriseDataToolbar';
import { ModalPortal } from '../components/common/ModalPortal';

const INLINE_RX_KEY_RE = /\brx-[a-f0-9]{32}\.(?:jpg|png|webp)\b/i;

function getEffectiveAttachmentKey(c: ContactRecord | null | undefined): string | null {
  if (!c) return null;
  if (c.AttachmentFileKey) return c.AttachmentFileKey;
  const m = String(c.Message || '').match(INLINE_RX_KEY_RE);
  return m ? m[0] : null;
}

function isPlaceholderCustomerEmail(email: string | null | undefined): boolean {
  const low = String(email || '').trim().toLowerCase();
  return !low || !low.includes('@') || ['@pharmacore.vn', '@test.local', '@example.com'].some((d) => low.endsWith(d));
}

interface ContactPageProps {
  onScanAttachmentWithOcr?: (fileKey: string) => void;
}

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

export const ContactPage: React.FC<ContactPageProps> = ({ onScanAttachmentWithOcr }) => {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [sendGmail, setSendGmail] = useState<boolean>(true);
  const [submittingReply, setSubmittingReply] = useState<boolean>(false);

  // Cấu hình & Kiểm tra Gmail SMTP thật
  const [mailStatus, setMailStatus] = useState<MailConfigStatus | null>(null);
  const [verifyingMail, setVerifyingMail] = useState<boolean>(false);
  const [testMailTarget, setTestMailTarget] = useState<string>('');
  const [sendingTestMail, setSendingTestMail] = useState<boolean>(false);

  // Ảnh đính kèm bảo mật (tải qua JWT Blob URL)
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState<boolean>(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [zoomAttachment, setZoomAttachment] = useState<boolean>(false);

  // AI Gợi ý trả lời lâm sàng
  const [aiStyle, setAiStyle] = useState<'STANDARD' | 'CONCISE' | 'FOLLOWUP_CARE'>('STANDARD');
  const [draftingAi, setDraftingAi] = useState<boolean>(false);
  const [aiDraftMeta, setAiDraftMeta] = useState<ContactAiDraftResponse | null>(null);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);

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

  const openContactDrawer = (c: ContactRecord) => {
    setSelectedContact(c);
    setReplyText(c.ReplyNote || '');
    setRecipientEmail(c.Email || '');
    setSendGmail(!isPlaceholderCustomerEmail(c.Email));
    setAiDraftMeta(null);
    setAiDraftError(null);
    setZoomAttachment(false);
  };

  const loadMailStatus = async (verify = false) => {
    if (verify) setVerifyingMail(true);
    try {
      const st = await formsApi.getContactMailStatus(verify);
      setMailStatus(st);
      if (verify) {
        if (st.liveVerified) toast.success(st.verifyMessage || 'Kết nối Gmail SMTP thành công');
        else toast.warning(st.verifyMessage || 'Chưa kết nối được Gmail SMTP');
      }
    } catch {
      // ignore initial status fetch failure
    } finally {
      if (verify) setVerifyingMail(false);
    }
  };

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
          setRecipientEmail(updated.Email || '');
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
    void loadMailStatus(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAttachmentKey = getEffectiveAttachmentKey(selectedContact);

  useEffect(() => {
    if (!activeAttachmentKey) {
      setAttachmentUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setAttachmentError(null);
      setAttachmentLoading(false);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setAttachmentLoading(true);
    setAttachmentError(null);

    formsApi
      .fetchPrescriptionImageBlobUrl(activeAttachmentKey)
      .then((url) => {
        createdUrl = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
        } else {
          setAttachmentUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAttachmentUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setAttachmentError(
            `Không tải được ảnh (${activeAttachmentKey}). Tệp có thể đã quá hạn lưu trữ hoặc không tồn tại.`
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAttachmentLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [activeAttachmentKey]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await formsApi.createContact(formData);
      toast.success('Đã tiếp nhận phiếu yêu cầu tư vấn mới');
      setShowCreateModal(false);
      setFormData({ FullName: '', Email: '', Phone: '', Subject: '', Message: '' });
      openContactDrawer(created);
      await loadContacts();
    } catch {
      toast.error('Vui lòng kiểm tra lại thông tin liên hệ');
    }
  };

  const handleAiDraftReply = async () => {
    if (!selectedContact) return;
    setDraftingAi(true);
    setAiDraftError(null);
    try {
      const draft = await formsApi.draftContactAiReply(selectedContact.ContactID, {
        style: aiStyle,
        includeAttachmentOcr: Boolean(activeAttachmentKey),
      });
      setAiDraftMeta(draft);
      setReplyText(draft.draftReply);
      toast.success(
        `AI Trợ lý Lâm sàng đã soạn xong bản nháp${draft.detectedRxSummary ? ' kèm đọc ảnh toa thuốc' : ''}! Vui lòng rà soát trước khi gửi.`
      );
    } catch (err) {
      const msg = extractAiErrorMessage(err, 'Không thể tạo gợi ý AI lúc này');
      setAiDraftError(msg);
      toast.error(msg);
    } finally {
      setDraftingAi(false);
    }
  };

  const handleSendTestMail = async () => {
    setSendingTestMail(true);
    try {
      const res = await formsApi.sendContactTestMail(testMailTarget.trim() || undefined);
      toast.success(res.message);
    } catch (err) {
      toast.error(extractAiErrorMessage(err, 'Gửi email thử nghiệm thất bại'));
    } finally {
      setSendingTestMail(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !replyText.trim()) return;
    const trimmedEmail = recipientEmail.trim();
    if (sendGmail && isPlaceholderCustomerEmail(trimmedEmail)) {
      toast.warning(
        'Phiếu đang dùng email placeholder nội bộ. Hãy nhập Gmail thật của khách hoặc tắt tùy chọn gửi Gmail.'
      );
      return;
    }

    setSubmittingReply(true);
    try {
      const result = await formsApi.replyContact(selectedContact.ContactID, {
        ReplyNote: replyText.trim(),
        sendEmail: sendGmail,
        ...(trimmedEmail ? { RecipientEmail: trimmedEmail } : {}),
      });
      if (result.mailResult?.status === 'SENT') {
        toast.success(result.message || `Đã gửi Gmail thật tới ${result.mailResult.toEmail}`);
      } else if (result.mailResult?.status === 'FAILED' || result.mailResult?.status === 'SKIPPED_NOT_CONFIGURED') {
        toast.warning(result.message || 'Đã lưu phản hồi nhưng chưa gửi được Gmail');
      } else {
        toast.success(result.message || 'Đã lưu phản hồi chuyên môn của dược sĩ lâm sàng');
      }
      await loadContacts();
    } catch (err) {
      toast.error(extractAiErrorMessage(err, 'Không thể lưu hoặc gửi phản hồi'));
    } finally {
      setSubmittingReply(false);
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
        title="Trung Tâm Tư Vấn Dược Sĩ & Chăm Sóc Khách Hàng"
        subtitle="Tiếp nhận câu hỏi liều dùng, xem ảnh toa thuốc đính kèm, soạn gợi ý bằng AI và gửi phản hồi qua Email cho bệnh nhân."
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
            if (found) openContactDrawer(found);
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
                className={`h-9 rounded-lg px-3.5 text-xs font-semibold transition-all shadow-sm ${
                  statusFilter === t.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Thanh Trạng thái Kết nối Gmail SMTP Thật */}
      {mailStatus && (
        <div
          className={`rounded-xl border px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs ${
            mailStatus.configured
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
              : 'border-amber-200 bg-amber-50/80 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {mailStatus.configured ? (
              <MailCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              {mailStatus.configured ? (
                <>
                  <div className="font-bold">
                    Dịch vụ Email phản hồi khách hàng đã kết nối ({mailStatus.senderEmail})
                  </div>
                  <div className="text-[11px] text-emerald-800/80 mt-0.5">
                    {mailStatus.verifyMessage || 'Khi dược sĩ bấm phản hồi, hệ thống tự động gửi email tư vấn tới hộp thư khách hàng.'}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-bold">
                    Chế độ lưu phản hồi nội bộ (Chưa bật cấu hình gửi Email tự động)
                  </div>
                  <div className="text-[11px] text-amber-900/80 mt-0.5">
                    Phản hồi của Dược sĩ được lưu đầy đủ trên hệ thống; có thể bật tài khoản Gmail doanh nghiệp khi cần gửi thư tự động cho khách hàng.
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={verifyingMail}
              onClick={() => void loadMailStatus(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${verifyingMail ? 'animate-spin' : ''}`} />
              <span>Kiểm tra kết nối</span>
            </button>
            {mailStatus.configured && (
              <div className="flex items-center gap-1.5">
                <input
                  type="email"
                  value={testMailTarget}
                  onChange={(e) => setTestMailTarget(e.target.value)}
                  placeholder={mailStatus.senderEmail || 'Gmail nhận thử...'}
                  className="h-8 w-44 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={sendingTestMail}
                  onClick={() => void handleSendTestMail()}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-teal-600 px-3 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>{sendingTestMail ? 'Đang gửi...' : 'Gửi thử Gmail'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
                pagedContacts.map((c) => {
                  const rowFileKey = getEffectiveAttachmentKey(c);
                  return (
                  <tr
                    key={c.ContactID}
                    onClick={() => openContactDrawer(c)}
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900 line-clamp-1">
                            {c.Subject}
                          </span>
                          {rowFileKey && (
                            <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200/70 shrink-0">
                              <ImageIcon className="h-3 w-3" />
                              Có ảnh đính kèm
                            </span>
                          )}
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
                        <div className="flex flex-col items-start gap-1">
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
                          {c.ReplyEmailStatus === 'SENT' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700">
                              <MailCheck className="h-3 w-3" /> Đã gửi Gmail
                            </span>
                          )}
                          {c.ReplyEmailStatus === 'FAILED' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                              <AlertTriangle className="h-3 w-3" /> Lỗi gửi mail
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    <td
                      className="py-3 px-4 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => openContactDrawer(c)}
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

      {/* SLIDE-OVER RIGHT DRAWER: Chi tiết Câu hỏi, Ảnh đính kèm, AI Gợi ý & Gửi Gmail thật */}
      {selectedContact && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex justify-end bg-slate-950/60 backdrop-blur-xs">
            <form
              onSubmit={handleReply}
              className="w-full max-w-full sm:max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
            >
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/70 sticky top-0 z-10 shrink-0">
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

              <div className="p-4 sm:p-6 space-y-4 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Người bệnh:</span>
                    <strong className="text-slate-900">{selectedContact.FullName}</strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">SĐT / Email gốc:</span>
                    <span className="font-mono text-slate-800 text-right break-all">
                      {selectedContact.Phone} · {selectedContact.Email}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Chủ đề:</span>
                    <strong className="text-teal-700 text-right">{selectedContact.Subject}</strong>
                  </div>
                </div>

                <div>
                  <div className="font-bold text-slate-800 mb-1.5">
                    Nội dung câu hỏi triệu chứng / liều dùng:
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                    {selectedContact.Message}
                  </div>
                </div>

                {/* KHỐI ẢNH ĐÍNH KÈM BẢO MẬT (TẢI QUA JWT BLOB URL) */}
                {activeAttachmentKey && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                        <ImageIcon className="h-4 w-4 text-indigo-600" />
                        <span>Ảnh đơn thuốc / triệu chứng đính kèm</span>
                      </div>
                      <span className="text-[10px] font-semibold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                        Đơn thuốc đính kèm
                      </span>
                    </div>

                    {attachmentLoading ? (
                      <div className="h-36 rounded-lg bg-white/80 border border-indigo-100 animate-pulse flex items-center justify-center text-indigo-700 font-medium">
                        Đang giải mã &amp; tải ảnh bảo mật...
                      </div>
                    ) : attachmentUrl ? (
                      <div className="space-y-2.5">
                        <div className="relative rounded-lg border border-indigo-200 bg-white p-2 overflow-hidden">
                          <img
                            src={attachmentUrl}
                            alt="Ảnh đính kèm của khách hàng"
                            onClick={() => setZoomAttachment(true)}
                            className="max-h-56 w-full object-contain rounded cursor-zoom-in"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setZoomAttachment(true)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                            <span>Phóng to</span>
                          </button>
                          <a
                            href={attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Mở tab mới</span>
                          </a>
                          {onScanAttachmentWithOcr && (
                            <button
                              type="button"
                              onClick={() => onScanAttachmentWithOcr(activeAttachmentKey)}
                              className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-[11px] font-semibold text-white hover:bg-indigo-700 shadow-2xs"
                            >
                              <ScanLine className="h-3.5 w-3.5" />
                              <span>Quét toa sang AI OCR</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 text-[11px] flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{attachmentError || 'Không thể hiển thị ảnh đính kèm.'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* AI GỢI Ý SOẠN PHẢN HỒI LÂM SÀNG (HUMAN-IN-THE-LOOP) */}
                <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-emerald-50/50 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 font-bold text-teal-900">
                      <Sparkles className="h-4 w-4 text-teal-600" />
                      <span>AI Gợi ý Trả lời Lâm sàng Nhanh</span>
                    </div>
                    <button
                      type="button"
                      disabled={draftingAi}
                      onClick={() => void handleAiDraftReply()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50 shadow-2xs"
                    >
                      <Sparkles className={`h-3.5 w-3.5 ${draftingAi ? 'animate-spin' : ''}`} />
                      <span>{draftingAi ? 'AI đang soạn gợi ý...' : 'AI Soạn Gợi Ý'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'STANDARD' as const, label: 'Đầy đủ chuyên môn & HDSD' },
                      { id: 'CONCISE' as const, label: 'Ngắn gọn gửi Gmail' },
                      { id: 'FOLLOWUP_CARE' as const, label: 'Hỏi thêm triệu chứng / tái khám' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAiStyle(opt.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition-colors ${
                          aiStyle === opt.id
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-teal-200 bg-white text-teal-800 hover:bg-teal-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {aiDraftError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{aiDraftError}</span>
                    </div>
                  )}

                  {aiDraftMeta && (
                    <div className="rounded-lg border border-teal-200/80 bg-white/90 p-2.5 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="font-semibold text-teal-800">
                          Đã điền bản nháp gợi ý — Dược sĩ kiểm duyệt trước khi gửi
                        </span>
                      </div>

                      {aiDraftMeta.detectedRxSummary && aiDraftMeta.detectedRxSummary.lines.length > 0 && (
                        <div className="rounded bg-indigo-50/80 border border-indigo-200 p-2 text-indigo-950">
                          <div className="font-bold mb-1">Thuốc AI nhận diện từ ảnh đính kèm:</div>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {aiDraftMeta.detectedRxSummary.lines.map((l, idx) => (
                              <li key={idx}>
                                <strong>{l.drug}</strong> · SL {l.quantity} {l.unit}
                                {l.dosage ? ` — ${l.dosage}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiDraftMeta.warnings.length > 0 && (
                        <div className="rounded bg-amber-50 border border-amber-200 p-2 text-amber-900">
                          <div className="font-bold">Lưu ý AI cảnh báo cho Dược sĩ:</div>
                          <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                            {aiDraftMeta.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiDraftMeta.citations.length > 0 && (
                        <div className="text-slate-600">
                          <div className="inline-flex items-center gap-1 font-semibold text-slate-800 mb-1">
                            <BookOpen className="h-3 w-3 text-teal-600" />
                            <span>Nguồn Dược thư tham chiếu để đối chiếu:</span>
                          </div>
                          <div className="space-y-1">
                            {aiDraftMeta.citations.map((cit) => (
                              <div key={cit.docId} className="rounded bg-slate-50 border border-slate-200 px-2 py-1">
                                <span className="font-mono font-bold text-teal-700">[DOC-{cit.docId}]</span>{' '}
                                <strong>{cit.title}</strong> — {cit.sourceName}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Mẫu Phản hồi Lâm sàng Nhanh 1-Click */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <span>Hoặc chọn nhanh mẫu câu có sẵn:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CLINICAL_REPLY_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => setReplyText(tpl.text)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-teal-600 hover:text-white hover:border-teal-600 transition-colors"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Soạn nội dung tư vấn */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Nội dung tư vấn của Dược sĩ phụ trách:
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Nhập hướng dẫn liều dùng, thời điểm uống thuốc và lưu ý chống chỉ định..."
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:border-teal-600 focus:outline-none leading-relaxed"
                  />
                </div>

                {/* Cấu hình Gửi Gmail Thật cho Khách hàng */}
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 font-bold text-sky-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendGmail}
                        onChange={(e) => setSendGmail(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600"
                      />
                      <Mail className="h-3.5 w-3.5 text-sky-700" />
                      <span>Gửi phản hồi qua Gmail thật cho khách hàng</span>
                    </label>
                  </div>

                  {sendGmail && (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Gmail khách hàng nhận thư:
                      </label>
                      <input
                        type="email"
                        required={sendGmail}
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="vd: khachhang@gmail.com"
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                      {isPlaceholderCustomerEmail(recipientEmail) && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            Phiếu hiện mang email nội bộ ({recipientEmail || 'trống'}). Hãy nhập Gmail thật khách cung cấp hoặc bỏ tích gửi Gmail để chỉ lưu nội bộ.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedContact.ReplyEmailStatus && (
                    <div
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] border ${
                        selectedContact.ReplyEmailStatus === 'SENT'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : selectedContact.ReplyEmailStatus === 'FAILED'
                            ? 'bg-rose-50 border-rose-200 text-rose-800'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <strong>Trạng thái email lần gần nhất:</strong> {selectedContact.ReplyEmailStatus}
                      {selectedContact.ReplyEmailTo ? ` -> ${selectedContact.ReplyEmailTo}` : ''}
                      {selectedContact.ReplyEmailMessageId ? ` (ID: ${selectedContact.ReplyEmailMessageId})` : ''}
                      {selectedContact.ReplyEmailError ? ` — ${selectedContact.ReplyEmailError}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 flex items-center justify-end gap-2 sticky bottom-0 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={submittingReply}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 shadow-sm disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {submittingReply
                    ? 'Đang xử lý...'
                    : sendGmail
                      ? 'Lưu & Gửi Gmail Thật'
                      : 'Lưu Phản Hồi Nội Bộ'}
                </span>
              </button>
            </div>
          </form>
        </div>
        </ModalPortal>
      )}

      {/* Lightbox Phóng To Ảnh Đính Kèm */}
      {zoomAttachment && attachmentUrl && (
        <ModalPortal>
          <div
            onClick={() => setZoomAttachment(false)}
            className="fixed inset-0 z-[10000] bg-slate-950/90 flex items-center justify-center p-4"
          >
            <button
              type="button"
              onClick={() => setZoomAttachment(false)}
              className="fixed top-4 right-4 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={attachmentUrl}
              alt="Ảnh đính kèm phóng to"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[92vw] object-contain rounded-xl shadow-2xl bg-white"
            />
          </div>
        </ModalPortal>
      )}

      {/* Modal Tạo Phiếu Tư Vấn Mới (Alt+N) */}
      {showCreateModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4">
            <form
              onSubmit={handleCreateSubmit}
              className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 py-3.5 shrink-0">
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
            <div className="p-4 sm:p-5 space-y-3 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Họ và tên bệnh nhân *
                </label>
                <input
                  type="text"
                  required
                  value={formData.FullName}
                  onChange={(e) => setFormData({ ...formData, FullName: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
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
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.Email}
                    onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
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
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
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
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 sm:px-5 py-3 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Lưu Phiếu tư vấn
              </button>
            </div>
          </form>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
