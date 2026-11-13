import crypto from 'crypto';
import { prisma } from '../src/config/prisma';
import { derivePackagingSpec } from '../src/services/packaging.service';

function hashTrackingToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function main() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const allProducts = await prisma.product.findMany({
    include: {
      packaging: true,
      stockLots: {
        where: { Status: 'ACTIVE', RemainingQuantity: { gt: 0 }, ExpiryDate: { gte: todayStr } },
      },
      _count: {
        select: {
          invoiceItems: true,
          onlineOrderItems: true,
          purchaseOrderItems: true,
        },
      },
    },
    orderBy: { ProductID: 'asc' },
  });

  let deletedTestProducts = 0;
  let hiddenTestProducts = 0;
  let createdPackaging = 0;
  let reconciledLots = 0;

  for (const product of allProducts) {
    const isLeakedTest =
      product.ProductID >= 38 ||
      /Kiểm Thử|Release Once|Chống Can Thiệp|Race Condition/i.test(product.ProductName);

    if (isLeakedTest) {
      const refCount =
        product._count.invoiceItems +
        product._count.onlineOrderItems +
        product._count.purchaseOrderItems;

      if (refCount === 0) {
        await prisma.product.delete({ where: { ProductID: product.ProductID } });
        deletedTestProducts += 1;
        continue;
      }

      const spec = derivePackagingSpec(product);
      await prisma.productPackaging.upsert({
        where: { ProductID: product.ProductID },
        create: {
          ProductID: product.ProductID,
          PackageUnit: spec.PackageUnit,
          BlisterUnit: spec.BlisterUnit,
          BlistersPerPackage: spec.BlistersPerPackage,
          SmallestUnit: spec.SmallestUnit,
          UnitsPerPackage: spec.UnitsPerPackage,
          UnitsPerBlister: spec.UnitsPerBlister,
          AllowFractionalSale: spec.AllowFractionalSale,
          LooseUnits: product.packaging?.LooseUnits ?? 0,
          WholesalePrice: Math.round(product.Price * 0.85),
          MinWholesaleQty: 10,
          IsPublished: false,
          IsTestOnly: true,
        },
        update: {
          IsPublished: false,
          IsTestOnly: true,
        },
      });
      hiddenTestProducts += 1;
      continue;
    }

    if (!product.packaging) {
      const spec = derivePackagingSpec(product);
      await prisma.productPackaging.create({
        data: {
          ProductID: product.ProductID,
          PackageUnit: spec.PackageUnit,
          BlisterUnit: spec.BlisterUnit,
          BlistersPerPackage: spec.BlistersPerPackage,
          SmallestUnit: spec.SmallestUnit,
          UnitsPerPackage: spec.UnitsPerPackage,
          UnitsPerBlister: spec.UnitsPerBlister,
          AllowFractionalSale: spec.AllowFractionalSale,
          LooseUnits: 0,
          WholesalePrice: Math.round(product.Price * 0.85),
          MinWholesaleQty: 10,
          IsPublished: true,
          IsTestOnly: false,
        },
      });
      createdPackaging += 1;
    } else if (!product.packaging.IsPublished || product.packaging.IsTestOnly) {
      await prisma.productPackaging.update({
        where: { ProductID: product.ProductID },
        data: { IsPublished: true, IsTestOnly: false },
      });
    }

    const activeLotSum = product.stockLots.reduce((acc, lot) => acc + lot.RemainingQuantity, 0);
    if (product.Quantity > activeLotSum) {
      const deficit = product.Quantity - activeLotSum;
      await prisma.stockLot.create({
        data: {
          ProductID: product.ProductID,
          BatchNumber: `LOT-INIT-2026-${String(product.ProductID).padStart(3, '0')}`,
          ExpiryDate: '2028-12-31',
          InitialQuantity: deficit,
          RemainingQuantity: deficit,
          ImportPrice: Math.round(product.Price * 0.72),
          BranchCode: 'CS1-GPP',
          Status: 'ACTIVE',
        },
      });
      reconciledLots += 1;
    }
  }

  // Hash plaintext TrackingToken if any exist and enforce TTL
  const legacyOrders = await prisma.onlineOrder.findMany({
    where: {
      OR: [{ TrackingTokenHash: null }, { TrackingToken: { not: null } }],
    },
    select: {
      OrderID: true,
      OrderCode: true,
      TrackingToken: true,
      TrackingTokenHash: true,
      TrackingExpiresAt: true,
      CreateDate: true,
    },
  });

  let hashedOrders = 0;
  for (const order of legacyOrders) {
    const rawToken = order.TrackingToken;
    const tokenHash =
      order.TrackingTokenHash ||
      (rawToken ? hashTrackingToken(rawToken) : hashTrackingToken(`${order.OrderCode}-${order.OrderID}`));
    const expiresAt =
      order.TrackingExpiresAt || new Date(order.CreateDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.onlineOrder.update({
      where: { OrderID: order.OrderID },
      data: {
        TrackingTokenHash: tokenHash,
        TrackingToken: null,
        TrackingExpiresAt: expiresAt,
      },
    });
    hashedOrders += 1;
  }

  console.log(
    JSON.stringify(
      {
        deletedTestProducts,
        hiddenTestProducts,
        createdPackaging,
        reconciledLots,
        hashedOrders,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error('Reconcile failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
