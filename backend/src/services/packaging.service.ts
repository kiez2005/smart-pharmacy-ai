import { PrismaClient, Product, ProductPackaging } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/prisma';

export interface UnitOption {
  unit: string;
  label: string;
  conversionToSmallest: number;
  pricePerUnit: number;
  isPackageUnit: boolean;
  isBlister: boolean;
  isSmallestUnit: boolean;
}

export interface UnitCalculationResult {
  unitPrice: number;
  packagesToOpen: number;
  newLooseUnits: number;
  looseUnitsUsedFromOpenBox: number;
  totalSmallestUnitsDeducted: number;
  requestedUnit: string;
  effectiveOrderType: 'RETAIL' | 'WHOLESALE';
}

/**
 * Tự động nội suy quy cách đóng gói dựa trên tên và quy chuẩn dược học
 */
export const derivePackagingSpec = (
  product: Product
): {
  PackageUnit: string;
  BlisterUnit: string | null;
  BlistersPerPackage: number | null;
  SmallestUnit: string;
  UnitsPerPackage: number;
  UnitsPerBlister: number | null;
  AllowFractionalSale: boolean;
} => {
  const name = product.ProductName.toLowerCase();
  const unit = product.Unit;

  // Dạng Chai, Lọ siro / Dung dịch / Nước nhỏ mắt / Xịt mũi (Không bán lẻ)
  if (
    unit === 'Chai' ||
    unit === 'Lọ' && (name.includes('siro') || name.includes('xịt') || name.includes('nhỏ mắt') || name.includes('nước muối'))
  ) {
    return {
      PackageUnit: unit,
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: unit,
      UnitsPerPackage: 1,
      UnitsPerBlister: null,
      AllowFractionalSale: false,
    };
  }

  // Dạng Tuýp bôi / Dụng cụ y tế (Nhiệt kế)
  if (unit === 'Tuýp' || name.includes('nhiệt kế') || name.includes('dụng cụ')) {
    if (name.includes('berocca') || name.includes('viên sủi')) {
      return {
        PackageUnit: 'Tuýp',
        BlisterUnit: null,
        BlistersPerPackage: null,
        SmallestUnit: 'Viên',
        UnitsPerPackage: 10,
        UnitsPerBlister: null,
        AllowFractionalSale: true,
      };
    }
    return {
      PackageUnit: unit,
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: unit,
      UnitsPerPackage: 1,
      UnitsPerBlister: null,
      AllowFractionalSale: false,
    };
  }

  // Dạng Gói / Ống uống
  if (name.includes('smecta')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Gói',
      UnitsPerPackage: 30,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('phosphalugel')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Gói',
      UnitsPerPackage: 26,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('gaviscon')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Gói',
      UnitsPerPackage: 24,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('enterogermina')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Ống',
      UnitsPerPackage: 20,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('corbiere')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Ống',
      UnitsPerPackage: 30,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('oresol')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Gói',
      UnitsPerPackage: 50,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }

  // Dạng Lọ chứa nhiều viên (Berberin, Omega 3, Ginkgo)
  if (name.includes('berberin')) {
    return {
      PackageUnit: 'Lọ',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 100,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('omega-3') || name.includes('orihiro')) {
    return {
      PackageUnit: 'Lọ',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 180,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('ginkgo')) {
    return {
      PackageUnit: 'Lọ',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 300,
      UnitsPerBlister: null,
      AllowFractionalSale: true,
    };
  }

  // Dạng Hộp có Vỉ x Viên chuẩn
  if (name.includes('decolgen')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: 'Vỉ',
      BlistersPerPackage: 25,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 100,
      UnitsPerBlister: 4,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('panadol')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: 'Vỉ',
      BlistersPerPackage: 15,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 180,
      UnitsPerBlister: 12,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('efferalgan')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: 'Vỉ',
      BlistersPerPackage: 4,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 16,
      UnitsPerBlister: 4,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('tiffy')) {
    return {
      PackageUnit: 'Vỉ',
      BlisterUnit: null,
      BlistersPerPackage: null,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 4,
      UnitsPerBlister: 4,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('strepsils')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: 'Vỉ',
      BlistersPerPackage: 12,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 24,
      UnitsPerBlister: 2,
      AllowFractionalSale: true,
    };
  }
  if (name.includes('augmentin')) {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: 'Vỉ',
      BlistersPerPackage: 2,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 14,
      UnitsPerBlister: 7,
      AllowFractionalSale: true,
    };
  }

  // Mặc định cho thuốc Hộp dạng vỉ (10 vỉ x 10 viên = 100 viên/hộp)
  if (unit === 'Hộp') {
    return {
      PackageUnit: 'Hộp',
      BlisterUnit: 'Vỉ',
      BlistersPerPackage: 10,
      SmallestUnit: 'Viên',
      UnitsPerPackage: 100,
      UnitsPerBlister: 10,
      AllowFractionalSale: true,
    };
  }

  // Mặc định không bán lẻ
  return {
    PackageUnit: unit,
    BlisterUnit: null,
    BlistersPerPackage: null,
    SmallestUnit: unit,
    UnitsPerPackage: 1,
    UnitsPerBlister: null,
    AllowFractionalSale: false,
  };
};

export class PackagingService {
  /**
   * Lấy hoặc tự động khởi tạo bản ghi ProductPackaging trong database
   */
  public async getOrCreatePackagingSpec(
    product: Product,
    tx: any = defaultPrisma
  ): Promise<ProductPackaging> {
    let spec = await tx.productPackaging.findUnique({
      where: { ProductID: product.ProductID },
    });

    const defaultWholesalePrice = Math.max(
      1000,
      Math.round((product.Price * 0.85) / 500) * 500
    );

    if (!spec) {
      const derived = derivePackagingSpec(product);
      spec = await tx.productPackaging.create({
        data: {
          ProductID: product.ProductID,
          ...derived,
          CartonUnit: 'Thùng',
          BoxesPerCarton: 20,
          WholesalePrice: defaultWholesalePrice,
          MinWholesaleQty: 10,
          LooseUnits: 0,
        },
      });
    } else if (spec.WholesalePrice === null || spec.WholesalePrice === undefined) {
      spec = await tx.productPackaging.update({
        where: { PackagingID: spec.PackagingID },
        data: {
          WholesalePrice: defaultWholesalePrice,
          CartonUnit: spec.CartonUnit || 'Thùng',
          BoxesPerCarton: spec.BoxesPerCarton || 20,
          MinWholesaleQty: spec.MinWholesaleQty || 10,
        },
      });
    }

    return spec;
  }

  /**
   * Lấy danh sách các đơn vị bán hợp lệ kèm đơn giá quy chuẩn tương ứng (Bán lẻ GPP & Bán buôn GDP)
   */
  public getAllowedUnits(
    product: Product,
    spec: ProductPackaging,
    orderType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
  ): UnitOption[] {
    const wholesaleBoxPrice =
      spec.WholesalePrice ||
      Math.max(1000, Math.round((product.Price * 0.85) / 500) * 500);
    const boxesPerCarton = spec.BoxesPerCarton || 20;
    const cartonUnitName = spec.CartonUnit || 'Thùng';
    const cartonPrice =
      Math.round((wholesaleBoxPrice * boxesPerCarton * 0.96) / 1000) * 1000;

    const options: UnitOption[] = [
      {
        unit: spec.PackageUnit,
        label:
          orderType === 'WHOLESALE'
            ? `${spec.PackageUnit} (Giá sỉ B2B)`
            : `${spec.PackageUnit} (Nguyên bao gói)`,
        conversionToSmallest: spec.UnitsPerPackage,
        pricePerUnit: orderType === 'WHOLESALE' ? wholesaleBoxPrice : product.Price,
        isPackageUnit: true,
        isBlister: false,
        isSmallestUnit: spec.UnitsPerPackage === 1,
      },
      {
        unit: cartonUnitName,
        label: `${cartonUnitName} (${boxesPerCarton} ${spec.PackageUnit} - Sỉ nguyên kiện)`,
        conversionToSmallest: boxesPerCarton * spec.UnitsPerPackage,
        pricePerUnit: cartonPrice,
        isPackageUnit: false,
        isBlister: false,
        isSmallestUnit: false,
      },
    ];

    if (spec.AllowFractionalSale && orderType !== 'WHOLESALE') {
      if (spec.BlisterUnit && spec.BlistersPerPackage && spec.BlistersPerPackage > 1) {
        const blisterPrice = Math.max(
          1000,
          Math.round(product.Price / spec.BlistersPerPackage)
        );
        options.push({
          unit: spec.BlisterUnit,
          label: `${spec.BlisterUnit} (${spec.UnitsPerBlister || 1} ${spec.SmallestUnit})`,
          conversionToSmallest: spec.UnitsPerBlister || 1,
          pricePerUnit: blisterPrice,
          isPackageUnit: false,
          isBlister: true,
          isSmallestUnit: false,
        });
      }

      if (
        spec.SmallestUnit &&
        spec.SmallestUnit !== spec.PackageUnit &&
        spec.UnitsPerPackage > 1
      ) {
        const unitPrice = Math.max(
          500,
          Math.round(product.Price / spec.UnitsPerPackage)
        );
        options.push({
          unit: spec.SmallestUnit,
          label: `${spec.SmallestUnit} lẻ`,
          conversionToSmallest: 1,
          pricePerUnit: unitPrice,
          isPackageUnit: false,
          isBlister: false,
          isSmallestUnit: true,
        });
      }
    }

    return options;
  }

  /**
   * Tính toán chính xác giá bán và lượng trừ tồn kho (hộp nguyên + viên lẻ dở dang + thùng bán buôn)
   * Có tính đến lượng hàng đang được giữ tạm (ReservedBaseQty / ReservedLooseUnits) và kiểm tra điều kiện giá sỉ server-side
   */
  public async calculateDeductionAndPrice(
    product: Product,
    requestedUnit: string | undefined,
    requestedQty: number,
    tx: any = defaultPrisma,
    orderType: 'RETAIL' | 'WHOLESALE' = 'RETAIL',
    options?: {
      isVerifiedWholesaleCustomer?: boolean;
      ignoreReservations?: boolean;
    }
  ): Promise<UnitCalculationResult> {
    const spec = await this.getOrCreatePackagingSpec(product, tx);
    const cartonUnitName = spec.CartonUnit || 'Thùng';
    const boxesPerCarton = spec.BoxesPerCarton || 20;
    const minWholesaleQty = spec.MinWholesaleQty || 10;

    const isCartonRequested =
      (requestedUnit || '').trim().toLowerCase() === cartonUnitName.toLowerCase();

    // Server-side kiểm tra điều kiện áp dụng Bảng giá Bán Buôn B2B (Issue 22):
    // Chỉ áp giá WHOLESALE nếu: (1) Khách thuộc nhóm WHOLESALE đã xác thực, hoặc (2) Mua theo Thùng, hoặc (3) Số lượng >= MinWholesaleQty
    const qualifiesForWholesale =
      orderType === 'WHOLESALE' &&
      (Boolean(options?.isVerifiedWholesaleCustomer) ||
        isCartonRequested ||
        requestedQty >= minWholesaleQty);

    const effectiveOrderType: 'RETAIL' | 'WHOLESALE' = qualifiesForWholesale
      ? 'WHOLESALE'
      : 'RETAIL';

    const unitOptions = this.getAllowedUnits(product, spec, effectiveOrderType);

    // Xác định đơn vị được chọn
    const matchedOption =
      unitOptions.find(
        (opt) => opt.unit.toLowerCase() === (requestedUnit || '').toLowerCase()
      ) || unitOptions[0]; // Mặc định là PackageUnit

    const reservedBoxes = options?.ignoreReservations ? 0 : spec.ReservedBaseQty || 0;
    const reservedLoose = options?.ignoreReservations ? 0 : spec.ReservedLooseUnits || 0;
    const availableBoxes = Math.max(0, product.Quantity - reservedBoxes);
    const availableLoose = Math.max(0, spec.LooseUnits - reservedLoose);

    // Nếu mua theo Thùng hoặc mua nguyên Hộp
    const isCarton = matchedOption.unit.toLowerCase() === cartonUnitName.toLowerCase();
    if (isCarton || matchedOption.isPackageUnit) {
      const boxesNeeded = isCarton ? requestedQty * boxesPerCarton : requestedQty;
      if (availableBoxes < boxesNeeded) {
        const err: any = new Error(
          `Thuốc "${product.ProductName}" không đủ tồn kho khả dụng! Yêu cầu: ${requestedQty} ${matchedOption.unit} (${boxesNeeded} ${spec.PackageUnit}), khả dụng hiện tại: ${availableBoxes} ${spec.PackageUnit} (Tồn vật lý: ${product.Quantity}, Đang giữ tạm: ${reservedBoxes}).`
        );
        err.code = 'OUT_OF_STOCK';
        err.statusCode = 409;
        throw err;
      }

      // Tự động áp dụng giá sỉ nếu mua từ MinWholesaleQty hộp trở lên ngay cả ở chế độ lẻ
      let finalUnitPrice = matchedOption.pricePerUnit;
      if (
        matchedOption.isPackageUnit &&
        effectiveOrderType === 'RETAIL' &&
        requestedQty >= minWholesaleQty
      ) {
        finalUnitPrice =
          spec.WholesalePrice ||
          Math.max(1000, Math.round((product.Price * 0.85) / 500) * 500);
      }

      return {
        unitPrice: finalUnitPrice,
        packagesToOpen: boxesNeeded,
        newLooseUnits: spec.LooseUnits,
        looseUnitsUsedFromOpenBox: 0,
        totalSmallestUnitsDeducted: boxesNeeded * spec.UnitsPerPackage,
        requestedUnit: matchedOption.unit,
        effectiveOrderType:
          isCarton || requestedQty >= minWholesaleQty ? 'WHOLESALE' : effectiveOrderType,
      };
    }

    const unitPrice = matchedOption.pricePerUnit;
    const totalSmallestUnitsNeeded = requestedQty * matchedOption.conversionToSmallest;

    // Tổng số đơn vị nhỏ nhất khả dụng = (Hộp khả dụng * UnitsPerPackage) + Thuốc lẻ khả dụng
    const totalSmallestUnitsAvailable =
      availableBoxes * spec.UnitsPerPackage + availableLoose;

    if (totalSmallestUnitsNeeded > totalSmallestUnitsAvailable) {
      const err: any = new Error(
        `Thuốc "${product.ProductName}" không đủ tồn kho khả dụng! Yêu cầu: ${requestedQty} ${matchedOption.unit} (tương đương ${totalSmallestUnitsNeeded} ${spec.SmallestUnit}), nhưng khả dụng chỉ còn ${totalSmallestUnitsAvailable} ${spec.SmallestUnit}!`
      );
      err.code = 'OUT_OF_STOCK';
      err.statusCode = 409;
      throw err;
    }

    let packagesToOpen = 0;
    let looseUnitsUsedFromOpenBox = 0;
    let newLooseUnits = spec.LooseUnits;

    // Nếu thuốc lẻ khả dụng đủ dùng -> trừ trực tiếp từ thuốc lẻ, không mở hộp mới
    if (availableLoose >= totalSmallestUnitsNeeded) {
      looseUnitsUsedFromOpenBox = totalSmallestUnitsNeeded;
      newLooseUnits = spec.LooseUnits - totalSmallestUnitsNeeded;
      packagesToOpen = 0;
    } else {
      // Thiếu thuốc lẻ -> dùng hết phần lẻ khả dụng và mở thêm hộp nguyên
      looseUnitsUsedFromOpenBox = availableLoose;
      const deficit = totalSmallestUnitsNeeded - availableLoose;
      packagesToOpen = Math.ceil(deficit / spec.UnitsPerPackage);

      if (availableBoxes < packagesToOpen) {
        const err: any = new Error(
          `Thuốc "${product.ProductName}" không đủ hộp nguyên khả dụng để mở bán lẻ!`
        );
        err.code = 'OUT_OF_STOCK';
        err.statusCode = 409;
        throw err;
      }

      const producedFromBoxes = packagesToOpen * spec.UnitsPerPackage;
      newLooseUnits = spec.LooseUnits - availableLoose + (producedFromBoxes - deficit);
    }

    return {
      unitPrice,
      packagesToOpen,
      newLooseUnits,
      looseUnitsUsedFromOpenBox,
      totalSmallestUnitsDeducted: totalSmallestUnitsNeeded,
      requestedUnit: matchedOption.unit,
      effectiveOrderType: 'RETAIL',
    };
  }

  /**
   * Phân bổ lô tồn kho theo chuẩn FEFO (First Expired, First Out) — chặn lô hết hạn / thu hồi
   */
  public async allocateFefoLot(
    productId: number,
    packagesNeeded: number,
    tx: any = defaultPrisma
  ): Promise<{ batchNumber: string; expiryDate: string; lotId: number | null }> {
    const todayIso = new Date().toISOString().slice(0, 10);

    // Tìm các lô đang ACTIVE, chưa hết hạn và còn tồn > 0, sắp xếp HSD gần nhất trước (FEFO)
    const activeLots = await tx.stockLot.findMany({
      where: {
        ProductID: productId,
        Status: 'ACTIVE',
        RemainingQuantity: { gt: 0 },
        ExpiryDate: { gte: todayIso },
      },
      orderBy: [{ ExpiryDate: 'asc' }, { LotID: 'asc' }],
    });

    if (activeLots.length === 0) {
      // Nếu sản phẩm chưa có bản ghi trong StockLot nhưng có PurchaseOrderItem -> tự động đồng bộ lô chuẩn từ PO hoặc tạo lô gốc
      const product = await tx.product.findUnique({ where: { ProductID: productId } });
      const latestPoItem = await tx.purchaseOrderItem.findFirst({
        where: { ProductID: productId },
        orderBy: { OrderItemID: 'desc' },
      });
      const defaultBatch = latestPoItem?.BatchNumber || `LOT-26${String(productId).padStart(3, '0')}`;
      const defaultExpiry =
        latestPoItem?.ExpiryDate && latestPoItem.ExpiryDate >= todayIso
          ? latestPoItem.ExpiryDate
          : '2028-12-31';
      const initialQty = Math.max(product?.Quantity || 0, packagesNeeded);

      const createdLot = await tx.stockLot.create({
        data: {
          ProductID: productId,
          BatchNumber: defaultBatch,
          ExpiryDate: defaultExpiry,
          InitialQuantity: initialQty,
          RemainingQuantity: Math.max(0, initialQty - packagesNeeded),
          ImportPrice: latestPoItem?.ImportPrice || Math.round((product?.Price || 10000) * 0.7),
          Status: 'ACTIVE',
        },
      });
      return {
        batchNumber: createdLot.BatchNumber,
        expiryDate: createdLot.ExpiryDate,
        lotId: createdLot.LotID,
      };
    }

    let remainingToAllocate = packagesNeeded;
    const primaryLot = activeLots[0];

    for (const lot of activeLots) {
      if (remainingToAllocate <= 0) break;
      const take = Math.min(lot.RemainingQuantity, remainingToAllocate);
      if (take > 0) {
        const nextRemaining = lot.RemainingQuantity - take;
        await tx.stockLot.update({
          where: { LotID: lot.LotID },
          data: {
            RemainingQuantity: nextRemaining,
            Status: nextRemaining === 0 ? 'DEPLETED' : 'ACTIVE',
          },
        });
        remainingToAllocate -= take;
      }
    }

    return {
      batchNumber: primaryLot.BatchNumber,
      expiryDate: primaryLot.ExpiryDate,
      lotId: primaryLot.LotID,
    };
  }

  /**
   * Trừ kho nguyên tử (Atomic Conditional Update + Optimistic Concurrency Version)
   * Đảm bảo nếu 2 giao dịch cùng tranh hộp cuối, chỉ 1 giao dịch thành công, giao dịch còn lại nhận lỗi 409 OUT_OF_STOCK
   */
  public async deductStockAtomically(
    productId: number,
    requestedUnit: string | undefined,
    requestedQty: number,
    tx: any,
    options?: {
      orderType?: 'RETAIL' | 'WHOLESALE';
      isVerifiedWholesaleCustomer?: boolean;
    }
  ): Promise<
    UnitCalculationResult & {
      batchNumber: string;
      expiryDate: string;
      lotId: number | null;
    }
  > {
    const freshProduct = await tx.product.findUnique({
      where: { ProductID: productId },
    });
    if (!freshProduct) {
      throw new Error(`Không tìm thấy dược phẩm có mã #${productId}`);
    }

    const spec = await this.getOrCreatePackagingSpec(freshProduct, tx);
    const calc = await this.calculateDeductionAndPrice(
      freshProduct,
      requestedUnit,
      requestedQty,
      tx,
      options?.orderType || 'RETAIL',
      { isVerifiedWholesaleCustomer: options?.isVerifiedWholesaleCustomer }
    );

    // 1. Atomic check-and-update trên ProductPackaging với khóa Version
    const pkgUpdated = await tx.productPackaging.updateMany({
      where: {
        PackagingID: spec.PackagingID,
        Version: spec.Version,
      },
      data: {
        LooseUnits: calc.newLooseUnits,
        Version: { increment: 1 },
      },
    });

    if (pkgUpdated.count !== 1) {
      const err: any = new Error(
        `Xung đột cập nhật tồn kho đồng thời cho "${freshProduct.ProductName}". Vui lòng thử lại!`
      );
      err.code = 'CONCURRENCY_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // 2. Atomic check-and-decrement trên Product.Quantity (đảm bảo sau khi trừ vẫn >= ReservedBaseQty)
    if (calc.packagesToOpen > 0) {
      const minRequiredPhysical = calc.packagesToOpen + (spec.ReservedBaseQty || 0);
      const prodUpdated = await tx.product.updateMany({
        where: {
          ProductID: freshProduct.ProductID,
          Quantity: { gte: minRequiredPhysical },
        },
        data: {
          Quantity: { decrement: calc.packagesToOpen },
        },
      });

      if (prodUpdated.count !== 1) {
        const err: any = new Error(
          `Thuốc "${freshProduct.ProductName}" vừa hết tồn kho khả dụng do có đơn khác chốt trước!`
        );
        err.code = 'OUT_OF_STOCK';
        err.statusCode = 409;
        throw err;
      }
    }

    const lotAlloc = await this.allocateFefoLot(
      freshProduct.ProductID,
      calc.packagesToOpen,
      tx
    );

    return {
      ...calc,
      ...lotAlloc,
    };
  }

  /**
   * Giữ kho tạm có thời hạn (Inventory Reservation) cho đơn Online đang chờ Dược sĩ duyệt
   * Nếu không đủ tồn khả dụng hoặc thua cuộc khi tranh hộp cuối -> ném lỗi 409 OUT_OF_STOCK để rollback toàn bộ đơn
   */
  public async reserveStockAtomically(
    productId: number,
    requestedUnit: string | undefined,
    requestedQty: number,
    tx: any,
    options?: {
      orderType?: 'RETAIL' | 'WHOLESALE';
      isVerifiedWholesaleCustomer?: boolean;
    }
  ): Promise<
    UnitCalculationResult & {
      baseQtyToReserve: number;
      looseQtyToReserve: number;
    }
  > {
    const freshProduct = await tx.product.findUnique({
      where: { ProductID: productId },
    });
    if (!freshProduct) {
      throw new Error(`Không tìm thấy dược phẩm #${productId}`);
    }

    const spec = await this.getOrCreatePackagingSpec(freshProduct, tx);
    const calc = await this.calculateDeductionAndPrice(
      freshProduct,
      requestedUnit,
      requestedQty,
      tx,
      options?.orderType || 'RETAIL',
      { isVerifiedWholesaleCustomer: options?.isVerifiedWholesaleCustomer }
    );

    const baseQtyToReserve = calc.packagesToOpen;
    const looseQtyToReserve = calc.looseUnitsUsedFromOpenBox;

    // Kiểm tra lại tồn vật lý >= tồn đã giữ + tồn cần giữ mới, cập nhật nguyên tử với Version
    const pkgUpdated = await tx.productPackaging.updateMany({
      where: {
        PackagingID: spec.PackagingID,
        Version: spec.Version,
        ReservedBaseQty: spec.ReservedBaseQty,
        ReservedLooseUnits: spec.ReservedLooseUnits,
      },
      data: {
        ReservedBaseQty: { increment: baseQtyToReserve },
        ReservedLooseUnits: { increment: looseQtyToReserve },
        Version: { increment: 1 },
      },
    });

    if (
      pkgUpdated.count !== 1 ||
      freshProduct.Quantity < (spec.ReservedBaseQty || 0) + baseQtyToReserve
    ) {
      const err: any = new Error(
        `Thuốc "${freshProduct.ProductName}" vừa được khách hàng khác giữ hộp cuối cùng! Vui lòng giảm số lượng hoặc đăng ký chờ hàng.`
      );
      err.code = 'OUT_OF_STOCK';
      err.statusCode = 409;
      throw err;
    }

    return {
      ...calc,
      baseQtyToReserve,
      looseQtyToReserve,
    };
  }

  /**
   * Giải phóng giữ kho đúng 1 lần duy nhất (khi đơn bị Từ chối / Hủy / Hết hạn)
   */
  public async releaseReservationOnce(
    reservationId: number,
    targetStatus: 'RELEASED' | 'EXPIRED',
    tx: any = defaultPrisma,
    actor?: { userId?: number | null; userName?: string }
  ): Promise<boolean> {
    const reservation = await tx.inventoryReservation.findUnique({
      where: { ReservationID: reservationId },
    });
    if (!reservation || reservation.Status !== 'ACTIVE') {
      return false;
    }

    // Chuyển trạng thái nguyên tử từ ACTIVE -> targetStatus
    const updated = await tx.inventoryReservation.updateMany({
      where: {
        ReservationID: reservationId,
        Status: 'ACTIVE',
      },
      data: {
        Status: targetStatus,
        ReleasedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      return false;
    }

    const spec = await tx.productPackaging.findUnique({
      where: { ProductID: reservation.ProductID },
    });
    if (spec) {
      await tx.productPackaging.update({
        where: { PackagingID: spec.PackagingID },
        data: {
          ReservedBaseQty: Math.max(0, (spec.ReservedBaseQty || 0) - reservation.BaseQtyReserved),
          ReservedLooseUnits: Math.max(
            0,
            (spec.ReservedLooseUnits || 0) - reservation.LooseQtyReserved
          ),
          Version: { increment: 1 },
        },
      });
    }

    await tx.stockMovement.upsert({
      where: {
        SourceType_SourceID_LineItemID_MovementType: {
          SourceType: 'ONLINE_ORDER',
          SourceID: reservation.OrderID,
          LineItemID: reservation.OrderItemID,
          MovementType: 'RELEASE',
        },
      },
      update: {},
      create: {
        ProductID: reservation.ProductID,
        SourceType: 'ONLINE_ORDER',
        SourceID: reservation.OrderID,
        LineItemID: reservation.OrderItemID,
        MovementType: 'RELEASE',
        Unit: reservation.Unit,
        Quantity: reservation.Quantity,
        BaseQtyDelta: reservation.BaseQtyReserved,
        LooseQtyDelta: reservation.LooseQtyReserved,
        ActorUserID: actor?.userId || null,
        ActorName: actor?.userName || 'SYSTEM_TTL',
        Note: `Giải phóng giữ kho (${targetStatus})`,
      },
    });

    return true;
  }

  /**
   * Tự động quét và giải phóng các giữ kho đã quá hạn (TTL Expired)
   */
  public async releaseExpiredReservations(tx: any = defaultPrisma): Promise<number> {
    const now = new Date();
    const expiredList = await tx.inventoryReservation.findMany({
      where: {
        Status: 'ACTIVE',
        ExpiresAt: { lte: now },
      },
    });

    if (expiredList.length === 0) return 0;

    let releasedCount = 0;
    const affectedOrderIds = new Set<number>();

    for (const resv of expiredList) {
      const ok = await this.releaseReservationOnce(resv.ReservationID, 'EXPIRED', tx);
      if (ok) {
        releasedCount++;
        affectedOrderIds.add(resv.OrderID);
      }
    }

    for (const orderId of affectedOrderIds) {
      await tx.onlineOrder.updateMany({
        where: {
          OrderID: orderId,
          Status: 'PENDING_REVIEW',
        },
        data: {
          Status: 'EXPIRED',
          RejectCancelReason: 'Hết thời hạn giữ kho tạm (nhân viên chưa xác nhận kịp trong thời gian quy định)',
        },
      });
    }

    return releasedCount;
  }

  /**
   * Chuyển giữ kho (ACTIVE Reservation) thành Xuất kho thực tế khi Dược sĩ duyệt đơn Online (CONFIRMED)
   */
  public async consumeReservationAtomically(
    reservationId: number,
    tx: any,
    actor?: { userId?: number | null; userName?: string }
  ): Promise<{
    baseQuantityDeducted: number;
    looseUnitsDeducted: number;
    batchNumber: string;
    expiryDate: string;
    lotId: number | null;
  }> {
    const reservation = await tx.inventoryReservation.findUnique({
      where: { ReservationID: reservationId },
    });
    if (!reservation || reservation.Status !== 'ACTIVE') {
      const err: any = new Error(
        `Giữ kho #${reservationId} không còn hiệu lực (Trạng thái: ${reservation?.Status || 'N/A'})!`
      );
      err.code = 'RESERVATION_EXPIRED';
      err.statusCode = 409;
      throw err;
    }

    if (reservation.ExpiresAt <= new Date()) {
      await this.releaseReservationOnce(reservationId, 'EXPIRED', tx, actor);
      const err: any = new Error('Thời hạn giữ kho của đơn hàng đã hết hạn!');
      err.code = 'RESERVATION_EXPIRED';
      err.statusCode = 409;
      throw err;
    }

    const updatedResv = await tx.inventoryReservation.updateMany({
      where: {
        ReservationID: reservationId,
        Status: 'ACTIVE',
      },
      data: {
        Status: 'CONSUMED',
        ReleasedAt: new Date(),
      },
    });

    if (updatedResv.count !== 1) {
      throw new Error('Không thể chuyển trạng thái giữ kho (đã được xử lý bởi tiến trình khác).');
    }

    const product = await tx.product.findUnique({
      where: { ProductID: reservation.ProductID },
    });
    if (!product) {
      throw new Error(`Không tìm thấy thuốc #${reservation.ProductID}`);
    }
    const spec = await this.getOrCreatePackagingSpec(product, tx);

    // Giải phóng bộ đếm Reserved trước rồi trừ tồn thực tế
    await tx.productPackaging.update({
      where: { PackagingID: spec.PackagingID },
      data: {
        ReservedBaseQty: Math.max(0, (spec.ReservedBaseQty || 0) - reservation.BaseQtyReserved),
        ReservedLooseUnits: Math.max(
          0,
          (spec.ReservedLooseUnits || 0) - reservation.LooseQtyReserved
        ),
      },
    });

    // Tính lại số viên lẻ mới khi mở hộp / trừ lẻ
    const refreshedProduct = await tx.product.findUnique({
      where: { ProductID: reservation.ProductID },
    });
    const calc = await this.calculateDeductionAndPrice(
      refreshedProduct,
      reservation.Unit,
      reservation.Quantity,
      tx,
      'RETAIL',
      { ignoreReservations: true }
    );

    await tx.product.update({
      where: { ProductID: product.ProductID },
      data: {
        Quantity: { decrement: calc.packagesToOpen },
      },
    });

    await tx.productPackaging.update({
      where: { PackagingID: spec.PackagingID },
      data: {
        LooseUnits: calc.newLooseUnits,
        Version: { increment: 1 },
      },
    });

    const lotAlloc = await this.allocateFefoLot(
      product.ProductID,
      calc.packagesToOpen,
      tx
    );

    return {
      baseQuantityDeducted: calc.packagesToOpen,
      looseUnitsDeducted: calc.totalSmallestUnitsDeducted,
      ...lotAlloc,
    };
  }

  /**
   * Hoàn trả tồn kho chính xác khi hủy hóa đơn (Repack hộp dở dang nếu đủ quy cách + trả lại đúng Lô FEFO)
   */
  public async restoreStockOnRefund(
    productOrInput: Product,
    packagesDeducted: number,
    totalSmallestUnitsDeducted: number,
    tx: any = defaultPrisma,
    lotOptions?: { lotId?: number | null; batchNumber?: string | null }
  ): Promise<{ restoredPackages: number; newLooseUnits: number }> {
    const freshProduct =
      (await tx.product.findUnique({ where: { ProductID: productOrInput.ProductID } })) ||
      productOrInput;
    const spec = await this.getOrCreatePackagingSpec(freshProduct, tx);

    // Cộng trả lại thuốc lẻ
    let currentLoose = spec.LooseUnits + totalSmallestUnitsDeducted;
    let currentPackages = freshProduct.Quantity;

    if (spec.UnitsPerPackage <= 1) {
      currentPackages += packagesDeducted;
      currentLoose = 0;
    } else if (currentLoose >= spec.UnitsPerPackage) {
      // Nếu thuốc lẻ tích lũy đủ thành các hộp nguyên -> Tự động đóng gói lại
      const fullBoxesFormed = Math.floor(currentLoose / spec.UnitsPerPackage);
      currentPackages += fullBoxesFormed;
      currentLoose = currentLoose % spec.UnitsPerPackage;
    }

    const restoredPackages = Math.max(0, currentPackages - freshProduct.Quantity);

    // Cập nhật Product và ProductPackaging kèm tăng Version
    await tx.product.update({
      where: { ProductID: freshProduct.ProductID },
      data: { Quantity: currentPackages },
    });

    await tx.productPackaging.update({
      where: { PackagingID: spec.PackagingID },
      data: {
        LooseUnits: currentLoose,
        Version: { increment: 1 },
      },
    });

    // Hoàn trả số lượng hộp nguyên về đúng Lô (StockLot) đã xuất
    if (restoredPackages > 0) {
      let targetLot = null;
      if (lotOptions?.lotId) {
        targetLot = await tx.stockLot.findUnique({ where: { LotID: lotOptions.lotId } });
      }
      if (!targetLot && lotOptions?.batchNumber) {
        targetLot = await tx.stockLot.findFirst({
          where: {
            ProductID: freshProduct.ProductID,
            BatchNumber: lotOptions.batchNumber,
          },
        });
      }
      if (targetLot) {
        await tx.stockLot.update({
          where: { LotID: targetLot.LotID },
          data: {
            RemainingQuantity: { increment: restoredPackages },
            Status: 'ACTIVE',
          },
        });
      }
    }

    return {
      restoredPackages,
      newLooseUnits: currentLoose,
    };
  }
}

export const packagingService = new PackagingService();
