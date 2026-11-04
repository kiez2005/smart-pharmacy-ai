import { Product } from '@prisma/client';
import { prisma } from '../config/prisma';
import {
  PaginatedProductResponse,
  ProductInputDTO,
  ProductQueryParams,
  ProductUpdateDTO,
} from '../types/product.types';
import { searchService } from './search.service';

/**
 * PRODUCT SERVICE - Đóng gói toàn bộ 11 nghiệp vụ bắt buộc của bảng Product
 * (Tách biệt hoàn toàn khỏi tầng HTTP Controller để code sạch & dễ bảo trì)
 */
class ProductService {
  /**
   * 1 & 6. Phân trang (10-15 item/page) kết hợp Tìm kiếm thông minh (Meilisearch + Fuse.js)
   */
  public async listProducts(params: ProductQueryParams): Promise<PaginatedProductResponse> {
    const { page, limit, search, type, unit, sortBy, sortOrder } = params;
    const startTime = performance.now();

    const baseWhere: Record<string, unknown> = {};
    if (type && type !== 'ALL') {
      baseWhere.ProductType = type;
    }
    if (unit && unit !== 'ALL') {
      baseWhere.Unit = unit;
    }

    let searchMeta: PaginatedProductResponse['searchMeta'] = {
      engine: 'prisma-sql',
      processingTimeMs: 0,
    };

    // Nếu có từ khóa tìm kiếm -> Kích hoạt Meilisearch / Fuse.js (Gợi ý AI #8)
    if (search) {
      const candidateProducts = await prisma.product.findMany({
        where: baseWhere,
      });

      const searchResult = await searchService.searchProducts(search, candidateProducts);
      baseWhere.ProductID = { in: searchResult.matchedIds };
      searchMeta = {
        engine: searchResult.engine,
        processingTimeMs: searchResult.processingTimeMs,
      };
    }

    const [total, items, allTypes, allUnits] = await Promise.all([
      prisma.product.count({ where: baseWhere }),
      prisma.product.findMany({
        where: baseWhere,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.product.findMany({ select: { ProductType: true }, distinct: ['ProductType'] }),
      prisma.product.findMany({ select: { Unit: true }, distinct: ['Unit'] }),
    ]);

    if (!search) {
      searchMeta = {
        engine: 'prisma-sql',
        processingTimeMs: Math.round(performance.now() - startTime),
      };
    }

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        types: allTypes.map((t) => t.ProductType),
        units: allUnits.map((u) => u.Unit),
      },
      searchMeta,
    };
  }

  /**
   * Lấy toàn bộ sản phẩm để phục vụ Export file hoặc đồng bộ Meilisearch
   */
  public async getAllProducts(): Promise<Product[]> {
    return prisma.product.findMany({
      orderBy: { ProductID: 'asc' },
    });
  }

  /**
   * 4. Xem chi tiết 1 sản phẩm theo ProductID
   */
  public async getById(id: number): Promise<Product | null> {
    return prisma.product.findUnique({
      where: { ProductID: id },
    });
  }

  /**
   * 2. Thêm mới sản phẩm thuốc
   */
  public async create(data: ProductInputDTO): Promise<Product> {
    const created = await prisma.product.create({ data });
    void this.triggerSearchSync();
    return created;
  }

  /**
   * 3. Cập nhật sản phẩm thuốc
   */
  public async update(id: number, data: ProductUpdateDTO): Promise<Product> {
    const updated = await prisma.product.update({
      where: { ProductID: id },
      data,
    });
    void this.triggerSearchSync();
    return updated;
  }

  /**
   * 5a. Xóa 1 bản ghi được chọn
   */
  public async deleteOne(id: number): Promise<Product> {
    const deleted = await prisma.product.delete({
      where: { ProductID: id },
    });
    void this.triggerSearchSync();
    return deleted;
  }

  /**
   * 5b. Xóa nhiều bản ghi được chọn từ ô Checkbox
   */
  public async bulkDelete(ids: number[]): Promise<number> {
    const result = await prisma.product.deleteMany({
      where: { ProductID: { in: ids } },
    });
    void this.triggerSearchSync();
    return result.count;
  }

  /**
   * 7. Sao chép 1 bản ghi (Clone 1 record)
   */
  public async cloneOne(id: number): Promise<Product> {
    const source = await this.getById(id);
    if (!source) {
      throw new Error(`Không tìm thấy sản phẩm có mã #${id} để sao chép`);
    }

    const cloned = await prisma.product.create({
      data: {
        ProductName: `${source.ProductName} (Bản sao)`,
        PathImage: source.PathImage,
        ProductType: source.ProductType,
        Quantity: source.Quantity,
        Unit: source.Unit,
        Price: source.Price,
        Description: source.Description,
      },
    });

    void this.triggerSearchSync();
    return cloned;
  }

  /**
   * 8. Sao chép nhiều bản ghi từ ô Checkbox (Bulk Clone trong 1 Transaction)
   */
  public async bulkClone(ids: number[]): Promise<Product[]> {
    const sources = await prisma.product.findMany({
      where: { ProductID: { in: ids } },
    });

    if (sources.length === 0) {
      throw new Error('Không tìm thấy các bản ghi được chọn để sao chép');
    }

    const clonedItems = await prisma.$transaction(
      sources.map((src) =>
        prisma.product.create({
          data: {
            ProductName: `${src.ProductName} (Bản sao)`,
            PathImage: src.PathImage,
            ProductType: src.ProductType,
            Quantity: src.Quantity,
            Unit: src.Unit,
            Price: src.Price,
            Description: src.Description,
          },
        })
      )
    );

    void this.triggerSearchSync();
    return clonedItems;
  }

  /**
   * 9. Import hàng loạt bản ghi từ file Excel / JSON / XML trong 1 Transaction
   */
  public async importBatch(items: ProductInputDTO[]): Promise<number> {
    const created = await prisma.$transaction(
      items.map((item) => prisma.product.create({ data: item }))
    );
    void this.triggerSearchSync();
    return created.length;
  }

  private async triggerSearchSync(): Promise<void> {
    try {
      const all = await this.getAllProducts();
      await searchService.syncProducts(all);
    } catch {
      // Không làm gián đoạn luồng chính nếu Meilisearch tắt
    }
  }
}

export const productService = new ProductService();
