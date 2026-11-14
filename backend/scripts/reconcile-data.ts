import crypto from 'crypto';
import fs from 'fs';
import { prisma, resolveSqliteDatabaseUrl } from '../src/config/prisma';
import {
  deriveIsRxClassification,
  derivePackagingSpec,
} from '../src/services/packaging.service';

interface ReconcileCliOptions {
  cleanupTests: boolean;
  apply: boolean;
  backfillRx: boolean;
  explicitTestIds: Set<number>;
}

function parseCliOptions(argv: string[]): ReconcileCliOptions {
  const args = new Set(argv);
  const testIdsArg = argv.find((a) => a.startsWith('--test-ids='));
  const rawIds = [
    ...(testIdsArg ? testIdsArg.slice('--test-ids='.length).split(',') : []),
    ...(process.env.RECONCILE_TEST_IDS ? process.env.RECONCILE_TEST_IDS.split(',') : []),
  ];
  const explicitTestIds = new Set(
    rawIds
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  );

  return {
    cleanupTests: args.has('--cleanup-tests') || explicitTestIds.size > 0,
    apply: args.has('--apply'),
    backfillRx: args.has('--backfill-rx'),
    explicitTestIds,
  };
}

function createDatabaseBackupIfFile(): string | null {
  const dbUrl = resolveSqliteDatabaseUrl(process.env.DATABASE_URL);
  if (!dbUrl.startsWith('file:')) return null;
  const dbPath = dbUrl.slice('file:'.length);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Không tìm thấy tệp CSDL SQLite để sao lưu: ${dbPath}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.bak-reconcile-${stamp}`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function hashTrackingToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function main() {
  const opts = parseCliOptions(process.argv.slice(2));
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
          stockMovements: true,
          reservations: true,
        },
      },
    },
    orderBy: { ProductID: 'asc' },
  });

  // Chỉ nhận diện dữ liệu test theo cờ IsTestOnly đã gắn tường minh hoặc danh sách --test-ids khai báo rõ.
  // Tuyệt đối không dùng ngưỡng ProductID >= N hoặc regex tên thuốc để tránh xóa/ẩn nhầm thuốc thật.
  const testCandidates = allProducts
    .filter(
      (product) =>
        Boolean(product.packaging?.IsTestOnly) || opts.explicitTestIds.has(product.ProductID)
    )
    .map((product) => {
      const refCount =
        product._count.invoiceItems +
        product._count.onlineOrderItems +
        product._count.purchaseOrderItems +
        product._count.reservations;
      const action: 'DELETE' | 'HIDE' = refCount === 0 ? 'DELETE' : 'HIDE';
      return {
        product,
        refCount,
        action,
      };
    });

  if (opts.cleanupTests && !opts.apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'DRY_RUN_PREVIEW',
          message:
            'Chế độ xem trước (chưa thay đổi dữ liệu). Thêm cờ --apply để tự động backup CSDL và thực thi dọn dữ liệu thử nghiệm.',
          candidatesCount: testCandidates.length,
          candidates: testCandidates.map((c) => ({
            ProductID: c.product.ProductID,
            ProductName: c.product.ProductName,
            IsTestOnlyFlag: Boolean(c.product.packaging?.IsTestOnly),
            explicitIdMatch: opts.explicitTestIds.has(c.product.ProductID),
            refCount: c.refCount,
            plannedAction: c.action,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  let backupPath: string | null = null;
  let deletedTestProducts = 0;
  let hiddenTestProducts = 0;
  let createdPackaging = 0;
  let backfilledRx = 0;
  const reconciledLots = 0;

  if (opts.cleanupTests && opts.apply && testCandidates.length > 0) {
    backupPath = createDatabaseBackupIfFile();
    for (const candidate of testCandidates) {
      const { product, action } = candidate;
      if (action === 'DELETE') {
        await prisma.$transaction(async (tx) => {
          await tx.stockMovement.deleteMany({ where: { ProductID: product.ProductID } });
          await tx.stockLot.deleteMany({ where: { ProductID: product.ProductID } });
          await tx.productPackaging.deleteMany({ where: { ProductID: product.ProductID } });
          await tx.product.delete({ where: { ProductID: product.ProductID } });
        });
        deletedTestProducts += 1;
      } else {
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
            IsRx: deriveIsRxClassification(product),
            IsPublished: false,
            IsTestOnly: true,
          },
          update: {
            IsPublished: false,
            IsTestOnly: true,
          },
        });
        hiddenTestProducts += 1;
      }
    }
  }

  // Khởi tạo ProductPackaging còn thiếu cho sản phẩm thật (không bao giờ xóa/ẩn sản phẩm thật)
  const testCandidateIds = new Set(testCandidates.map((c) => c.product.ProductID));
  for (const product of allProducts) {
    if (testCandidateIds.has(product.ProductID) || product.packaging?.IsTestOnly) {
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
          IsRx: deriveIsRxClassification(product),
          IsPublished: true,
          IsTestOnly: false,
        },
      });
      createdPackaging += 1;
    } else if (opts.backfillRx && !product.packaging.IsRx && deriveIsRxClassification(product)) {
      await prisma.productPackaging.update({
        where: { ProductID: product.ProductID },
        data: { IsRx: true },
      });
      backfilledRx += 1;
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
      (rawToken
        ? hashTrackingToken(rawToken)
        : hashTrackingToken(`${order.OrderCode}-${order.OrderID}`));
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
        mode: opts.cleanupTests ? 'CLEANUP_APPLIED' : 'SAFE_METADATA_RECONCILE',
        backupPath,
        deletedTestProducts,
        hiddenTestProducts,
        createdPackaging,
        backfilledRx,
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
