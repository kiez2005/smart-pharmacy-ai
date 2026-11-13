import { Product, UnitMode } from '../types';

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function getPackagingSpec(product: Product) {
  const pkg = product.packaging;
  const isBox = product.Unit === 'Hộp';
  return {
    PackageUnit: pkg?.PackageUnit || product.Unit,
    CartonUnit: pkg?.CartonUnit || 'Thùng',
    BoxesPerCarton: pkg?.BoxesPerCarton || 20,
    BlisterUnit: pkg?.BlisterUnit ?? (isBox ? 'Vỉ' : null),
    BlistersPerPackage: pkg?.BlistersPerPackage ?? (isBox ? 10 : null),
    SmallestUnit: pkg?.SmallestUnit || (isBox ? 'Viên' : product.Unit),
    UnitsPerPackage: pkg?.UnitsPerPackage || (isBox ? 100 : 1),
    UnitsPerBlister: pkg?.UnitsPerBlister ?? (isBox ? 10 : null),
    LooseUnits: pkg?.LooseUnits || 0,
    ReservedBaseQty: pkg?.ReservedBaseQty || 0,
    ReservedLooseUnits: pkg?.ReservedLooseUnits || 0,
    AllowFractionalSale: pkg?.AllowFractionalSale ?? isBox,
    WholesalePrice: pkg?.WholesalePrice ?? Math.round((product.Price * 0.88) / 500) * 500,
    MinWholesaleQty: pkg?.MinWholesaleQty ?? 10,
  };
}

export function getAvailableBaseStock(product: Product): number {
  if (typeof product.AvailableQuantity === 'number') {
    return Math.max(0, product.AvailableQuantity);
  }
  const spec = getPackagingSpec(product);
  return Math.max(0, product.Quantity - spec.ReservedBaseQty);
}

export function getMaxStockForMode(product: Product, mode: UnitMode = 'BASE'): number {
  const spec = getPackagingSpec(product);
  const availBase = getAvailableBaseStock(product);
  const availLoose = Math.max(0, spec.LooseUnits - spec.ReservedLooseUnits);

  if (mode === 'CARTON') {
    return Math.floor(availBase / spec.BoxesPerCarton);
  }
  const totalSmallest = availBase * spec.UnitsPerPackage + availLoose;
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
  if (mode === 'CARTON') return spec.CartonUnit || 'Thùng';
  if (mode === 'BLISTER') return spec.BlisterUnit || 'Vỉ';
  if (mode === 'PILL') return spec.SmallestUnit || 'Viên';
  return spec.PackageUnit || product.Unit;
}

export function getUnitLabel(product: Product, mode: UnitMode = 'BASE'): string {
  const spec = getPackagingSpec(product);
  if (mode === 'CARTON') return `${spec.CartonUnit} (${spec.BoxesPerCarton} ${product.Unit})`;
  if (mode === 'BLISTER')
    return `${spec.BlisterUnit || 'Vỉ'} (${spec.UnitsPerBlister || 10} ${spec.SmallestUnit})`;
  if (mode === 'PILL') return `${spec.SmallestUnit} lẻ`;
  return spec.PackageUnit;
}

export function getEffectivePrice(
  product: Product,
  mode: UnitMode = 'BASE',
  qty: number = 1,
  buyerMode: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
): number {
  const spec = getPackagingSpec(product);
  if (mode === 'CARTON') {
    return Math.round(spec.WholesalePrice * spec.BoxesPerCarton * 0.96);
  }
  if (mode === 'BLISTER' && spec.BlistersPerPackage && spec.BlistersPerPackage > 1) {
    return Math.max(1000, Math.round(product.Price / spec.BlistersPerPackage));
  }
  if (mode === 'PILL' && spec.UnitsPerPackage > 1) {
    return Math.max(500, Math.round(product.Price / spec.UnitsPerPackage));
  }
  if (buyerMode === 'WHOLESALE' || qty >= spec.MinWholesaleQty) {
    return spec.WholesalePrice;
  }
  return product.Price;
}
