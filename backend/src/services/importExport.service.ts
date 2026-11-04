import ExcelJS from 'exceljs';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import path from 'path';
import { Product } from '@prisma/client';
import { ProductInputDTO, productInputSchema } from '../types/product.types';

/**
 * SERVICE IMPORT & EXPORT ĐA ĐỊNH DẠNG (Yêu cầu #9 trong Sheet: Excel .xlsx, JSON .json, XML .xml)
 */
class ImportExportService {
  /**
   * 1. Xuất danh sách Product ra file Excel (.xlsx) có định dạng bảng chuyên nghiệp
   */
  public async exportToExcel(products: Product[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Smart Pharmacy AI - D18CNPM5';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Danh sách Thuốc (Product)');

    sheet.columns = [
      { header: 'ProductID', key: 'ProductID', width: 12 },
      { header: 'ProductName', key: 'ProductName', width: 38 },
      { header: 'PathImage', key: 'PathImage', width: 45 },
      { header: 'ProductType', key: 'ProductType', width: 24 },
      { header: 'Quantity', key: 'Quantity', width: 12 },
      { header: 'Unit', key: 'Unit', width: 12 },
      { header: 'Price', key: 'Price', width: 16 },
      { header: 'Description', key: 'Description', width: 55 },
      { header: 'CreateDate', key: 'CreateDate', width: 22 },
      { header: 'UpdateDate', key: 'UpdateDate', width: 22 },
    ];

    // Định dạng dòng tiêu đề (Header)
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Màu xanh Y dược (Teal 700)
    };

    for (const item of products) {
      sheet.addRow({
        ProductID: item.ProductID,
        ProductName: item.ProductName,
        PathImage: item.PathImage,
        ProductType: item.ProductType,
        Quantity: item.Quantity,
        Unit: item.Unit,
        Price: item.Price,
        Description: item.Description,
        CreateDate: item.CreateDate.toISOString(),
        UpdateDate: item.UpdateDate.toISOString(),
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * 2. Xuất danh sách Product ra chuỗi JSON (.json)
   */
  public exportToJson(products: Product[]): string {
    return JSON.stringify(products, null, 2);
  }

  /**
   * 3. Xuất danh sách Product ra chuỗi XML (.xml)
   */
  public exportToXml(products: Product[]): string {
    const builder = new XMLBuilder({
      format: true,
      ignoreAttributes: false,
      indentBy: '  ',
    });

    const xmlPayload = {
      Products: {
        Product: products.map((item) => ({
          ProductID: item.ProductID,
          ProductName: item.ProductName,
          PathImage: item.PathImage,
          ProductType: item.ProductType,
          Quantity: item.Quantity,
          Unit: item.Unit,
          Price: item.Price,
          Description: item.Description,
          CreateDate: item.CreateDate.toISOString(),
          UpdateDate: item.UpdateDate.toISOString(),
        })),
      },
    };

    return `<?xml version="1.0" encoding="UTF-8"?>\n` + builder.build(xmlPayload);
  }

  /**
   * 4. Đọc & chuẩn hóa dữ liệu từ file Import (.xlsx, .json, .xml)
   */
  public async parseImportFile(buffer: Buffer, originalName: string): Promise<ProductInputDTO[]> {
    const ext = path.extname(originalName).toLowerCase();
    let rawRecords: Record<string, unknown>[] = [];

    if (ext === '.json') {
      const parsed = JSON.parse(buffer.toString('utf-8'));
      rawRecords = Array.isArray(parsed) ? parsed : parsed.items || parsed.products || [parsed];
    } else if (ext === '.xml') {
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(buffer.toString('utf-8'));
      const node = parsed?.Products?.Product ?? parsed?.products?.product ?? [];
      rawRecords = Array.isArray(node) ? node : [node];
    } else if (ext === '.xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('File Excel không có sheet dữ liệu nào');
      }

      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim();
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const record: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const key = headers[colNumber];
          if (key) {
            record[key] = cell.value;
          }
        });
        if (Object.keys(record).length > 0) {
          rawRecords.push(record);
        }
      });
    } else {
      throw new Error(`Định dạng file ${ext} không được hỗ trợ để Import`);
    }

    const validProducts: ProductInputDTO[] = [];
    for (const raw of rawRecords) {
      const normalized = {
        ProductName: String(raw.ProductName ?? raw.productName ?? raw['Tên thuốc'] ?? '').trim(),
        PathImage: String(
          raw.PathImage ??
            raw.pathImage ??
            'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80'
        ).trim(),
        ProductType: String(raw.ProductType ?? raw.productType ?? raw['Nhóm thuốc'] ?? 'Thuốc thông dụng').trim(),
        Quantity: Number(raw.Quantity ?? raw.quantity ?? raw['Số lượng'] ?? 0),
        Unit: String(raw.Unit ?? raw.unit ?? raw['Đơn vị'] ?? 'Hộp').trim(),
        Price: Number(raw.Price ?? raw.price ?? raw['Đơn giá'] ?? 0),
        Description: String(raw.Description ?? raw.description ?? raw['Mô tả'] ?? '').trim(),
      };

      const check = productInputSchema.safeParse(normalized);
      if (check.success) {
        validProducts.push(check.data);
      }
    }

    if (validProducts.length === 0) {
      throw new Error('Không tìm thấy bản ghi Product hợp lệ nào trong file tải lên');
    }

    return validProducts;
  }
}

export const importExportService = new ImportExportService();
