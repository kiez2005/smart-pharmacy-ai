import { Prisma, Product } from '@prisma/client';
import { prisma } from '../config/prisma';
import { deriveIsRxClassification, packagingService } from './packaging.service';
import {
  PaginatedProductResponse,
  ProductInputDTO,
  ProductQueryParams,
  ProductUpdateDTO,
} from '../types/product.types';
import { searchService } from './search.service';
import { isValidFutureIsoDate } from '../utils/date.util';

/**
 * PRODUCT SERVICE - Đóng gói toàn bộ 11 nghiệp vụ bắt buộc của bảng Product
 * (Tách biệt hoàn toàn khỏi tầng HTTP Controller để code sạch & dễ bảo trì)
 */
class ProductService {
  /**
   * 1 & 6. Phân trang (10-15 item/page) kết hợp Tìm kiếm thông minh (Meilisearch + Fuse.js)
   */
  public async listProducts(params: ProductQueryParams): Promise<PaginatedProductResponse> {
    const { page, limit: rawLimit, search, type, unit, sortBy, sortOrder } = params;
    const limit = Math.min(100, Math.max(1, Number(rawLimit || 20)));
    const startTime = performance.now();

    const baseWhere: Record<string, unknown> = {
      OR: [{ packaging: { is: null } }, { packaging: { is: { IsTestOnly: false } } }],
    };
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

    // Nếu có từ khóa tìm kiếm -> Ưu tiên Meilisearch IDs, hoặc fallback truy vấn cột rút gọn giới hạn kích thước
    if (search) {
      const meiliHit = await searchService.searchMeilisearchIds(search, 100);
      if (meiliHit) {
        baseWhere.ProductID = { in: meiliHit.matchedIds };
        searchMeta = {
          engine: 'meilisearch',
          processingTimeMs: meiliHit.processingTimeMs,
        };
      } else {
        const searchTrimmed = search.trim();
        const numericId = Number(searchTrimmed);
        const searchTokens = Array.from(
          new Set(
            searchTrimmed
              .split(/\s+/)
              .map((t) => t.trim())
              .filter((t) => t.length >= 2)
          )
        ).slice(0, 5);

        const textConditions: Record<string, unknown>[] = [
          { ProductName: { contains: searchTrimmed } },
          { Description: { contains: searchTrimmed } },
          { ProductType: { contains: searchTrimmed } },
          ...searchTokens.flatMap((token) => [
            { ProductName: { contains: token } },
            { ProductType: { contains: token } },
            ...(token.length >= 4 ? [{ ProductName: { contains: token.slice(0, 3) } }] : []),
          ]),
        ];
        if (Number.isInteger(numericId) && numericId > 0) {
          textConditions.push({ ProductID: numericId });
        }

        const slimSelect = {
          ProductID: true,
          ProductName: true,
          Description: true,
          ProductType: true,
          Unit: true,
        } as const;

        let candidateProducts = await prisma.product.findMany({
          where: {
            AND: [baseWhere, { OR: textConditions }],
          },
          select: slimSelect,
          take: 150,
          orderBy: { ProductID: 'asc' },
        });

        if (candidateProducts.length < 10) {
          const existingIds = candidateProducts.map((p) => p.ProductID);
          const supplement = await prisma.product.findMany({
            where: {
              AND: [
                baseWhere,
                ...(existingIds.length > 0 ? [{ ProductID: { notIn: existingIds } }] : []),
              ],
            },
            select: slimSelect,
            take: Math.max(0, 250 - candidateProducts.length),
            orderBy: { ProductID: 'asc' },
          });
          candidateProducts = [...candidateProducts, ...supplement];
        }

        const searchResult = await searchService.searchProducts(searchTrimmed, candidateProducts);
        baseWhere.ProductID = { in: searchResult.matchedIds };
        searchMeta = {
          engine: searchResult.engine,
          processingTimeMs: searchResult.processingTimeMs,
        };
      }
    }

    const [total, items, allTypes, allUnits] = await Promise.all([
      prisma.product.count({ where: baseWhere }),
      prisma.product.findMany({
        where: baseWhere,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          packaging: true,
          stockLots: {
            where: { RemainingQuantity: { gt: 0 }, Status: 'ACTIVE' },
            orderBy: [{ ExpiryDate: 'asc' }, { LotID: 'asc' }],
          },
        },
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
      include: {
        packaging: true,
        stockLots: {
          where: { RemainingQuantity: { gt: 0 }, Status: 'ACTIVE' },
          orderBy: [{ ExpiryDate: 'asc' }, { LotID: 'asc' }],
        },
      },
    });
  }

  /**
   * Tạo lô tồn kho thật từ Số lô & Hạn sử dụng đã xác thực khi khởi tạo sản phẩm có tồn ban đầu (> 0).
   * Tuyệt đối KHÔNG tự sinh số lô giả hay hạn dùng mặc định (P1).
   */
  private async createInitialVerifiedLotTx(
    tx: Prisma.TransactionClient,
    product: Product,
    batchNumber?: string,
    expiryDate?: string
  ): Promise<void> {
    if (product.Quantity <= 0) return;

    const cleanBatch = batchNumber?.trim() || '';
    const cleanExpiry = expiryDate?.trim() || '';
    if (cleanBatch.length < 2 || !isValidFutureIsoDate(cleanExpiry)) {
      const err: Error & { statusCode?: number; code?: string } = new Error(
        `Sản phẩm "${product.ProductName}" có số lượng ban đầu > 0 nhưng thiếu Số lô hoặc Hạn sử dụng hợp lệ (YYYY-MM-DD >= hôm nay).`
      );
      err.statusCode = 400;
      err.code = 'LOT_EXPIRY_REQUIRED_FOR_INITIAL_STOCK';
      throw err;
    }

    await tx.stockLot.create({
      data: {
        ProductID: product.ProductID,
        BatchNumber: cleanBatch,
        ExpiryDate: cleanExpiry,
        InitialQuantity: product.Quantity,
        RemainingQuantity: product.Quantity,
        ImportPrice: Math.round(product.Price * 0.72),
        BranchCode: 'CS1-GPP',
        Status: 'ACTIVE',
      },
    });

    await tx.stockMovement.create({
      data: {
        ProductID: product.ProductID,
        SourceType: 'PURCHASE_ORDER',
        SourceID: product.ProductID,
        LineItemID: 0,
        MovementType: 'IMPORT',
        Unit: product.Unit,
        Quantity: product.Quantity,
        BaseQtyDelta: product.Quantity,
        LooseQtyDelta: 0,
        BatchNumber: cleanBatch,
        ExpiryDate: cleanExpiry,
        ActorName: 'Khởi tạo danh mục kèm lô xác thực',
        Note: `Nhập tồn đầu kỳ theo lô ${cleanBatch} (HSD ${cleanExpiry})`,
      },
    });
  }

  /**
   * 2. Thêm mới sản phẩm thuốc kèm quy cách đóng gói, phân loại kê đơn IsRx & lô thật (nếu Quantity > 0)
   */
  private assertRxClassificationConfirmed(
    candidate: Pick<Product, 'ProductName' | 'ProductType' | 'Description'>,
    packagingInput?: Record<string, any> | null
  ): boolean {
    if (!packagingInput || typeof packagingInput !== 'object' || typeof packagingInput.IsRx !== 'boolean') {
      const err = new Error(
        'Bắt buộc xác nhận rõ phân loại Thuốc kê đơn (Rx) hoặc Không kê đơn (OTC) trong thông tin đóng gói.'
      ) as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = 'RX_CLASSIFICATION_REQUIRED';
      throw err;
    }

    const explicitIsRx = Boolean(packagingInput.IsRx);
    if (!explicitIsRx && deriveIsRxClassification(candidate) && packagingInput.confirmOtcOverride !== true) {
      const err = new Error(
        'Tên hoặc nhóm thuốc có dấu hiệu thuộc danh mục kê đơn (Rx). Vui lòng chọn phân loại Rx hoặc tích xác nhận ngoại lệ OTC (confirmOtcOverride).'
      ) as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = 'RX_CLASSIFICATION_CONFIRMATION_REQUIRED';
      throw err;
    }

    return explicitIsRx;
  }

  public async create(data: ProductInputDTO, packagingInput?: Record<string, any>): Promise<Product> {
    const { InitialBatchNumber, InitialExpiryDate, packaging: dtoPackaging, ...productData } = data;
    const mergedPackaging = packagingInput ?? dtoPackaging;
    const explicitIsRx = this.assertRxClassificationConfirmed(productData, mergedPackaging);

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.product.create({ data: productData });
      await this.createInitialVerifiedLotTx(tx, item, InitialBatchNumber, InitialExpiryDate);
      const spec = await packagingService.getOrCreatePackagingSpec(item, tx);

      await tx.productPackaging.update({
        where: { PackagingID: spec.PackagingID },
        data: {
          IsRx: explicitIsRx,
          ...(mergedPackaging && typeof mergedPackaging === 'object'
            ? {
                PackageUnit: mergedPackaging.PackageUnit || item.Unit,
                CartonUnit: mergedPackaging.CartonUnit || 'Thùng',
                BoxesPerCarton: Number(mergedPackaging.BoxesPerCarton) || 20,
                BlisterUnit: mergedPackaging.BlisterUnit ?? spec.BlisterUnit,
                BlistersPerPackage:
                  mergedPackaging.BlistersPerPackage !== undefined
                    ? Number(mergedPackaging.BlistersPerPackage) || null
                    : spec.BlistersPerPackage,
                SmallestUnit: mergedPackaging.SmallestUnit || spec.SmallestUnit,
                UnitsPerPackage: Math.max(
                  1,
                  Number(mergedPackaging.UnitsPerPackage) || spec.UnitsPerPackage
                ),
                UnitsPerBlister:
                  mergedPackaging.UnitsPerBlister !== undefined
                    ? Number(mergedPackaging.UnitsPerBlister) || null
                    : spec.UnitsPerBlister,
                WholesalePrice:
                  mergedPackaging.WholesalePrice !== undefined && mergedPackaging.WholesalePrice !== null
                    ? Number(mergedPackaging.WholesalePrice)
                    : spec.WholesalePrice,
                MinWholesaleQty: Math.max(1, Number(mergedPackaging.MinWholesaleQty) || 10),
                AllowFractionalSale:
                  mergedPackaging.AllowFractionalSale !== undefined
                    ? Boolean(mergedPackaging.AllowFractionalSale)
                    : spec.AllowFractionalSale,
              }
            : {}),
        },
      });
      return item;
    });
    void this.triggerSearchSync();
    return (await this.getById(created.ProductID)) || created;
  }

  /**
   * 3. Cập nhật sản phẩm thuốc kèm quy cách đóng gói & bắt buộc xác nhận phân loại IsRx khi gửi thông tin đóng gói
   */
  public async update(id: number, data: ProductUpdateDTO, packagingInput?: Record<string, any>): Promise<Product> {
    const { packaging: dtoPackaging, ...productData } = data;
    const mergedPackaging = packagingInput ?? dtoPackaging;

    const existing = await prisma.product.findUnique({
      where: { ProductID: id },
      include: { packaging: true },
    });
    if (!existing) {
      const err = new Error(`Không tìm thấy sản phẩm #${id}`) as Error & { statusCode?: number; code?: string };
      err.statusCode = 404;
      err.code = 'PRODUCT_NOT_FOUND';
      throw err;
    }

    const mergedCandidate = {
      ProductName: productData.ProductName ?? existing.ProductName,
      ProductType: productData.ProductType ?? existing.ProductType,
      Description: productData.Description ?? existing.Description,
    };

    let validatedIsRx: boolean | undefined;
    if (mergedPackaging && typeof mergedPackaging === 'object') {
      validatedIsRx = this.assertRxClassificationConfirmed(mergedCandidate, mergedPackaging);
    } else if (
      (productData.ProductName !== undefined || productData.ProductType !== undefined) &&
      !existing.packaging?.IsRx &&
      deriveIsRxClassification(mergedCandidate)
    ) {
      const err = new Error(
        'Tên hoặc nhóm thuốc mới có dấu hiệu là thuốc kê đơn (Rx). Vui lòng xác nhận rõ phân loại kê đơn (Rx / OTC).'
      ) as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = 'RX_CLASSIFICATION_REQUIRED';
      throw err;
    }

    const updated = await prisma.product.update({
      where: { ProductID: id },
      data: productData,
    });
    const spec = await packagingService.getOrCreatePackagingSpec(updated);
    if (mergedPackaging && typeof mergedPackaging === 'object') {
      await prisma.productPackaging.update({
        where: { PackagingID: spec.PackagingID },
        data: {
          PackageUnit: mergedPackaging.PackageUnit || updated.Unit,
          CartonUnit: mergedPackaging.CartonUnit || spec.CartonUnit || 'Thùng',
          BoxesPerCarton: Number(mergedPackaging.BoxesPerCarton) || spec.BoxesPerCarton || 20,
          BlisterUnit:
            mergedPackaging.BlisterUnit !== undefined ? mergedPackaging.BlisterUnit : spec.BlisterUnit,
          BlistersPerPackage:
            mergedPackaging.BlistersPerPackage !== undefined
              ? Number(mergedPackaging.BlistersPerPackage) || null
              : spec.BlistersPerPackage,
          SmallestUnit: mergedPackaging.SmallestUnit || spec.SmallestUnit,
          UnitsPerPackage: Math.max(1, Number(mergedPackaging.UnitsPerPackage) || spec.UnitsPerPackage),
          UnitsPerBlister:
            mergedPackaging.UnitsPerBlister !== undefined
              ? Number(mergedPackaging.UnitsPerBlister) || null
              : spec.UnitsPerBlister,
          WholesalePrice:
            mergedPackaging.WholesalePrice !== undefined && mergedPackaging.WholesalePrice !== null
              ? Number(mergedPackaging.WholesalePrice)
              : spec.WholesalePrice,
          MinWholesaleQty: Math.max(1, Number(mergedPackaging.MinWholesaleQty) || spec.MinWholesaleQty || 10),
          AllowFractionalSale:
            mergedPackaging.AllowFractionalSale !== undefined
              ? Boolean(mergedPackaging.AllowFractionalSale)
              : spec.AllowFractionalSale,
          IsRx: validatedIsRx !== undefined ? validatedIsRx : spec.IsRx,
        },
      });
    }
    void this.triggerSearchSync();
    return (await this.getById(updated.ProductID)) || updated;
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
   * Nhân bản quy cách đóng gói từ sản phẩm gốc (reset tồn dở dang/giữ kho = 0, tắt xuất bản tạm thời)
   */
  private async copyPackagingForCloneTx(
    tx: Prisma.TransactionClient,
    sourceId: number,
    cloned: Product
  ): Promise<void> {
    const srcPkg = await tx.productPackaging.findUnique({ where: { ProductID: sourceId } });
    if (srcPkg) {
      await tx.productPackaging.create({
        data: {
          ProductID: cloned.ProductID,
          PackageUnit: srcPkg.PackageUnit,
          CartonUnit: srcPkg.CartonUnit,
          BoxesPerCarton: srcPkg.BoxesPerCarton,
          BlisterUnit: srcPkg.BlisterUnit,
          BlistersPerPackage: srcPkg.BlistersPerPackage,
          SmallestUnit: srcPkg.SmallestUnit,
          UnitsPerPackage: srcPkg.UnitsPerPackage,
          UnitsPerBlister: srcPkg.UnitsPerBlister,
          LooseUnits: 0,
          ReservedBaseQty: 0,
          ReservedLooseUnits: 0,
          AllowFractionalSale: srcPkg.AllowFractionalSale,
          WholesalePrice: srcPkg.WholesalePrice,
          MinWholesaleQty: srcPkg.MinWholesaleQty,
          IsRx: srcPkg.IsRx,
          IsPublished: false,
          IsTestOnly: srcPkg.IsTestOnly,
        },
      });
      return;
    }
    const spec = await packagingService.getOrCreatePackagingSpec(cloned, tx);
    await tx.productPackaging.update({
      where: { PackagingID: spec.PackagingID },
      data: { IsPublished: false },
    });
  }

  /**
   * 7. Sao chép 1 bản ghi (Clone 1 record) — Tồn kho bản sao luôn = 0; nhập hàng phải qua Phiếu nhập kho (P1)
   */
  public async cloneOne(id: number): Promise<Product> {
    const source = await this.getById(id);
    if (!source) {
      throw new Error(`Không tìm thấy sản phẩm có mã #${id} để sao chép`);
    }

    const cloned = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ProductName: `${source.ProductName} (Bản sao)`,
          PathImage: source.PathImage,
          ProductType: source.ProductType,
          Quantity: 0,
          Unit: source.Unit,
          Price: source.Price,
          Description: source.Description,
        },
      });
      await this.copyPackagingForCloneTx(tx, source.ProductID, created);
      return created;
    });

    void this.triggerSearchSync();
    return (await this.getById(cloned.ProductID)) || cloned;
  }

  /**
   * 8. Sao chép nhiều bản ghi từ ô Checkbox — Tồn kho mọi bản sao = 0 (P1)
   */
  public async bulkClone(ids: number[]): Promise<Product[]> {
    const sources = await prisma.product.findMany({
      where: { ProductID: { in: ids } },
    });

    if (sources.length === 0) {
      throw new Error('Không tìm thấy các bản ghi được chọn để sao chép');
    }

    const clonedItems = await prisma.$transaction(async (tx) => {
      const results: Product[] = [];
      for (const src of sources) {
        const created = await tx.product.create({
          data: {
            ProductName: `${src.ProductName} (Bản sao)`,
            PathImage: src.PathImage,
            ProductType: src.ProductType,
            Quantity: 0,
            Unit: src.Unit,
            Price: src.Price,
            Description: src.Description,
          },
        });
        await this.copyPackagingForCloneTx(tx, src.ProductID, created);
        results.push(created);
      }
      return results;
    });

    void this.triggerSearchSync();
    return clonedItems;
  }

  /**
   * 9. Import hàng loạt bản ghi từ file Excel / JSON / XML trong 1 Transaction
   */
  public async importBatch(items: ProductInputDTO[]): Promise<number> {
    const created = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const item of items) {
        const { InitialBatchNumber, InitialExpiryDate, packaging, ...productData } = item;
        const prod = await tx.product.create({ data: productData });
        await this.createInitialVerifiedLotTx(tx, prod, InitialBatchNumber, InitialExpiryDate);
        const spec = await packagingService.getOrCreatePackagingSpec(prod, tx);
        await tx.productPackaging.update({
          where: { PackagingID: spec.PackagingID },
          data: { IsRx: Boolean(packaging?.IsRx) },
        });
        count += 1;
      }
      return count;
    });
    void this.triggerSearchSync();
    return created;
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
