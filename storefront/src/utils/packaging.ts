import { Product, UnitMode } from '../types';

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function getPackagingSpec(product: Product) {
  const pkg = product.packaging;
  const isBox = product.Unit === 'Hộp';
  return {
    PackageUnit: pkg?.PackageUnit || product.Unit,
    BlisterUnit: pkg?.BlisterUnit ?? (isBox ? 'Vỉ' : null),
    BlistersPerPackage: pkg?.BlistersPerPackage ?? (isBox ? 10 : null),
    SmallestUnit: pkg?.SmallestUnit || (isBox ? 'Viên' : product.Unit),
    UnitsPerPackage: pkg?.UnitsPerPackage || (isBox ? 100 : 1),
    UnitsPerBlister: pkg?.UnitsPerBlister ?? (isBox ? 10 : null),
    AllowFractionalSale: pkg?.AllowFractionalSale ?? isBox,
  };
}

export function getAvailableBaseStock(product: Product): number {
  if (typeof product.MaxOrderQty === 'number') {
    return product.InStock === false ? 0 : Math.max(0, product.MaxOrderQty);
  }
  if (typeof product.AvailableQuantity === 'number') {
    return Math.max(0, product.AvailableQuantity);
  }
  if (typeof product.Quantity === 'number') {
    return Math.max(0, product.Quantity);
  }
  return product.InStock ? 20 : 0;
}

export function getMaxStockForMode(product: Product, mode: UnitMode = 'BASE'): number {
  if (product.InStock === false) return 0;
  const spec = getPackagingSpec(product);
  const availBase = getAvailableBaseStock(product);
  const totalSmallest = availBase * spec.UnitsPerPackage;

  if (mode === 'BLISTER' && spec.UnitsPerBlister && spec.UnitsPerBlister > 0) {
    return Math.floor(totalSmallest / spec.UnitsPerBlister);
  }
  if (mode === 'PILL') {
    return totalSmallest;
  }
  return availBase;
}

export function getUnitName(product: Product, mode: UnitMode = 'BASE'): string {
  const spec = getPackagingSpec(product);
  if (mode === 'BLISTER') return spec.BlisterUnit || 'Vỉ';
  if (mode === 'PILL') return spec.SmallestUnit || 'Viên';
  return spec.PackageUnit || product.Unit;
}

export function getUnitLabel(product: Product, mode: UnitMode = 'BASE'): string {
  const spec = getPackagingSpec(product);
  if (mode === 'BLISTER') {
    return `${spec.BlisterUnit || 'Vỉ'} (${spec.UnitsPerBlister || 10} ${spec.SmallestUnit})`;
  }
  if (mode === 'PILL') return `${spec.SmallestUnit} lẻ`;
  return spec.PackageUnit;
}

export function getEffectivePrice(product: Product, mode: UnitMode = 'BASE'): number {
  const spec = getPackagingSpec(product);
  if (mode === 'BLISTER' && spec.BlistersPerPackage && spec.BlistersPerPackage > 1) {
    return Math.max(1000, Math.round(product.Price / spec.BlistersPerPackage));
  }
  if (mode === 'PILL' && spec.UnitsPerPackage > 1) {
    return Math.max(500, Math.round(product.Price / spec.UnitsPerPackage));
  }
  return product.Price;
}

export function getStockStatusBadgeInfo(product: Product): {
  label: string;
  className: string;
} {
  const status = product.StockStatus || (product.InStock === false ? 'OUT_OF_STOCK' : 'IN_STOCK');
  if (status === 'OUT_OF_STOCK') {
    return {
      label: 'Tạm hết hàng',
      className: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (status === 'LOW_STOCK') {
    return {
      label: 'Sắp hết hàng',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    label: 'Còn hàng',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
}
