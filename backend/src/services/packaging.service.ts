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
  totalSmallestUnitsDeducted: number;
  requestedUnit: string;
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
   */
  public async calculateDeductionAndPrice(
    product: Product,
    requestedUnit: string | undefined,
    requestedQty: number,
    tx: any = defaultPrisma,
    orderType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
  ): Promise<UnitCalculationResult> {
    const spec = await this.getOrCreatePackagingSpec(product, tx);
    const options = this.getAllowedUnits(product, spec, orderType);
    const cartonUnitName = spec.CartonUnit || 'Thùng';
    const boxesPerCarton = spec.BoxesPerCarton || 20;

    // Xác định đơn vị được chọn
    const matchedOption =
      options.find((opt) => opt.unit.toLowerCase() === (requestedUnit || '').toLowerCase()) ||
      options[0]; // Mặc định là PackageUnit

    // Nếu mua theo Thùng hoặc chế độ Bán Buôn (WHOLESALE) hoặc mua nguyên Hộp
    const isCarton = matchedOption.unit.toLowerCase() === cartonUnitName.toLowerCase();
    if (isCarton || matchedOption.isPackageUnit) {
      const boxesNeeded = isCarton ? requestedQty * boxesPerCarton : requestedQty;
      if (product.Quantity < boxesNeeded) {
        throw new Error(
          `Thuốc "${product.ProductName}" không đủ tồn kho nguyên hộp! Yêu cầu: ${requestedQty} ${matchedOption.unit} (${boxesNeeded} ${spec.PackageUnit}), nhưng kho chỉ còn ${product.Quantity} ${spec.PackageUnit}!`
        );
      }

      // Tự động áp dụng giá sỉ nếu mua từ MinWholesaleQty hộp trở lên ngay cả ở chế độ lẻ
      let finalUnitPrice = matchedOption.pricePerUnit;
      if (
        matchedOption.isPackageUnit &&
        orderType === 'RETAIL' &&
        requestedQty >= (spec.MinWholesaleQty || 10)
      ) {
        finalUnitPrice =
          spec.WholesalePrice ||
          Math.max(1000, Math.round((product.Price * 0.85) / 500) * 500);
      }

      return {
        unitPrice: finalUnitPrice,
        packagesToOpen: boxesNeeded,
        newLooseUnits: spec.LooseUnits,
        totalSmallestUnitsDeducted: boxesNeeded * spec.UnitsPerPackage,
        requestedUnit: matchedOption.unit,
      };
    }

    const unitPrice = matchedOption.pricePerUnit;
    const totalSmallestUnitsNeeded = requestedQty * matchedOption.conversionToSmallest;

    // Tổng số đơn vị nhỏ nhất hiện có trong kho = (Hộp nguyên * UnitsPerPackage) + Thuốc lẻ dở dang
    const totalSmallestUnitsAvailable =
      product.Quantity * spec.UnitsPerPackage + spec.LooseUnits;

    if (totalSmallestUnitsNeeded > totalSmallestUnitsAvailable) {
      throw new Error(
        `Thuốc "${product.ProductName}" không đủ tồn kho! Yêu cầu: ${requestedQty} ${matchedOption.unit} (tương đương ${totalSmallestUnitsNeeded} ${spec.SmallestUnit}), nhưng toàn kho chỉ còn tổng cộng ${totalSmallestUnitsAvailable} ${spec.SmallestUnit}!`
      );
    }

    let packagesToOpen = 0;
    let newLooseUnits = spec.LooseUnits;

    // Nếu thuốc lẻ dở dang đủ dùng -> trừ trực tiếp từ thuốc lẻ, không mở hộp mới
    if (newLooseUnits >= totalSmallestUnitsNeeded) {
      newLooseUnits -= totalSmallestUnitsNeeded;
      packagesToOpen = 0;
    } else {
      // Thiếu thuốc lẻ -> cần mở thêm hộp nguyên
      const deficit = totalSmallestUnitsNeeded - newLooseUnits;
      packagesToOpen = Math.ceil(deficit / spec.UnitsPerPackage);

      if (product.Quantity < packagesToOpen) {
        throw new Error(
          `Thuốc "${product.ProductName}" không đủ hộp nguyên để mở bán lẻ!`
        );
      }

      const producedFromBoxes = packagesToOpen * spec.UnitsPerPackage;
      newLooseUnits = newLooseUnits + producedFromBoxes - totalSmallestUnitsNeeded;
    }

    return {
      unitPrice,
      packagesToOpen,
      newLooseUnits,
      totalSmallestUnitsDeducted: totalSmallestUnitsNeeded,
      requestedUnit: matchedOption.unit,
    };
  }

  /**
   * Hoàn trả tồn kho chính xác khi hủy hóa đơn (Repack hộp dở dang nếu đủ quy cách)
   */
  public async restoreStockOnRefund(
    product: Product,
    packagesDeducted: number,
    totalSmallestUnitsDeducted: number,
    tx: any = defaultPrisma
  ): Promise<{ restoredPackages: number; newLooseUnits: number }> {
    const spec = await this.getOrCreatePackagingSpec(product, tx);

    // Cộng trả lại thuốc lẻ
    let currentLoose = spec.LooseUnits + totalSmallestUnitsDeducted;
    let currentPackages = product.Quantity;

    if (spec.UnitsPerPackage <= 1) {
      currentPackages += packagesDeducted;
      currentLoose = 0;
    } else if (currentLoose >= spec.UnitsPerPackage) {
      // Nếu thuốc lẻ tích lũy đủ thành các hộp nguyên -> Tự động đóng gói lại
      const fullBoxesFormed = Math.floor(currentLoose / spec.UnitsPerPackage);
      currentPackages += fullBoxesFormed;
      currentLoose = currentLoose % spec.UnitsPerPackage;
    }

    // Cập nhật Product và ProductPackaging
    await tx.product.update({
      where: { ProductID: product.ProductID },
      data: { Quantity: currentPackages },
    });

    await tx.productPackaging.update({
      where: { PackagingID: spec.PackagingID },
      data: { LooseUnits: currentLoose },
    });

    return {
      restoredPackages: currentPackages - product.Quantity,
      newLooseUnits: currentLoose,
    };
  }
}

export const packagingService = new PackagingService();
