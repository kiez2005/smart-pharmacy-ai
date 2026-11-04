import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const sampleProducts = [
  {
    ProductName: 'Panadol Extra 500mg/65mg',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 150,
    Unit: 'Hộp',
    Price: 235000,
    Description: 'Hoạt chất: Paracetamol 500mg, Caffeine 65mg. Chỉ định: Hạ sốt, giảm đau đầu, đau nửa đầu, đau họng, đau răng, đau nhức cơ xương. Chống chỉ định: Suy gan nặng.'
  },
  {
    ProductName: 'Viên sủi Efferalgan 500mg UPSA',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 220,
    Unit: 'Hộp',
    Price: 56000,
    Description: 'Hoạt chất: Paracetamol 500mg dạng viên sủi hòa tan nhanh. Chỉ định: Điều trị sốt cao, cảm cúm, đau đầu, đau nhức mình mẩy. Liều dùng: Hòa tan 1 viên trong 200ml nước, cách nhau 4-6 giờ.'
  },
  {
    ProductName: 'Hapacol 250mg DHG Pharma',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 180,
    Unit: 'Hộp',
    Price: 38000,
    Description: 'Hoạt chất: Paracetamol 250mg bột sủi hương cam. Chỉ định: Hạ sốt nhanh cho trẻ em sốt do mọc răng, sốt siêu vi, cảm cúm, sau tiêm chủng.'
  },
  {
    ProductName: 'Ibuprofen 400mg Stada',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 45,
    Unit: 'Hộp',
    Price: 85000,
    Description: 'Hoạt chất: Ibuprofen 400mg (NSAID). Chỉ định: Kháng viêm, giảm đau khớp, đau bụng kinh, đau răng, hạ sốt. Lưu ý: Uống sau khi ăn no, thận trọng người viêm loét dạ dày.'
  },
  {
    ProductName: 'Tiffy Dey Thái Lan (Vỉ 4 viên)',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 340,
    Unit: 'Vỉ',
    Price: 8000,
    Description: 'Hoạt chất: Paracetamol 500mg, Chlorpheniramine 2mg, Phenylephrine 10mg. Chỉ định: Trị cảm cúm, sổ mũi, nghẹt mũi, hắt hơi, sốt nhẹ, đau đầu do thời tiết.'
  },
  {
    ProductName: 'Decolgen Forte (Hộp 25 vỉ)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 120,
    Unit: 'Hộp',
    Price: 175000,
    Description: 'Hoạt chất: Paracetamol 500mg, Phenylephrine HCl 10mg, Chlorpheniramine 2mg. Chỉ định: Điều trị cảm cúm, viêm mũi dị ứng, chảy nước mũi, ngạt mũi, đau đầu.'
  },
  {
    ProductName: 'Siro Ho Prospan Đức (Chai 100ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 85,
    Unit: 'Chai',
    Price: 78000,
    Description: 'Hoạt chất: Cao khô lá thường xuân tự nhiên. Chỉ định: Giảm ho khan, ho có đờm, làm dịu cổ họng, tiêu đờm, viêm phế quản cấp và mãn tính.'
  },
  {
    ProductName: 'Acemuc 200mg Sanofi (Tiêu đờm)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 140,
    Unit: 'Hộp',
    Price: 72000,
    Description: 'Hoạt chất: Acetylcysteine 200mg. Chỉ định: Tiêu chất nhầy, long đờm trong bệnh ho có đờm đặc, viêm phế quản, viêm xoang.'
  },
  {
    ProductName: 'Viên ngậm đau họng Strepsils Cool',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 260,
    Unit: 'Hộp',
    Price: 36000,
    Description: 'Hoạt chất: 2,4-Dichlorobenzyl alcohol, Amylmetacresol. Chỉ định: Kháng khuẩn vùng hầu họng, giảm đau rát họng, khản tiếng, ngứa cổ họng.'
  },
  {
    ProductName: 'Thuốc xịt mũi Otrivin 0.1% (10ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 35,
    Unit: 'Chai',
    Price: 62000,
    Description: 'Hoạt chất: Xylometazoline HCl 0.1%. Chỉ định: Giảm ngạt mũi nhanh do cảm lạnh, viêm mũi xoang, viêm mũi dị ứng. Không dùng quá 7 ngày liên tiếp.'
  },
  {
    ProductName: 'Augmentin 625mg GSK (Kháng sinh)',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 28,
    Unit: 'Hộp',
    Price: 245000,
    Description: 'Hoạt chất: Amoxicillin 500mg + Acid Clavulanic 125mg (Nhóm Penicillin). Chỉ định: Kháng sinh phổ rộng điều trị nhiễm khuẩn hô hấp, viêm amidan, viêm xoang, viêm tai giữa.'
  },
  {
    ProductName: 'Amoxicillin 500mg Domesco',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 130,
    Unit: 'Hộp',
    Price: 95000,
    Description: 'Hoạt chất: Amoxicillin trihydrate 500mg (Nhóm Penicillin). Chỉ định: Điều trị nhiễm khuẩn tai mũi họng, phế quản, da và mô mềm. Chống chỉ định: Dị ứng nhóm Penicillin.'
  },
  {
    ProductName: 'Azithromycin 500mg Pfizer (Zithromax)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 22,
    Unit: 'Hộp',
    Price: 135000,
    Description: 'Hoạt chất: Azithromycin 500mg (Nhóm Macrolid). Chỉ định: Kháng sinh điều trị viêm họng liên cầu, viêm phổi, viêm xoang cấp, nhiễm khuẩn da.'
  },
  {
    ProductName: 'Cefixim 200mg Traphaco',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 75,
    Unit: 'Hộp',
    Price: 118000,
    Description: 'Hoạt chất: Cefixime 200mg (Cephalosporin thế hệ 3). Chỉ định: Nhiễm khuẩn đường tiết niệu, viêm họng, viêm amidan, viêm phế quản cấp.'
  },
  {
    ProductName: 'Berberin Mộc Hoa Tràm 100mg (Lọ 100 viên)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 210,
    Unit: 'Chai',
    Price: 32000,
    Description: 'Hoạt chất: Berberin clorid 100mg, Mộc hương. Chỉ định: Điều trị tiêu chảy, đau bụng đi ngoài, hội chứng lỵ trực khuẩn, viêm ruột cấp tính.'
  },
  {
    ProductName: 'Bột pha uống Smecta Ipsen (Hộp 30 gói)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 115,
    Unit: 'Hộp',
    Price: 115000,
    Description: 'Hoạt chất: Diosmectite 3g. Chỉ định: Bao phủ niêm mạc tiêu hóa, điều trị tiêu chảy cấp và mãn tính, giảm đau dạ dày thực quản, đầy hơi.'
  },
  {
    ProductName: 'Sữa nghệ Phosphalugel (Hộp 26 gói)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 170,
    Unit: 'Hộp',
    Price: 108000,
    Description: 'Hoạt chất: Colloidal Aluminium Phosphate gel 20%. Chỉ định: Trung hòa axit dạ dày, giảm nhanh cơn đau thượng vị, ợ chua, ợ nóng, trào ngược dạ dày thực quản.'
  },
  {
    ProductName: 'Gaviscon Dual Action (Hộp 24 gói)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 95,
    Unit: 'Hộp',
    Price: 168000,
    Description: 'Hoạt chất: Sodium alginate, Sodium bicarbonate, Calcium carbonate. Chỉ định: Chống trào ngược dạ dày thực quản, giảm ợ nóng, khó tiêu sau bữa ăn.'
  },
  {
    ProductName: 'Men vi sinh Enterogermina 2 tỷ lợi khuẩn (Hộp 20 ống)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 145,
    Unit: 'Hộp',
    Price: 165000,
    Description: 'Hoạt chất: Bào tử Bacillus clausii 2 tỷ. Chỉ định: Cân bằng hệ vi sinh đường ruột, hỗ trợ điều trị rối loạn tiêu hóa, tiêu chảy do dùng kháng sinh.'
  },
  {
    ProductName: 'Oresol 245 bù nước & điện giải (Gói cam)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 500,
    Unit: 'Gói',
    Price: 3500,
    Description: 'Hoạt chất: Glucose khan, Natri clorid, Kali clorid, Natri citrat. Chỉ định: Bù nước và chất điện giải khi bị tiêu chảy, sốt cao đổ mồ hôi nhiều, nôn mửa.'
  },
  {
    ProductName: 'Omeprazol 20mg DHG (Ức chế axit dạ dày)',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 160,
    Unit: 'Hộp',
    Price: 45000,
    Description: 'Hoạt chất: Omeprazole 20mg. Chỉ định: Điều trị viêm loét dạ dày - tá tràng, hội chứng trào ngược dạ dày thực quản (GERD). Uống trước ăn sáng 30 phút.'
  },
  {
    ProductName: 'Viên sủi Berocca Performance Mango (Tuýp 10 viên)',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 190,
    Unit: 'Tuýp',
    Price: 89000,
    Description: 'Hoạt chất: Vitamin nhóm B, Vitamin C 500mg, Kẽm, Magie, Canxi. Chỉ định: Tăng cường sức đề kháng, giảm mệt mỏi, tăng sự tập trung tinh thần.'
  },
  {
    ProductName: 'Vitamin C 500mg OPC (Hộp 100 viên)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 230,
    Unit: 'Hộp',
    Price: 55000,
    Description: 'Hoạt chất: Acid Ascorbic 500mg. Chỉ định: Tăng sức đề kháng miễn dịch, phòng ngừa cảm cúm, chảy máu chân răng, chống oxy hóa.'
  },
  {
    ProductName: 'Magnesium B6 Sanofi',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 110,
    Unit: 'Hộp',
    Price: 92000,
    Description: 'Hoạt chất: Magnesium lactate 470mg, Vitamin B6 5mg. Chỉ định: Hỗ trợ giảm tê bì chân tay, chuột rút ban đêm, mất ngủ, suy nhược thần kinh.'
  },
  {
    ProductName: 'Dầu cá Omega-3 Orihiro Nhật Bản (Lọ 180 viên)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 42,
    Unit: 'Chai',
    Price: 310000,
    Description: 'Hoạt chất: EPA 186mg, DHA 124mg tinh khiết. Chỉ định: Bổ mắt, giảm khô mỏi mắt khi dùng máy tính, tốt cho tim mạch và trí não.'
  },
  {
    ProductName: 'Canxi Corbiere Extra Sanofi (Hộp 30 ống uống)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 85,
    Unit: 'Hộp',
    Price: 185000,
    Description: 'Hoạt chất: Calcium glubionate, Calcium lactobionate. Chỉ định: Bổ sung canxi cho trẻ đang lớn, phụ nữ mang thai, người cao tuổi phòng ngừa loãng xương.'
  },
  {
    ProductName: 'Hoạt huyết dưỡng não Traphaco (Hộp 5 vỉ)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Thần kinh - Tuần hoàn',
    Quantity: 140,
    Unit: 'Hộp',
    Price: 95000,
    Description: 'Hoạt chất: Cao Đinh lăng, Cao Bạch quả (Ginkgo Biloba). Chỉ định: Tăng tuần hoàn máu não, giảm đau đầu, hoa mắt, chóng mặt, rối loạn tiền đình, mất ngủ.'
  },
  {
    ProductName: 'Ginkgo Biloba 120mg Nature Made',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Thần kinh - Tuần hoàn',
    Quantity: 38,
    Unit: 'Chai',
    Price: 280000,
    Description: 'Hoạt chất: Chiết xuất lá Bạch quả Ginkgo Biloba 120mg. Chỉ định: Cải thiện trí nhớ, giảm thiểu năng tuần hoàn não, đau nửa đầu, tê bì tay chân.'
  },
  {
    ProductName: 'Thuốc chống dị ứng Telfast HD 180mg Sanofi',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dị ứng',
    Quantity: 125,
    Unit: 'Hộp',
    Price: 82000,
    Description: 'Hoạt chất: Fexofenadine HCl 180mg (Kháng histamin thế hệ mới không gây buồn ngủ). Chỉ định: Trị viêm mũi dị ứng, hắt hơi, ngứa mũi, nổi mề đay, dị ứng thời tiết.'
  },
  {
    ProductName: 'Loratadin 10mg Stada',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dị ứng',
    Quantity: 200,
    Unit: 'Hộp',
    Price: 28000,
    Description: 'Hoạt chất: Loratadine 10mg. Chỉ định: Giảm triệu chứng viêm mũi dị ứng, ngứa mắt, mề đay, dị ứng thức ăn hoặc côn trùng đốt.'
  },
  {
    ProductName: 'Thuốc nhỏ mắt V.Rohto Vitamin (Chai 13ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Chăm sóc mắt',
    Quantity: 175,
    Unit: 'Chai',
    Price: 52000,
    Description: 'Hoạt chất: Vitamin E, Vitamin B6, Sodium Chondroitin Sulfate. Chỉ định: Cải thiện mỏi mắt, khô mắt, mờ mắt do làm việc máy tính, bơi lội hoặc khói bụi.'
  },
  {
    ProductName: 'Kem bôi da liễu Bepanthen Bayer (Tuýp 30g)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Da liễu',
    Quantity: 90,
    Unit: 'Tuýp',
    Price: 69000,
    Description: 'Hoạt chất: Dexpanthenol (Tiền vitamin B5) 5%. Chỉ định: Làm dịu kích ứng da, hăm tã trẻ em, khô nứt da, phục hồi vết trầy xước nhẹ.'
  },
  {
    ProductName: 'Gel giảm đau cơ xương khớp Voltaren Emulgel 1% (Tuýp 20g)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 52,
    Unit: 'Tuýp',
    Price: 68000,
    Description: 'Hoạt chất: Diclofenac diethylamine 1.16% (NSAID). Chỉ định: Bôi ngoài da giảm đau, giảm sưng viêm do bong gân, căng cơ, chấn thương thể thao, đau khớp gối.'
  },
  {
    ProductName: 'Nước muối sinh lý Natri Clorid 0.9% (Chai 500ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dụng cụ y tế',
    Quantity: 320,
    Unit: 'Chai',
    Price: 12000,
    Description: 'Hoạt chất: Sodium Chloride 0.9%. Chỉ định: Súc miệng sát khuẩn họng, rửa mũi xoang, rửa vết thương ngoài da.'
  },
  {
    ProductName: 'Nhiệt kế điện tử hồng ngoại Microlife FR1MF1',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dụng cụ y tế',
    Quantity: 18,
    Unit: 'Hộp',
    Price: 650000,
    Description: 'Thiết bị y tế đo thân nhiệt hồng ngoại vùng trán trong 1 giây không tiếp xúc. Cảnh báo sốt tự động bằng màn hình đổi màu đỏ và tiếng bíp.'
  }
];

