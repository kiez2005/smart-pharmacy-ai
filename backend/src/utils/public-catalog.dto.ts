import { prisma } from '../config/prisma';
import { deriveIsRxClassification } from '../services/packaging.service';

export interface PublicCatalogProductDto {
  ProductID: number;
  ProductName: string;
  PathImage: string;
  ProductType: string;
  Unit: string;
  Price: number;
  Description: string;
  IsRx: boolean;
  requiresPrescription: boolean;
  StockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  InStock: boolean;
  MaxOrderQty: number;
  packaging: {
    PackageUnit: string;
    BlisterUnit: string | null;
    BlistersPerPackage: number | null;
    SmallestUnit: string;
    UnitsPerPackage: number;
    UnitsPerBlister: number | null;
    AllowFractionalSale: boolean;
    IsRx: boolean;
  } | null;
}

type ProductRowWithPublicMeta = {
  ProductID: number;
  ProductName: string;
  PathImage: string;
  ProductType: string;
  Quantity: number;
  Unit: string;
  Price: number;
  Description: string;
  packaging: {
    PackageUnit: string;
    BlisterUnit: string | null;
    BlistersPerPackage: number | null;
    SmallestUnit: string;
    UnitsPerPackage: number;
    UnitsPerBlister: number | null;
    AllowFractionalSale: boolean;
    ReservedBaseQty: number;
    IsRx: boolean;
  } | null;
  stockLots: Array<{ RemainingQuantity: number }>;
};

/**
 * Chuẩn hóa Product DB thành Public DTO theo chuẩn bảo mật A6/U4:
 * TUYỆT ĐỐI KHÔNG phát lộ TotalStock, Quantity thô, stockLots, giá sỉ B2B hoặc Version.
 */
export function mapToPublicCatalogItem(p: ProductRowWithPublicMeta): PublicCatalogProductDto {
  const reservedBase = p.packaging?.ReservedBaseQty || 0;
  const physicalAvailable = Math.max(0, p.Quantity - reservedBase);
  const lotSum = p.stockLots.reduce((sum, l) => sum + l.RemainingQuantity, 0);
  const sellableBoxes = Math.max(0, Math.min(physicalAvailable, lotSum));
  const stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' =
    sellableBoxes <= 0 ? 'OUT_OF_STOCK' : sellableBoxes <= 15 ? 'LOW_STOCK' : 'IN_STOCK';
  const isRx = p.packaging ? Boolean(p.packaging.IsRx) : deriveIsRxClassification(p);

  return {
    ProductID: p.ProductID,
    ProductName: p.ProductName,
    PathImage: p.PathImage,
    ProductType: p.ProductType,
    Unit: p.Unit,
    Price: p.Price,
    Description: p.Description,
    IsRx: isRx,
    requiresPrescription: isRx,
    StockStatus: stockStatus,
    InStock: sellableBoxes > 0,
    MaxOrderQty: sellableBoxes > 0 ? Math.min(sellableBoxes, 20) : 0,
    packaging: p.packaging
      ? {
          PackageUnit: p.packaging.PackageUnit,
          BlisterUnit: p.packaging.BlisterUnit,
          BlistersPerPackage: p.packaging.BlistersPerPackage,
          SmallestUnit: p.packaging.SmallestUnit,
          UnitsPerPackage: p.packaging.UnitsPerPackage,
          UnitsPerBlister: p.packaging.UnitsPerBlister,
          AllowFractionalSale: p.packaging.AllowFractionalSale,
          IsRx: p.packaging.IsRx,
        }
      : null,
  };
}

/**
 * Truy vấn & lọc chuẩn công khai danh sách ProductID (chỉ lấy IsPublished=true, IsTestOnly=false, còn hàng bán được).
 */
export async function fetchSanitizedPublicProductsByIds(
  productIds: number[],
  onlyInStock = true
): Promise<PublicCatalogProductDto[]> {
  const cleanIds = Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (cleanIds.length === 0) return [];

  const todayIso = new Date().toISOString().slice(0, 10);
  const rows = await prisma.product.findMany({
    where: {
      ProductID: { in: cleanIds },
      packaging: {
        is: {
          IsPublished: true,
          IsTestOnly: false,
        },
      },
    },
    include: {
      packaging: {
        select: {
          PackageUnit: true,
          BlisterUnit: true,
          BlistersPerPackage: true,
          SmallestUnit: true,
          UnitsPerPackage: true,
          UnitsPerBlister: true,
          AllowFractionalSale: true,
          ReservedBaseQty: true,
          IsRx: true,
        },
      },
      stockLots: {
        where: {
          Status: 'ACTIVE',
          RemainingQuantity: { gt: 0 },
          ExpiryDate: { gte: todayIso },
        },
        select: { RemainingQuantity: true },
      },
    },
  });

  const rankMap = new Map(cleanIds.map((id, idx) => [id, idx]));
  return rows
    .sort((a, b) => (rankMap.get(a.ProductID) ?? 9999) - (rankMap.get(b.ProductID) ?? 9999))
    .map(mapToPublicCatalogItem)
    .filter((item) => !onlyInStock || item.InStock);
}
