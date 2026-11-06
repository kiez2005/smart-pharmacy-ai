import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('>>> Bắt đầu di trú dữ liệu hóa đơn cũ (Legacy Invoices Migration)...');
  const items = await prisma.invoiceItem.findMany({
    where: { BaseQuantityDeducted: null },
    include: { product: true },
  });

  console.log(`Tìm thấy ${items.length} dòng hóa đơn cũ cần xử lý.`);
  let migratedCount = 0;
  let unverifiedCount = 0;

  for (const item of items) {
    if (!item.product) continue;

    // Nếu đơn giá khớp với giá gốc sản phẩm (bán nguyên hộp / nguyên gói gốc)
    const priceRatio = Math.abs(item.UnitPrice - item.product.Price) / (item.product.Price || 1);
    if (priceRatio < 0.05) {
      await prisma.invoiceItem.update({
        where: { ItemID: item.ItemID },
        data: {
          Unit: item.product.Unit,
          BaseQuantityDeducted: item.Quantity,
          LooseUnitsDeducted: 0,
        },
      });
      migratedCount++;
    } else {
      // Đơn bán lẻ cũ có đơn giá khác giá gốc -> Giữ null để Dược sĩ xác nhận khi hủy
      unverifiedCount++;
    }
  }

  console.log(
    `>>> Di trú hoàn tất! Đã xác minh tự động: ${migratedCount} dòng. Đánh dấu cần duyệt thủ công khi hủy: ${unverifiedCount} dòng.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
