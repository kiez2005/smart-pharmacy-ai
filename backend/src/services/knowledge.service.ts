import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getPythonAiBaseUrl } from './ai.service';

export interface KnowledgeDocListParams {
  search?: string;
  docType?: string;
  productId?: number | null;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateKnowledgeDocInput {
  ProductID?: number | null;
  DocType?: 'LEAFLET' | 'GUIDELINE' | 'FAQ';
  Title: string;
  Section: string;
  Content: string;
  SourceName: string;
  SourceRef?: string | null;
  VerifiedBy?: string;
}

function splitDocumentIntoChunks(rawText: string, chunkSize = 1100): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= chunkSize) return [normalized];

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';

  for (const para of paragraphs) {
    if ((buf ? buf.length + 2 : 0) + para.length <= chunkSize) {
      buf = buf ? `${buf}\n\n${para}` : para;
    } else {
      if (buf) chunks.push(buf);
      if (para.length <= chunkSize) {
        buf = para;
      } else {
        for (let i = 0; i < para.length; i += chunkSize) {
          chunks.push(para.slice(i, i + chunkSize));
        }
        buf = '';
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length > 0 ? chunks : [normalized.slice(0, chunkSize)];
}

export async function triggerPythonAiReindex(): Promise<{ ok: boolean; indexedProducts?: number; indexedDocs?: number; error?: string }> {
  const pyUrl = getPythonAiBaseUrl();
  try {
    const [products, docs] = await Promise.all([
      prisma.product.findMany({
        select: {
          ProductID: true,
          ProductName: true,
          ProductType: true,
          Unit: true,
          Price: true,
          Description: true,
          Quantity: true,
          packaging: {
            select: {
              IsRx: true,
              IsPublished: true,
              IsTestOnly: true,
            },
          },
          stockLots: {
            where: { Status: 'ACTIVE', RemainingQuantity: { gt: 0 } },
            select: { RemainingQuantity: true },
          },
        },
        orderBy: { ProductID: 'asc' },
      }),
      prisma.knowledgeDocument.findMany({
        where: { IsActive: true },
        orderBy: { DocID: 'asc' },
      }),
    ]);

    const mappedProducts = products.map((p) => {
      const lotStock = p.stockLots.reduce((sum, lot) => sum + Number(lot.RemainingQuantity || 0), 0);
      return {
        ProductID: p.ProductID,
        ProductName: p.ProductName,
        ProductType: p.ProductType,
        Unit: p.Unit,
        Price: p.Price,
        Description: p.Description,
        TotalStock: lotStock > 0 ? lotStock : p.Quantity,
        IsRx: Boolean(p.packaging?.IsRx),
        IsPublished: p.packaging ? Boolean(p.packaging.IsPublished) : true,
        IsTestOnly: Boolean(p.packaging?.IsTestOnly),
      };
    });

    const resp = await fetch(`${pyUrl}/api/py-ai/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: mappedProducts,
        knowledgeDocuments: docs,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      return { ok: false, error: `Python reindex HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return {
      ok: true,
      indexedProducts: data.products,
      indexedDocs: data.knowledgeDocuments,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Python AI Service không phản hồi khi reindex' };
  }
}

export async function listKnowledgeDocuments(params: KnowledgeDocListParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(1, Number(params.limit || 25)));
  const search = String(params.search || '').trim();

  const where: Prisma.KnowledgeDocumentWhereInput = {};
  if (!params.includeInactive) {
    where.IsActive = true;
  }
  if (params.docType && params.docType !== 'ALL') {
    where.DocType = params.docType;
  }
  if (params.productId) {
    where.ProductID = Number(params.productId);
  }
  if (search) {
    where.OR = [
      { Title: { contains: search } },
      { Section: { contains: search } },
      { Content: { contains: search } },
      { SourceName: { contains: search } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.knowledgeDocument.count({ where }),
    prisma.knowledgeDocument.findMany({
      where,
      include: {
        product: {
          select: { ProductID: true, ProductName: true, ProductType: true },
        },
      },
      orderBy: [{ DocID: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function createKnowledgeDocument(input: CreateKnowledgeDocInput) {
  const created = await prisma.knowledgeDocument.create({
    data: {
      ProductID: input.ProductID ? Number(input.ProductID) : null,
      DocType: input.DocType || 'LEAFLET',
      Title: input.Title.trim(),
      Section: input.Section.trim(),
      Content: input.Content.trim(),
      SourceName: input.SourceName.trim(),
      SourceRef: input.SourceRef ? input.SourceRef.trim() : null,
      VerifiedBy: (input.VerifiedBy || 'Dược sĩ phụ trách chuyên môn').trim(),
      IsActive: true,
    },
    include: {
      product: { select: { ProductID: true, ProductName: true } },
    },
  });

  const reindex = await triggerPythonAiReindex();
  return { document: created, reindex };
}

export async function toggleKnowledgeDocument(docId: number, isActive: boolean) {
  const updated = await prisma.knowledgeDocument.update({
    where: { DocID: docId },
    data: { IsActive: isActive },
  });
  const reindex = await triggerPythonAiReindex();
  return { document: updated, reindex };
}

export async function ingestKnowledgeFile(
  fileBuffer: Buffer,
  originalName: string,
  meta: {
    ProductID?: number | null;
    DocType?: 'LEAFLET' | 'GUIDELINE' | 'FAQ';
    Title?: string;
    Section?: string;
    SourceName?: string;
    SourceRef?: string | null;
    VerifiedBy?: string;
  }
) {
  const ext = originalName.toLowerCase().split('.').pop() || '';
  let extractedText = '';

  if (ext === 'pdf') {
    const pyUrl = getPythonAiBaseUrl();
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), originalName);
    const resp = await fetch(`${pyUrl}/api/py-ai/extract-pdf`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      const errBody: any = await resp.json().catch(() => ({}));
      const msg = errBody?.detail?.message || `Không đọc được file PDF (HTTP ${resp.status})`;
      const error = new Error(msg);
      (error as any).statusCode = resp.status >= 500 ? 503 : 422;
      throw error;
    }
    const parsed: any = await resp.json();
    extractedText = String(parsed.text || '').trim();
  } else if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    extractedText = fileBuffer.toString('utf8').trim();
  } else {
    const error = new Error('Định dạng tài liệu chưa hỗ trợ (chỉ nhận .pdf, .txt, .md).');
    (error as any).statusCode = 400;
    throw error;
  }

  if (extractedText.length < 20) {
    const error = new Error('Nội dung tài liệu quá ngắn hoặc rỗng (tối thiểu 20 ký tự).');
    (error as any).statusCode = 422;
    throw error;
  }

  const baseTitle = (meta.Title || originalName.replace(/\.(pdf|txt|md)$/i, '')).trim();
  const baseSection = (meta.Section || 'Tài liệu HDSD nhập từ file').trim();
  const chunks = splitDocumentIntoChunks(extractedText, 1100);

  const createdDocs = [];
  for (let i = 0; i < chunks.length; i++) {
    const doc = await prisma.knowledgeDocument.create({
      data: {
        ProductID: meta.ProductID ? Number(meta.ProductID) : null,
        DocType: meta.DocType || 'LEAFLET',
        Title: chunks.length > 1 ? `${baseTitle} (Phần ${i + 1}/${chunks.length})` : baseTitle,
        Section: baseSection,
        Content: chunks[i],
        SourceName: (meta.SourceName || `Tệp kiểm chứng: ${originalName}`).trim(),
        SourceRef: meta.SourceRef ? meta.SourceRef.trim() : originalName,
        VerifiedBy: (meta.VerifiedBy || 'Dược sĩ phụ trách chuyên môn').trim(),
        IsActive: true,
      },
    });
    createdDocs.push(doc);
  }

  const reindex = await triggerPythonAiReindex();
  return {
    createdCount: createdDocs.length,
    documents: createdDocs,
    reindex,
  };
}
