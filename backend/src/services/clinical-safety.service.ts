import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export const CLINICAL_RULE_VERSION = '2026.11-GPP-VN-v2';
export const CLINICAL_ADVISORY_DISCLAIMER =
  'Cảnh báo lâm sàng và gợi ý AI chỉ mang tính chất tham khảo hỗ trợ quyết định; KHÔNG thay thế chẩn đoán y khoa hoặc thẩm định trực tiếp của Dược sĩ chuyên môn.';

export const ALLOWED_OVERRIDE_REASON_CODES = [
  {
    code: 'DOCTOR_CONFIRMED',
    label: 'Bác sĩ điều trị đã xác nhận giữ đơn và theo dõi sát',
  },
  {
    code: 'PATIENT_TOLERANT',
    label: 'Bệnh nhân xác nhận đã dung nạp an toàn hoạt chất này trước đây',
  },
  {
    code: 'FALSE_POSITIVE_MATCH',
    label: 'Dị ứng khai báo không trùng hoạt chất thực tế của chế phẩm',
  },
  {
    code: 'STAGGERED_DOSING',
    label: 'Đã tư vấn bệnh nhân uống giãn cách tối thiểu 2-4 giờ',
  },
] as const;

export type OverrideReasonCode = (typeof ALLOWED_OVERRIDE_REASON_CODES)[number]['code'];

export function isValidOverrideReasonCode(code?: string | null): code is OverrideReasonCode {
  if (!code) return false;
  return ALLOWED_OVERRIDE_REASON_CODES.some((r) => r.code === code.trim());
}

export function canRoleOverrideClinicalSafety(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'PHARMACIST';
}

export interface ClinicalWarningItem {
  ruleId: string;
  source: string;
  severity: 'HIGH' | 'MEDIUM';
  category: 'ALLERGY' | 'DUPLICATION' | 'INTERACTION' | 'CONTRAINDICATION';
  title: string;
  detail: string;
  recommendation: string;
}

export interface ClinicalSafetyResult {
  hasCriticalAllergy: boolean;
  hasHighRiskWarning: boolean;
  requiresPharmacistReview: boolean;
  isAdvisoryOnly: true;
  disclaimer: string;
  ruleVersion: string;
  patientAllergies: string;
  warnings: ClinicalWarningItem[];
}

const ALLERGY_CROSS_REACTIVITY_GROUPS: Array<{
  triggerTokens: string[];
  matchedKeywords: string[];
  classLabel: string;
}> = [
  {
    triggerTokens: ['penicillin', 'penixilin', 'amoxicillin', 'ampicillin', 'beta-lactam', 'betalactam', 'augmentin'],
    matchedKeywords: ['amoxicillin', 'augmentin', 'clavulanic', 'ampicillin', 'penicillin'],
    classLabel: 'Beta-lactam / Penicillin',
  },
  {
    triggerTokens: ['cephalosporin', 'cefixim', 'cefuroxim', 'cephalexin'],
    matchedKeywords: ['cefixim', 'cefuroxim', 'cephalexin', 'ceftriaxone'],
    classLabel: 'Kháng sinh Cephalosporin',
  },
  {
    triggerTokens: ['nsaid', 'aspirin', 'ibuprofen', 'diclofenac', 'voltaren', 'meloxicam', 'naproxen'],
    matchedKeywords: ['nsaid', 'ibuprofen', 'diclofenac', 'voltaren', 'aspirin', 'meloxicam'],
    classLabel: 'Kháng viêm không steroid (NSAID)',
  },
  {
    triggerTokens: ['paracetamol', 'acetaminophen', 'panadol', 'efferalgan', 'hapacol'],
    matchedKeywords: ['paracetamol', 'panadol', 'efferalgan', 'hapacol', 'tiffy', 'decolgen'],
    classLabel: 'Paracetamol / Acetaminophen',
  },
  {
    triggerTokens: ['macrolide', 'azithromycin', 'erythromycin', 'clarithromycin', 'zithromax'],
    matchedKeywords: ['azithromycin', 'zithromax', 'erythromycin', 'clarithromycin'],
    classLabel: 'Kháng sinh nhóm Macrolide',
  },
  {
    triggerTokens: ['caffeine', 'cafein'],
    matchedKeywords: ['caffeine', 'panadol extra'],
    classLabel: 'Caffeine',
  },
];

