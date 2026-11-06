import { PrismaClient } from '@prisma/client';
import { derivePackagingSpec } from '../src/services/packaging.service';

const prisma = new PrismaClient();

async function main() {
  console.log('>>> Khởi tạo bản ghi quy cách đóng gói (ProductPackaging) cho danh mục sản phẩm...');
  const products = await prisma.product.findMany();

  let createdCount = 0;
  for (const product of products) {
    const existing = await prisma.productPackaging.findUnique({
      where: { ProductID: product.ProductID },
    });

    if (!existing) {
      const specData = derivePackagingSpec(product);
      await prisma.productPackaging.create({
        data: {
          ProductID: product.ProductID,
          ...specData,
          LooseUnits: 0,
        },
      });
      createdCount++;
    }
  }

  console.log(`>>> Hoàn tất! Đã khởi tạo quy cách cho ${createdCount} sản phẩm (Tổng sản phẩm: ${products.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
