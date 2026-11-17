import nodemailer, { Transporter } from 'nodemailer';
import {
  GMAIL_APP_PASSWORD,
  GMAIL_USER,
  MAIL_FROM_NAME,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
} from '../config/env';

export type ReplyEmailDeliveryStatus =
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_NOT_CONFIGURED'
  | 'SKIPPED_PLACEHOLDER_EMAIL'
  | 'LOCAL_ONLY';

export interface MailConfigStatus {
  configured: boolean;
  provider: string;
  host: string;
  port: number;
  secure: boolean;
  senderEmail: string | null;
  senderName: string;
  missingVars: string[];
}

export interface SendPharmacistReplyEmailInput {
  contactId: number;
  toEmail: string;
  patientName: string;
  originalSubject: string;
  originalMessage: string;
  replyNote: string;
  pharmacistName: string;
  emailSubject?: string;
}

export interface SendMailOutcome {
  status: ReplyEmailDeliveryStatus;
  toEmail: string;
  messageId: string | null;
  error: string | null;
}

const PLACEHOLDER_EMAIL_DOMAINS = ['@pharmacore.vn', '@test.local', '@example.com'];

let cachedTransporter: Transporter | null = null;
let cachedTransportSignature = '';

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatParagraphHtml(raw: string): string {
  return escapeHtml(raw).replace(/\r\n|\r|\n/g, '<br/>');
}

export function isPlaceholderEmail(email: string): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return true;
  return PLACEHOLDER_EMAIL_DOMAINS.some((domain) => normalized.endsWith(domain));
}

export function getMailConfigStatus(): MailConfigStatus {
  const missingVars: string[] = [];
  if (!GMAIL_USER) missingVars.push('GMAIL_USER');
  if (!GMAIL_APP_PASSWORD) missingVars.push('GMAIL_APP_PASSWORD');

  return {
    configured: missingVars.length === 0,
    provider: SMTP_HOST.includes('gmail') ? 'gmail-smtp' : 'custom-smtp',
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    senderEmail: GMAIL_USER || null,
    senderName: MAIL_FROM_NAME,
    missingVars,
  };
}

function getTransporter(): Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return null;
  }
  const signature = `${SMTP_HOST}:${SMTP_PORT}:${SMTP_SECURE}:${GMAIL_USER}:${GMAIL_APP_PASSWORD.length}`;
  if (cachedTransporter && cachedTransportSignature === signature) {
    return cachedTransporter;
  }
  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  cachedTransportSignature = signature;
  return cachedTransporter;
}

export async function verifySmtpConnection(): Promise<{
  ok: boolean;
  configured: boolean;
  senderEmail: string | null;
  message: string;
}> {
  const status = getMailConfigStatus();
  if (!status.configured) {
    return {
      ok: false,
      configured: false,
      senderEmail: null,
      message: `Chưa cấu hình Gmail SMTP thật (thiếu ${status.missingVars.join(', ')} trong backend/.env).`,
    };
  }
  const transporter = getTransporter();
  if (!transporter) {
    return {
      ok: false,
      configured: false,
      senderEmail: status.senderEmail,
      message: 'Không thể khởi tạo SMTP transporter.',
    };
  }
  try {
    await transporter.verify();
    return {
      ok: true,
      configured: true,
      senderEmail: GMAIL_USER,
      message: `Kết nối Gmail SMTP (${GMAIL_USER} via ${SMTP_HOST}:${SMTP_PORT}) thành công!`,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      senderEmail: GMAIL_USER,
      message: `Kết nối Gmail SMTP thất bại: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`,
    };
  }
}