function normalizeAllergyString(raw?: string | null): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (
    lower === 'không' ||
    lower === 'không có' ||
    lower === 'không ghi nhận' ||
    lower === 'chưa ghi nhận' ||
    lower === 'none' ||
    lower === 'n/a'
  ) {
    return '';
  }
  return value;
}

export function mergePatientAllergies(...sources: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const src of sources) {
    const cleaned = normalizeAllergyString(src);
    if (!cleaned) continue;
    const parts = cleaned
      .split(/[,;/|\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      const key = part.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(part);
      }
    }
  }
  return merged.join(', ');
}

export function evaluateDrugSetSafety(
  products: Array<{
    ProductID: number;
    ProductName: string;
    ProductType: string;
    Description: string;
  }>,
  patientAllergiesRaw?: string | null
): ClinicalSafetyResult {
  const warnings: ClinicalWarningItem[] = [];
  let hasCriticalAllergy = false;
  const patientAllergies = mergePatientAllergies(patientAllergiesRaw);

  // 1. Trùng lặp hoạt chất Paracetamol (Hepatotoxicity > 4g/24h)
  const paracetamolDrugs = products.filter((p) => {
    const text = `${p.ProductName} ${p.Description}`.toLowerCase();
    return (
      text.includes('paracetamol') ||
      text.includes('acetaminophen') ||
      text.includes('panadol') ||
      text.includes('efferalgan') ||
      text.includes('hapacol') ||
      text.includes('tiffy') ||
      text.includes('decolgen')
    );
  });

  if (paracetamolDrugs.length >= 2) {
    warnings.push({
      ruleId: 'GPP-DUP-PARA-01',
      source: 'Dược thư Quốc gia Việt Nam / BYT GPP Rule',
      severity: 'HIGH',
      category: 'DUPLICATION',
      title: `Trùng lặp hoạt chất Paracetamol (${paracetamolDrugs.map((d) => d.ProductName).join(' + ')})`,
      detail:
        'Nhiều chế phẩm cùng chứa Paracetamol. Phối hợp đồng thời làm tăng nguy cơ quá liều > 4.000mg/24h gây độc gan cấp.',
      recommendation: 'Chỉ giữ 1 chế phẩm chứa Paracetamol trong cùng đơn thuốc.',
    });
  }

  // 2. Trùng lặp nhóm kháng viêm NSAID
  const nsaidDrugs = products.filter((p) => {
    const text = `${p.ProductName} ${p.Description}`.toLowerCase();
    return (
      text.includes('nsaid') ||
      text.includes('ibuprofen') ||
      text.includes('diclofenac') ||
      text.includes('voltaren') ||
      text.includes('aspirin') ||
      text.includes('meloxicam')
    );
  });

  if (nsaidDrugs.length >= 2) {
    warnings.push({
      ruleId: 'GPP-INT-NSAID-02',
      source: 'Dược thư Quốc gia Việt Nam / FDA Drug Interaction Rules',
      severity: 'HIGH',
      category: 'INTERACTION',
      title: `Tương tác bất lợi đa thuốc NSAID (${nsaidDrugs.map((d) => d.ProductName).join(' + ')})`,
      detail:
        'Phối hợp nhiều thuốc chống viêm không steroid làm tăng mạnh nguy cơ loét, xuất huyết tiêu hóa và tổn thương thận cấp.',
      recommendation: 'Tránh phối hợp nhiều NSAID đồng thời; cân nhắc bỏ bớt hoặc đổi nhóm giảm đau khác.',
    });
  }

  // 3. Tương tác hấp thu Kháng sinh & Chế phẩm chứa ion kim loại / Smecta / Men vi sinh
  const antibiotics = products.filter(
    (p) =>
      p.ProductType === 'Kháng sinh' ||
      /amoxicillin|augmentin|azithromycin|cefixim|ciprofloxacin|levofloxacin/i.test(
        `${p.ProductName} ${p.Description}`
      )
  );
  const antacidsOrProbiotics = products.filter((p) =>
    /phosphalugel|smecta|enterogermina|nhôm|magie|antacid|men vi sinh/i.test(
      `${p.ProductName} ${p.Description}`
    )
  );

  if (antibiotics.length >= 1 && antacidsOrProbiotics.length >= 1) {
    warnings.push({
      ruleId: 'GPP-INT-ABX-03',
      source: 'Hướng dẫn Sử dụng Kháng sinh Bộ Y tế',
      severity: 'MEDIUM',
      category: 'INTERACTION',
      title: 'Tương tác giảm hấp thu Kháng sinh & Thuốc bảo vệ niêm mạc / Men vi sinh',
      detail:
        'Thuốc bao niêm mạc dạ dày, Smecta hoặc men vi sinh có thể tạo phức chelat hoặc bất hoạt lợi khuẩn nếu uống cùng lúc với kháng sinh.',
      recommendation: 'Uống giãn cách tối thiểu 2 giờ giữa kháng sinh và các chế phẩm tiêu hóa này.',
    });
  }

  // 4. Trùng nhóm co mạch giao cảm (Xylometazoline xịt + Phenylephrine uống)
  const topicalDecongestants = products.filter((p) =>
    /otrivin|xylometazoline|oxymetazoline/i.test(`${p.ProductName} ${p.Description}`)
  );
  const systemicDecongestants = products.filter((p) =>
    /phenylephrine|pseudoephedrine|tiffy|decolgen/i.test(`${p.ProductName} ${p.Description}`)
  );

  if (topicalDecongestants.length >= 1 && systemicDecongestants.length >= 1) {
    warnings.push({
      ruleId: 'GPP-INT-DECONG-04',
      source: 'GPP Clinical Screening Rule',
      severity: 'MEDIUM',
      category: 'INTERACTION',
      title: 'Cộng hưởng thuốc co mạch mũi xoang (Thuốc xịt + Thuốc uống)',
      detail:
        'Dùng đồng thời thuốc xịt co mạch tại chỗ (Otrivin/Xylometazoline) và thuốc uống chứa Phenylephrine có thể làm tăng nhịp tim hoặc huyết áp nhẹ.',
      recommendation: 'Hạn chế dùng xịt mũi quá 5-7 ngày và hỏi tiền sử tăng huyết áp trước khi giao thuốc.',
    });
  }

  // 5. Trùng nhóm Kháng Histamine H1
  const antihistamines = products.filter((p) =>
    /chlorpheniramine|loratadin|fexofenadine|cetirizin|telfast|tiffy|decolgen/i.test(
      `${p.ProductName} ${p.Description}`
    )
  );

  if (antihistamines.length >= 2) {
    warnings.push({
      ruleId: 'GPP-DUP-AH1-05',
      source: 'GPP Clinical Screening Rule',
      severity: 'MEDIUM',
      category: 'DUPLICATION',
      title: `Trùng lặp thuốc Kháng Histamine H1 (${antihistamines.map((d) => d.ProductName).join(' + ')})`,
      detail:
        'Phối hợp nhiều chế phẩm kháng histamine H1 làm tăng tác dụng phụ khô miệng, chóng mặt và buồn ngủ.',
      recommendation: 'Đánh giá lại đơn để tránh trùng lặp nhóm chống dị ứng.',
    });
  }

  // 6. Kiểm tra dị ứng + dị ứng chéo hoạt chất
  if (patientAllergies) {
    const tokens = patientAllergies
      .toLowerCase()
      .split(/[,;/|\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);

    const matchedAllergyProductIds = new Set<number>();

    for (const token of tokens) {
      const directMatches = products.filter((p) =>
        `${p.ProductName} ${p.Description}`.toLowerCase().includes(token)
      );
      for (const prod of directMatches) {
        if (!matchedAllergyProductIds.has(prod.ProductID)) {
          matchedAllergyProductIds.add(prod.ProductID);
          hasCriticalAllergy = true;
          warnings.push({
            ruleId: 'GPP-ALLERGY-DIRECT',
            source: 'Patient Allergy Profile / Clinical Safety Gate',
            severity: 'HIGH',
            category: 'ALLERGY',
            title: `CHỐNG CHỈ ĐỊNH DỊ ỨNG TRỰC TIẾP: "${token.toUpperCase()}" (${prod.ProductName})`,
            detail: `Thông tin dị ứng bệnh nhân ("${patientAllergies}") khớp trực tiếp với thành phần hoặc tên thuốc "${prod.ProductName}".`,
            recommendation:
              'CHẶN CẤP PHÁT: Đổi sang hoạt chất an toàn hoặc yêu cầu Dược sĩ chuyên môn thẩm định & ghi mã lý do vượt cảnh báo.',
          });
        }
      }

      // Cross-reactivity check (e.g. Penicillin -> Augmentin / Amoxicillin)
      for (const group of ALLERGY_CROSS_REACTIVITY_GROUPS) {
        const triggered = group.triggerTokens.some((t) => token.includes(t) || t.includes(token));
        if (!triggered) continue;

        const crossMatches = products.filter((p) => {
          const text = `${p.ProductName} ${p.Description}`.toLowerCase();
          return group.matchedKeywords.some((kw) => text.includes(kw));
        });

        for (const prod of crossMatches) {
          if (!matchedAllergyProductIds.has(prod.ProductID)) {
            matchedAllergyProductIds.add(prod.ProductID);
            hasCriticalAllergy = true;
            warnings.push({
              ruleId: 'GPP-ALLERGY-CROSS',
              source: 'Beta-Lactam / Cross-Reactivity Clinical Rule',
              severity: 'HIGH',
              category: 'ALLERGY',
              title: `CHỐNG CHỈ ĐỊNH DỊ ỨNG CHÉO (${group.classLabel}): "${prod.ProductName}"`,
              detail: `Bệnh nhân dị ứng "${token}" thuộc nhóm nguy cơ phản ứng chéo với "${prod.ProductName}" (${group.classLabel}).`,
              recommendation:
                'KHÔNG tự ý cấp phát. Bắt buộc Dược sĩ đại học đánh giá lâm sàng hoặc chuyển nhóm thuốc thay thế.',
            });
          }
        }
      }
    }
  }

  const hasHighRiskWarning = hasCriticalAllergy || warnings.some((w) => w.severity === 'HIGH');

  return {
    hasCriticalAllergy,
    hasHighRiskWarning,
    requiresPharmacistReview: warnings.length > 0,
    isAdvisoryOnly: true,
    disclaimer: CLINICAL_ADVISORY_DISCLAIMER,
    ruleVersion: CLINICAL_RULE_VERSION,
    patientAllergies,
    warnings,
  };
}

/**
 * Thẩm định lâm sàng lấy từ DB (kết hợp BOTH Customer.Allergies lẫn patientAllergiesOverride từ đơn online/POS - S2)
 */
export async function evaluateClinicalSafetyServerSide(params: {
  tx?: Prisma.TransactionClient;
  customerId?: number | null;
  patientAllergiesOverride?: string | null;
  productIds: number[];
}): Promise<ClinicalSafetyResult> {
  const client = params.tx ?? prisma;

  let customerAllergiesFromDb = '';
  if (params.customerId) {
    const customer = await client.customer.findUnique({
      where: { CustomerID: params.customerId },
      select: { Allergies: true },
    });
    customerAllergiesFromDb = customer?.Allergies || '';
  }

  // S2 FIX: Luôn gộp cả tiền sử DB và dị ứng khách mới tự khai báo (không bao giờ ghi đè mất dữ liệu khai báo)
  const effectiveAllergies = mergePatientAllergies(
    customerAllergiesFromDb,
    params.patientAllergiesOverride
  );

  const uniqueProductIds = Array.from(new Set(params.productIds));
  const products = await client.product.findMany({
    where: { ProductID: { in: uniqueProductIds } },
    select: {
      ProductID: true,
      ProductName: true,
      ProductType: true,
      Description: true,
    },
  });

  return evaluateDrugSetSafety(products, effectiveAllergies);
}

export async function recordClinicalAuditLogTx(
  tx: Prisma.TransactionClient,
  params: {
    actorUserId: number;
    actorName: string;
    actorRole: string;
    contextType: 'POS_INVOICE' | 'ONLINE_ORDER_REVIEW';
    invoiceId?: number | null;
    onlineOrderId?: number | null;
    customerId?: number | null;
    patientAllergies?: string | null;
    action: 'OVERRIDE_ALLERGY' | 'OVERRIDE_INTERACTION' | 'APPROVE_RX' | 'REJECT_RX';
    reasonCode: string;
    reasonNote: string;
    warnings: ClinicalWarningItem[] | unknown[];
  }
) {
  return tx.clinicalAuditLog.create({
    data: {
      ActorUserID: params.actorUserId,
      ActorName: params.actorName,
      ActorRole: params.actorRole,
      ContextType: params.contextType,
      InvoiceID: params.invoiceId ?? null,
      OnlineOrderID: params.onlineOrderId ?? null,
      CustomerID: params.customerId ?? null,
      PatientAllergies: params.patientAllergies || null,
      Action: params.action,
      ReasonCode: params.reasonCode,
      ReasonNote: params.reasonNote,
      WarningsJson: JSON.stringify(params.warnings),
      RuleVersion: CLINICAL_RULE_VERSION,
    },
  });
}