async function main() {
  console.log('Đang khởi tạo dữ liệu doanh nghiệp PharmaCore ERP (8 bảng)...');

  // Xóa dữ liệu cũ theo đúng thứ tự khóa ngoại
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  // 1. Tạo đội ngũ nhân sự Dược sĩ & Quản trị viên
  const hashedPassword = await bcrypt.hash('123456', 10);
  const admin = await prisma.user.create({
    data: {
      FullName: 'DS. Nguyễn Văn Trung',
      Email: 'trung.d18cnpm5@epu.edu.vn',
      Password: hashedPassword,
      Phone: '0988123456',
      Role: 'ADMIN',
      Status: 'ACTIVE',
    },
  });

  const pharmacist1 = await prisma.user.create({
    data: {
      FullName: 'DS. Đặng Minh Đức',
      Email: 'duc.d18cnpm5@epu.edu.vn',
      Password: hashedPassword,
      Phone: '0977654321',
      Role: 'PHARMACIST',
      Status: 'ACTIVE',
    },
  });

  await prisma.user.create({
    data: {
      FullName: 'DS. Lê Hoàng Bảo Ngọc',
      Email: 'baongoc.pharmacore@epu.edu.vn',
      Password: hashedPassword,
      Phone: '0912888999',
      Role: 'CASHIER',
      Status: 'ACTIVE',
    },
  });

  // 2. Nạp 35 sản phẩm thuốc chuẩn 10 trường
  for (const item of sampleProducts) {
    await prisma.product.create({ data: item });
  }
  const allProducts = await prisma.product.findMany({ orderBy: { ProductID: 'asc' } });

  // 3. Tạo 5 Nhà cung cấp dược phẩm lớn
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        SupplierCode: 'NCC-DHG01',
        SupplierName: 'Công ty Cổ phần Dược Hậu Giang (DHG Pharma)',
        ContactPerson: 'Nguyễn Thành Công',
        Phone: '02923891433',
        Email: 'supply@dhgpharma.com.vn',
        Address: '288 Bis Nguyễn Văn Cừ, Q. Ninh Kiều, TP. Cần Thơ',
        TaxCode: '1800156801',
      },
    }),
    prisma.supplier.create({
      data: {
        SupplierCode: 'NCC-TRA02',
        SupplierName: 'Công ty Cổ phần Traphaco',
        ContactPerson: 'Trần Thu Hà',
        Phone: '18006612',
        Email: 'contact@traphaco.com.vn',
        Address: '75 Yên Ninh, Q. Ba Đình, TP. Hà Nội',
        TaxCode: '0100108656',
      },
    }),
    prisma.supplier.create({
      data: {
        SupplierCode: 'NCC-SAN03',
        SupplierName: 'Công ty Cổ phần Sanofi Việt Nam',
        ContactPerson: 'Lê Minh Tuấn',
        Phone: '02838298526',
        Email: 'order.vn@sanofi.com',
        Address: 'Khu Công Nghệ Cao, TP. Thủ Đức, TP. Hồ Chí Minh',
        TaxCode: '0300462841',
      },
    }),
    prisma.supplier.create({
      data: {
        SupplierCode: 'NCC-ZUE04',
        SupplierName: 'Công ty TNHH Zuellig Pharma Việt Nam',
        ContactPerson: 'Phạm Quốc Bảo',
        Phone: '02839102650',
        Email: 'distribution@zuelligpharma.com',
        Address: 'KCN Tân Bình, Q. Tân Phú, TP. Hồ Chí Minh',
        TaxCode: '0301449218',
      },
    }),
  ]);

  // 4. Tạo 2 Phiếu nhập kho mẫu (Purchase Orders)
  await prisma.purchaseOrder.create({
    data: {
      OrderCode: 'PNK-2026-001',
      SupplierID: suppliers[0].SupplierID,
      UserID: admin.UserID,
      TotalCost: 15800000,
      Note: 'Nhập bổ sung nhóm thuốc hạ sốt và tiêu hóa định kỳ tháng 11',
      Status: 'COMPLETED',
      items: {
        create: [
          {
            ProductID: allProducts[0].ProductID,
            Quantity: 50,
            ImportPrice: 195000,
            BatchNumber: 'LOT-PAN26A',
            ExpiryDate: '2028-10-15',
          },
          {
            ProductID: allProducts[16].ProductID,
            Quantity: 60,
            ImportPrice: 88000,
            BatchNumber: 'LOT-PHO26B',
            ExpiryDate: '2028-06-30',
          },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      OrderCode: 'PNK-2026-002',
      SupplierID: suppliers[2].SupplierID,
      UserID: pharmacist1.UserID,
      TotalCost: 11200000,
      Note: 'Nhập lô thuốc kháng sinh và chống dị ứng Sanofi',
      Status: 'COMPLETED',
      items: {
        create: [
          {
            ProductID: allProducts[10].ProductID,
            Quantity: 30,
            ImportPrice: 210000,
            BatchNumber: 'LOT-AUG26C',
            ExpiryDate: '2028-05-20',
          },
          {
            ProductID: allProducts[28].ProductID,
            Quantity: 70,
            ImportPrice: 70000,
            BatchNumber: 'LOT-TEL26D',
            ExpiryDate: '2029-01-10',
          },
        ],
      },
    },
  });

  // 5. Tạo 5 Hồ sơ Bệnh nhân / Khách hàng (Customer) kèm tiền sử dị ứng thực tế
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        CustomerCode: 'BN-0001',
        FullName: 'Trần Thị Mai Hương',
        Phone: '0912345678',
        Email: 'maihuong.tran@gmail.com',
        Gender: 'Nữ',
        BirthYear: 1994,
        Allergies: 'Dị ứng kháng sinh nhóm Penicillin (Amoxicillin, Augmentin)',
        ChronicCond: 'Viêm mũi dị ứng thời tiết',
        LoyaltyPoints: 240,
      },
    }),
    prisma.customer.create({
      data: {
        CustomerCode: 'BN-0002',
        FullName: 'Nguyễn Mạnh Cường',
        Phone: '0987654321',
        Email: 'cuong.nm@gmail.com',
        Gender: 'Nam',
        BirthYear: 1982,
        Allergies: 'Kích ứng dạ dày với nhóm giảm đau NSAID (Ibuprofen, Diclofenac)',
        ChronicCond: 'Viêm loét dạ dày - Trào ngược thực quản (GERD)',
        LoyaltyPoints: 510,
      },
    }),
    prisma.customer.create({
      data: {
        CustomerCode: 'BN-0003',
        FullName: 'Lê Văn Hòa',
        Phone: '0909112233',
        Email: 'hoale.epu@gmail.com',
        Gender: 'Nam',
        BirthYear: 1975,
        Allergies: 'Không có',
        ChronicCond: 'Tăng men gan nhẹ - Hạn chế dùng liều cao Paracetamol',
        LoyaltyPoints: 185,
      },
    }),
    prisma.customer.create({
      data: {
        CustomerCode: 'BN-0004',
        FullName: 'Phạm Ngọc Ánh',
        Phone: '0933445566',
        Email: 'ngocanh.pham@gmail.com',
        Gender: 'Nữ',
        BirthYear: 2001,
        Allergies: 'Không có',
        ChronicCond: 'Không có',
        LoyaltyPoints: 95,
      },
    }),
  ]);

  // 6. Tạo 3 Hóa đơn bán hàng & Giao dịch thanh toán mẫu
  await prisma.invoice.create({
    data: {
      InvoiceCode: 'HD-2026-0001',
      CustomerName: customers[0].FullName,
      CustomerPhone: customers[0].Phone,
      CustomerID: customers[0].CustomerID,
      Note: 'Đơn thuốc điều trị sốt siêu vi và viêm họng cấp',
      Discount: 0,
      TotalAmount: allProducts[0].Price * 1 + allProducts[6].Price * 1 + allProducts[8].Price * 2,
      Status: 'PAID',
      UserID: admin.UserID,
      items: {
        create: [
          {
            ProductID: allProducts[0].ProductID,
            Quantity: 1,
            UnitPrice: allProducts[0].Price,
            DosageNote: 'Uống 1 viên khi sốt > 38.5°C, cách 4-6 giờ',
          },
          {
            ProductID: allProducts[6].ProductID,
            Quantity: 1,
            UnitPrice: allProducts[6].Price,
            DosageNote: 'Uống 5ml × 3 lần/ngày sau ăn',
          },
          {
            ProductID: allProducts[8].ProductID,
            Quantity: 2,
            UnitPrice: allProducts[8].Price,
            DosageNote: 'Ngậm 1 viên mỗi 3 giờ',
          },
        ],
      },
      payment: {
        create: {
          PaymentMethod: 'VIETQR',
          TransactionCode: 'VQR20261104001',
          PaidAmount: allProducts[0].Price * 1 + allProducts[6].Price * 1 + allProducts[8].Price * 2,
          Status: 'COMPLETED',
        },
      },
    },
  });

  await prisma.invoice.create({
    data: {
      InvoiceCode: 'HD-2026-0002',
      CustomerName: customers[1].FullName,
      CustomerPhone: customers[1].Phone,
      CustomerID: customers[1].CustomerID,
      Note: 'Đơn điều trị trào ngược dạ dày thực quản (GERD)',
      Discount: 10000,
      TotalAmount: allProducts[16].Price * 1 + allProducts[20].Price * 1 + allProducts[18].Price * 1 - 10000,
      Status: 'PAID',
      UserID: pharmacist1.UserID,
      items: {
        create: [
          {
            ProductID: allProducts[16].ProductID,
            Quantity: 1,
            UnitPrice: allProducts[16].Price,
            DosageNote: 'Uống 1 gói sau ăn hoặc khi đau thượng vị',
          },
          {
            ProductID: allProducts[20].ProductID,
            Quantity: 1,
            UnitPrice: allProducts[20].Price,
            DosageNote: 'Uống 1 viên trước ăn sáng 30 phút',
          },
          {
            ProductID: allProducts[18].ProductID,
            Quantity: 1,
            UnitPrice: allProducts[18].Price,
            DosageNote: 'Sáng 1 ống, Chiều 1 ống',
          },
        ],
      },
      payment: {
        create: {
          PaymentMethod: 'CASH',
          TransactionCode: 'CASH20261104002',
          PaidAmount: allProducts[16].Price * 1 + allProducts[20].Price * 1 + allProducts[18].Price * 1 - 10000,
          Status: 'COMPLETED',
        },
      },
    },
  });

  // 7. Tạo Phiếu tư vấn dược lâm sàng mẫu
  await prisma.contact.create({
    data: {
      FullName: 'Lê Hoàng Nam',
      Email: 'hoangnam@gmail.com',
      Phone: '0933112233',
      Subject: 'Tư vấn phác đồ điều trị viêm xoang dị ứng thời tiết',
      Message: 'Mình thường xuyên bị hắt hơi, sổ mũi vào buổi sáng khi trời lạnh, cần thuốc không gây buồn ngủ vì phải lái xe.',
      Priority: 'HIGH',
      ReplyNote: 'Khuyến nghị sử dụng Telfast HD 180mg (Fexofenadine thế hệ 2 không gây buồn ngủ) 1 viên/ngày sau ăn sáng, kết hợp rửa mũi bằng Natri Clorid 0.9%.',
      Status: 'REPLIED',
      UserID: admin.UserID,
    },
  });

  await prisma.contact.create({
    data: {
      FullName: 'Vũ Thị Thu Thảo',
      Email: 'thuthao.vu@gmail.com',
      Phone: '0944556677',
      Subject: 'Hỏi về cách kết hợp thuốc hạ sốt và viên sủi giảm đau',
      Message: 'Nhà mình đang có sẵn Panadol Extra và viên sủi Efferalgan 500mg, uống cả 2 loại cùng lúc để hạ sốt nhanh hơn có được không?',
      Priority: 'HIGH',
      Status: 'NEW',
    },
  });

  console.log('Hoàn tất khởi tạo dữ liệu doanh nghiệp PharmaCore ERP trên cả 8 bảng!');
}

main()
  .catch((e) => {
    console.error('Lỗi khi seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