export async function sendTestMailEmail(toEmail: string, testerName: string): Promise<SendMailOutcome> {
  const target = String(toEmail || '').trim();
  const status = getMailConfigStatus();
  if (!status.configured) {
    return {
      status: 'SKIPPED_NOT_CONFIGURED',
      toEmail: target,
      messageId: null,
      error: `Chưa cấu hình ${status.missingVars.join(', ')} trong backend/.env.`,
    };
  }
  const transporter = getTransporter()!;
  try {
    const info = await transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
      to: target,
      replyTo: GMAIL_USER,
      subject: `[PharmaCore Direct] Kiểm tra kết nối Gmail SMTP thành công`,
      text: `Xin chào ${testerName},\n\nEmail này xác nhận Hệ thống Hộp thư Dược sĩ PharmaCore Direct đã kết nối Gmail SMTP (${GMAIL_USER}) và gửi thư thật thành công.\n`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#0f766e;margin:0 0 8px;">PharmaCore Direct Pharmacy</h2>
        <p style="color:#334155;font-size:14px;">Xin chào <strong>${escapeHtml(testerName)}</strong>,</p>
        <p style="color:#334155;font-size:14px;">Email này xác nhận Hộp thư Dược sĩ đã kết nối <strong>Gmail SMTP (${escapeHtml(GMAIL_USER)})</strong> và gửi thư thật thành công.</p>
      </div>`,
    });
    return {
      status: 'SENT',
      toEmail: target,
      messageId: info.messageId || null,
      error: null,
    };
  } catch (err) {
    return {
      status: 'FAILED',
      toEmail: target,
      messageId: null,
      error: err instanceof Error ? err.message : 'Lỗi SMTP không xác định',
    };
  }
}

export async function sendPharmacistConsultationReplyEmail(
  input: SendPharmacistReplyEmailInput
): Promise<SendMailOutcome> {
  const target = String(input.toEmail || '').trim();
  if (isPlaceholderEmail(target)) {
    return {
      status: 'SKIPPED_PLACEHOLDER_EMAIL',
      toEmail: target,
      messageId: null,
      error: 'Địa chỉ email là placeholder nội bộ (@pharmacore.vn) nên không gửi Gmail; vui lòng nhập Gmail thật của khách hàng.',
    };
  }

  const status = getMailConfigStatus();
  if (!status.configured) {
    return {
      status: 'SKIPPED_NOT_CONFIGURED',
      toEmail: target,
      messageId: null,
      error: `Chưa cấu hình ${status.missingVars.join(', ')} trong backend/.env để gửi Gmail thật.`,
    };
  }

  const transporter = getTransporter();
  if (!transporter) {
    return {
      status: 'FAILED',
      toEmail: target,
      messageId: null,
      error: 'Không khởi tạo được SMTP transporter.',
    };
  }

  const ticketCode = `#TV-${String(input.contactId).padStart(3, '0')}`;
  const cleanSubject =
    input.emailSubject?.trim() ||
    `[${MAIL_FROM_NAME}] Phản hồi tư vấn Dược sĩ ${ticketCode}: ${input.originalSubject}`;

  const textBody = [
    `Xin chào ${input.patientName},`,
    '',
    `Dược sĩ phụ trách (${input.pharmacistName}) tại ${MAIL_FROM_NAME} phản hồi yêu cầu tư vấn ${ticketCode} của bạn:`,
    '',
    '--- NỘI DUNG TƯ VẤN CHUYÊN MÔN ---',
    input.replyNote,
    '',
    '--- TÓM TẮT YÊU CẦU BAN ĐẦU ---',
    `Chủ đề: ${input.originalSubject}`,
    input.originalMessage,
    '',
    'LƯU Ý AN TOÀN Y KHOA:',
    'Thông tin tư vấn dựa trên dữ liệu bạn cung cấp. Nếu xuất hiện dấu hiệu nặng (khó thở, sốt cao không hạ, đau ngực, phát ban toàn thân), vui lòng đến cơ sở y tế gần nhất hoặc gọi cấp cứu 115.',
    'Hotline Nhà thuốc PharmaCore Direct: 1800-6868.',
  ].join('\n');

  const htmlBody = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0f766e,#059669);color:#ffffff;padding:20px 24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">
          ${escapeHtml(MAIL_FROM_NAME)} · Phiếu ${escapeHtml(ticketCode)}
        </div>
        <h2 style="margin:6px 0 0;font-size:18px;line-height:1.35;">
          Phản Hồi Tư Vấn Dược Lâm Sàng
        </h2>
      </div>

      <div style="padding:24px;color:#1e293b;font-size:14px;line-height:1.65;">
        <p style="margin:0 0 12px;">Xin chào <strong>${escapeHtml(input.patientName)}</strong>,</p>
        <p style="margin:0 0 16px;">
          Cảm ơn bạn đã tin tưởng gửi câu hỏi tới Nhà thuốc. Dược sĩ phụ trách
          <strong>${escapeHtml(input.pharmacistName)}</strong> gửi bạn hướng dẫn chuyên môn chi tiết:
        </p>

        <div style="background:#f0fdfa;border:1px solid #99f6e4;border-left:4px solid #0f766e;border-radius:10px;padding:16px;margin:0 0 18px;color:#0f172a;">
          ${formatParagraphHtml(input.replyNote)}
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 18px;font-size:12px;color:#475569;">
          <div style="font-weight:700;color:#334155;margin-bottom:4px;">Nội dung bạn đã gửi (${escapeHtml(input.originalSubject)}):</div>
          <div>${formatParagraphHtml(input.originalMessage.slice(0, 1200))}</div>
        </div>

        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:12px;color:#92400e;">
          <strong>Lưu ý an toàn y khoa:</strong> Tư vấn qua email dựa trên thông tin bạn mô tả.
          Nếu triệu chứng nặng lên hoặc có dấu hiệu nguy hiểm (khó thở, đau thắt ngực, sốt cao co giật, dị ứng phù mặt),
          vui lòng đến ngay cơ sở y tế gần nhất hoặc gọi <strong>115</strong>. Tổng đài Dược sĩ: <strong>1800-6868</strong>.
        </div>
      </div>

      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;font-size:12px;color:#64748b;">
        Trân trọng,<br/>
        <strong>${escapeHtml(input.pharmacistName)}</strong> — ${escapeHtml(MAIL_FROM_NAME)}
      </div>
    </div>
  </div>`;

  try {
    const info = await transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
      to: target,
      replyTo: GMAIL_USER,
      subject: cleanSubject,
      text: textBody,
      html: htmlBody,
    });
    return {
      status: 'SENT',
      toEmail: target,
      messageId: info.messageId || null,
      error: null,
    };
  } catch (err) {
    return {
      status: 'FAILED',
      toEmail: target,
      messageId: null,
      error: err instanceof Error ? err.message : 'Lỗi gửi Gmail SMTP không xác định',
    };
  }
}
