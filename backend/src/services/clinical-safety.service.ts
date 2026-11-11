import { prisma as defaultPrisma } from '../config/prisma';

export interface ClinicalWarningItem {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  type: 'ALLERGY' | 'DUPLICATE_INGREDIENT' | 'DRUG_INTERACTION' | 'RX_REQUIRED';
  title: string;
  detail: string;
}

export interface ClinicalSafetyAssessment {
  status: 'SAFE' | 'WARNING_REQUIRES_REVIEW';
  hasCriticalAllergy: boolean;
  hasWarning: boolean;
  patientAllergies: string;
  warnings: ClinicalWarningItem[];
}

export async function evaluateClinicalSafetyServerSide(
  params: {
    productIds: number[];
    customerId?: number | null;
    patientAllergiesOverride?: string;
  },
  tx: any = defaultPrisma
): Promise<ClinicalSafetyAssessment> {
  const uniqueIds = Array.from(new Set(params.productIds.filter((id) => Number.isFinite(id))));
  const products =
    uniqueIds.length > 0
      ? await tx.product.findMany({
          where: { ProductID: { in: uniqueIds } },
        })
      : [];

  let patientAllergies = (params.patientAllergiesOverride || '').trim();
  if (params.customerId) {
    const customer = await tx.customer.findUnique({
      where: { CustomerID: Number(params.customerId) },
    });
    if (customer && customer.Allergies) {
      patientAllergies = customer.Allergies;
    }
  }

  const warnings: ClinicalWarningItem[] = [];
  const normalizedAllergy = patientAllergies.toLowerCase();
  const hasRealAllergyRecord =
    Boolean(normalizedAllergy) &&
    normalizedAllergy !== 'không có' &&
    normalizedAllergy !== 'không ghi nhận' &&
    normalizedAllergy !== 'không';

  // 1. Kiểm tra xung đột dị ứng bệnh nhân với từng thuốc trong giỏ
  if (hasRealAllergyRecord) {
    const allergyKeywords = normalizedAllergy
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3);

    for (const prod of products) {
      const text = `${prod.ProductName} ${prod.Description} ${prod.ProductType}`.toLowerCase();
      for (const kw of allergyKeywords) {
        const isBetaLactamMatch =
          (kw.includes('penicillin') || kw.includes('amoxicillin') || kw.includes('beta-lactam')) &&
          (text.includes('amoxicillin') ||
            text.includes('augmentin') ||
            text.includes('penicillin') ||
            text.includes('cefuroxim') ||
            text.includes('cephalosporin'));

        if (text.includes(kw) || isBetaLactamMatch) {
          warnings.push({
            severity: 'CRITICAL',
            type: 'ALLERGY',
            title: `Xung đột Dị ứng Nghiêm trọng: ${prod.ProductName}`,
            detail: `Hồ sơ bệnh nhân ghi nhận dị ứng "${patientAllergies}", xung đột trực tiếp với hoạt chất của "${prod.ProductName}" (${prod.Description}). Bắt buộc Dược sĩ thẩm định hoặc đổi thuốc!`,
          });
          break;
        }
      }
    }
  }

  // 2. Kiểm tra trùng lặp hoạt chất Paracetamol (nguy cơ quá liều độc gan)
  const paracetamolDrugs = products.filter((p: any) =>
    `${p.ProductName} ${p.Description}`.toLowerCase().includes('paracetamol')
  );
  if (paracetamolDrugs.length >= 2) {
    warnings.push({
      severity: 'CRITICAL',
      type: 'DUPLICATE_INGREDIENT',
      title: 'Trùng lặp hoạt chất Paracetamol (Nguy cơ quá liều gây độc gan)',
      detail: `Đơn có ${paracetamolDrugs.length} thuốc cùng chứa Paracetamol (${paracetamolDrugs
        .map((d: any) => d.ProductName)
        .join(', ')}). Tổng liều không được vượt quá 4g/ngày ở người lớn.`,
    });
  }

  // 3. Kiểm tra tương tác Kháng sinh + Men vi sinh hoặc NSAID
  const hasAntibiotic = products.some(
    (p: any) =>
      p.ProductType.toLowerCase().includes('kháng sinh') ||
      /augmentin|amoxicillin|azithromycin|cefuroxim|ciprofloxacin/i.test(
        `${p.ProductName} ${p.Description}`
      )
  );
  const hasProbiotic = products.some((p: any) =>
    /enterogermina|bacillus|men vi sinh|probiotic/i.test(`${p.ProductName} ${p.Description}`)
  );
  if (hasAntibiotic && hasProbiotic) {
    warnings.push({
      severity: 'WARNING',
      type: 'DRUG_INTERACTION',
      title: 'Tương tác Kháng sinh & Men vi sinh đường ruột',
      detail:
        'Kháng sinh có thể tiêu diệt chủng vi khuẩn có lợi nếu uống cùng lúc. Dược sĩ cần dặn bệnh nhân uống cách nhau ít nhất 2 giờ.',
    });
  }

  // 4. Kiểm tra thuốc kê đơn (Rx)
  const rxProducts = products.filter(
    (p: any) =>
      p.ProductType.toLowerCase().includes('kháng sinh') ||
      p.ProductType.toLowerCase().includes('tim mạch') ||
      p.ProductType.toLowerCase().includes('thần kinh') ||
      /augmentin|nexium|lipitor|glucophage|amoxicillin|cefuroxim|azithromycin/i.test(p.ProductName)
  );
  if (rxProducts.length > 0) {
    warnings.push({
      severity: 'WARNING',
      type: 'RX_REQUIRED',
      title: `Đơn có ${rxProducts.length} thuốc thuộc nhóm kiểm soát / kê đơn (Rx)`,
      detail: `Các thuốc (${rxProducts
        .map((p: any) => p.ProductName)
        .join(', ')}) yêu cầu Dược sĩ đại học kiểm tra chỉ định lâm sàng trước khi xuất kho.`,
    });
  }

  const hasCriticalAllergy = warnings.some((w) => w.severity === 'CRITICAL');
  const hasWarning = warnings.length > 0;

  return {
    status: hasWarning ? 'WARNING_REQUIRES_REVIEW' : 'SAFE',
    hasCriticalAllergy,
    hasWarning,
    patientAllergies: patientAllergies || 'Không ghi nhận',
    warnings,
  };
}
