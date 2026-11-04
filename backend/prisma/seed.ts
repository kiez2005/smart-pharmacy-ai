import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const sampleProducts = [
  {
    ProductName: 'Panadol Extra Đỏ 500mg/65mg',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 150,
    Unit: 'Hộp',
    Price: 235000,
    Description: 'Hoạt chất: Paracetamol 500mg, Caffeine 65mg. Công dụng: Hạ sốt, giảm đau đầu, đau nửa đầu, đau họng, đau răng, đau nhức cơ xương. Chống chỉ định: Suy gan nặng.'
  },
  {
    ProductName: 'Viên sủi Efferalgan 500mg UPSA',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 220,
    Unit: 'Hộp',
    Price: 56000,
    Description: 'Hoạt chất: Paracetamol 500mg dạng viên sủi hòa tan nhanh. Công dụng: Điều trị sốt cao, cảm cúm, đau đầu, đau nhức mình mẩy. Liều dùng: Hòa tan 1 viên trong 200ml nước, cách nhau 4-6 giờ.'
  },
  {
    ProductName: 'Hapacol 250mg DHG Pharma (Trẻ em)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 180,
    Unit: 'Hộp',
    Price: 38000,
    Description: 'Hoạt chất: Paracetamol 250mg bột sủi hương cam. Công dụng: Hạ sốt nhanh cho trẻ em sốt do mọc răng, sốt siêu vi, cảm cúm, sau tiêm chủng.'
  },
  {
    ProductName: 'Ibuprofen 400mg Stada',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 95,
    Unit: 'Hộp',
    Price: 85000,
    Description: 'Hoạt chất: Ibuprofen 400mg (NSAID). Công dụng: Kháng viêm, giảm đau khớp, đau bụng kinh, đau răng, hạ sốt. Lưu ý: Uống sau khi ăn no, thận trọng người đau dạ dày.'
  },
  {
    ProductName: 'Tiffy Dey Thái Lan (Vỉ 4 viên)',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 340,
    Unit: 'Vỉ',
    Price: 8000,
    Description: 'Hoạt chất: Paracetamol, Chlorpheniramine, Phenylephrine. Công dụng: Trị cảm cúm, sổ mũi, nghẹt mũi, hắt hơi, sốt nhẹ, đau đầu do thời tiết.'
  },
  {
    ProductName: 'Decolgen Forte (Hộp 25 vỉ)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 120,
    Unit: 'Hộp',
    Price: 175000,
    Description: 'Hoạt chất: Paracetamol 500mg, Phenylephrine HCl 10mg, Chlorpheniramine 2mg. Công dụng: Điều trị cảm cúm, viêm mũi dị ứng, chảy nước mũi, ngạt mũi, đau đầu.'
  },
  {
    ProductName: 'Siro Ho Prospan Đức (Chai 100ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 85,
    Unit: 'Chai',
    Price: 78000,
    Description: 'Hoạt chất: Cao khô lá thường xuân tự nhiên. Công dụng: Giảm ho khan, ho có đờm, làm dịu cổ họng, tiêu đờm, viêm phế quản cấp và mãn tính cho người lớn và trẻ sơ sinh.'
  },
  {
    ProductName: 'Acemuc 200mg Sanofi (Tiêu đờm)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 140,
    Unit: 'Hộp',
    Price: 72000,
    Description: 'Hoạt chất: Acetylcysteine 200mg. Công dụng: Tiêu chất nhầy, long đờm trong bệnh ho có đờm đặc, viêm phế quản, viêm xoang.'
  },
  {
    ProductName: 'Viên ngậm đau họng Strepsils Cool',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 260,
    Unit: 'Hộp',
    Price: 36000,
    Description: 'Hoạt chất: 2,4-Dichlorobenzyl alcohol, Amylmetacresol. Công dụng: Kháng khuẩn vùng hầu họng, giảm đau rát họng, khản tiếng, ngứa cổ họng.'
  },
  {
    ProductName: 'Thuốc xịt mũi Otrivin 0.1% (10ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Hô hấp',
    Quantity: 90,
    Unit: 'Chai',
    Price: 62000,
    Description: 'Hoạt chất: Xylometazoline HCl 0.1%. Công dụng: Giảm ngạt mũi nhanh do cảm lạnh, viêm mũi xoang, viêm mũi dị ứng. Không dùng quá 7 ngày liên tiếp.'
  },
  {
    ProductName: 'Augmentin 625mg GSK (Kháng sinh)',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 65,
    Unit: 'Hộp',
    Price: 245000,
    Description: 'Hoạt chất: Amoxicillin 500mg + Acid Clavulanic 125mg. Công dụng: Kháng sinh phổ rộng điều trị nhiễm khuẩn hô hấp, viêm amidan, viêm xoang, viêm tai giữa, nhiễm trùng tiết niệu. (Thuốc kê đơn).'
  },
  {
    ProductName: 'Amoxicillin 500mg Domesco',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 130,
    Unit: 'Hộp',
    Price: 95000,
    Description: 'Hoạt chất: Amoxicillin trihydrate 500mg. Công dụng: Điều trị nhiễm khuẩn tai mũi họng, phế quản, da và mô mềm. Chống chỉ định: Dị ứng nhóm Penicillin.'
  },
  {
    ProductName: 'Azithromycin 500mg Pfizer (Zithromax)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 50,
    Unit: 'Hộp',
    Price: 135000,
    Description: 'Hoạt chất: Azithromycin 500mg. Công dụng: Kháng sinh Macrolid điều trị viêm họng liên cầu, viêm phổi, viêm xoang cấp, nhiễm khuẩn da.'
  },
  {
    ProductName: 'Cefixim 200mg Traphaco',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Kháng sinh',
    Quantity: 75,
    Unit: 'Hộp',
    Price: 118000,
    Description: 'Hoạt chất: Cefixime 200mg (Cephalosporin thế hệ 3). Công dụng: Nhiễm khuẩn đường tiết niệu, viêm họng, viêm amidan, viêm phế quản cấp.'
  },
  {
    ProductName: 'Berberin Mộc Hoa Tràm 100mg (Lọ 100 viên)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 210,
    Unit: 'Chai',
    Price: 32000,
    Description: 'Hoạt chất: Berberin clorid 100mg, Mộc hương. Công dụng: Điều trị tiêu chảy, đau bụng đi ngoài, hội chứng lỵ trực khuẩn, viêm ruột cấp tính.'
  },
  {
    ProductName: 'Bột pha uống Smecta Ipsen (Hộp 30 gói)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 115,
    Unit: 'Hộp',
    Price: 115000,
    Description: 'Hoạt chất: Diosmectite 3g. Công dụng: Bao phủ niêm mạc tiêu hóa, điều trị tiêu chảy cấp và mãn tính, giảm đau dạ dày thực quản, đầy hơi.'
  },
  {
    ProductName: 'Sữa nghệ Phosphalugel (Thuốc dạ dày chữ P)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 170,
    Unit: 'Hộp',
    Price: 108000,
    Description: 'Hoạt chất: Colloidal Aluminium Phosphate gel 20%. Công dụng: Trung hòa axit dạ dày, giảm nhanh cơn đau thượng vị, ợ chua, ợ nóng, trào ngược dạ dày thực quản.'
  },
  {
    ProductName: 'Gaviscon Dual Action (Hộp 24 gói)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 95,
    Unit: 'Hộp',
    Price: 168000,
    Description: 'Hoạt chất: Sodium alginate, Sodium bicarbonate, Calcium carbonate. Công dụng: Chống trào ngược dạ dày thực quản, giảm ợ nóng, khó tiêu sau bữa ăn.'
  },
  {
    ProductName: 'Men vi sinh Enterogermina 2 tỷ lợi khuẩn (Hộp 20 ống)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 145,
    Unit: 'Hộp',
    Price: 165000,
    Description: 'Hoạt chất: Bào tử Bacillus clausii 2 tỷ. Công dụng: Cân bằng hệ vi sinh đường ruột, hỗ trợ điều trị rối loạn tiêu hóa, tiêu chảy do dùng kháng sinh.'
  },
  {
    ProductName: 'Oresol 245 bù nước & điện giải (Gói cam)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 500,
    Unit: 'Gói',
    Price: 3500,
    Description: 'Hoạt chất: Glucose khan, Natri clorid, Kali clorid, Natri citrat. Công dụng: Bù nước và chất điện giải khi bị tiêu chảy, sốt cao đổ mồ hôi nhiều, nôn mửa.'
  },
  {
    ProductName: 'Omeprazol 20mg DHG (Ức chế axit dạ dày)',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Tiêu hóa',
    Quantity: 160,
    Unit: 'Hộp',
    Price: 45000,
    Description: 'Hoạt chất: Omeprazole 20mg. Công dụng: Điều trị viêm loét dạ dày - tá tràng, hội chứng trào ngược dạ dày thực quản (GERD). Uống trước ăn sáng 30 phút.'
  },
  {
    ProductName: 'Viên sủi Berocca Performance Mango (Tuýp 10 viên)',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 190,
    Unit: 'Tuýp',
    Price: 89000,
    Description: 'Hoạt chất: Vitamin nhóm B (B1, B2, B6, B12), Vitamin C 500mg, Kẽm, Magie, Canxi. Công dụng: Tăng cường sức đề kháng, giảm mệt mỏi, tăng sự tập trung tinh thần.'
  },
  {
    ProductName: 'Vitamin C 500mg OPC (Hộp 100 viên)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 230,
    Unit: 'Hộp',
    Price: 55000,
    Description: 'Hoạt chất: Acid Ascorbic 500mg. Công dụng: Tăng sức đề kháng miễn dịch, phòng ngừa cảm cúm, chảy máu chân răng, chống oxy hóa.'
  },
  {
    ProductName: 'Magnesium B6 Sanofi (Giảm căng thẳng, chuột rút)',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 110,
    Unit: 'Hộp',
    Price: 92000,
    Description: 'Hoạt chất: Magnesium lactate 470mg, Vitamin B6 5mg. Công dụng: Hỗ trợ giảm tê bì chân tay, chuột rút ban đêm, mất ngủ, suy nhược thần kinh.'
  },
  {
    ProductName: 'Dầu cá Omega-3 Orihiro Nhật Bản (Lọ 180 viên)',
    PathImage: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 60,
    Unit: 'Chai',
    Price: 310000,
    Description: 'Hoạt chất: EPA 186mg, DHA 124mg tinh khiết. Công dụng: Bổ mắt, giảm khô mỏi mắt khi dùng máy tính, tốt cho tim mạch và trí não.'
  },
  {
    ProductName: 'Canxi Corbiere Extra Sanofi (Hộp 30 ống uống)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Vitamin & Khoáng chất',
    Quantity: 85,
    Unit: 'Hộp',
    Price: 185000,
    Description: 'Hoạt chất: Calcium glubionate, Calcium lactobionate. Công dụng: Bổ sung canxi cho trẻ đang lớn, phụ nữ mang thai, người cao tuổi phòng ngừa loãng xương.'
  },
  {
    ProductName: 'Hoạt huyết dưỡng não Traphaco (Hộp 5 vỉ)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Thần kinh - Tuần hoàn',
    Quantity: 140,
    Unit: 'Hộp',
    Price: 95000,
    Description: 'Hoạt chất: Cao Đinh lăng, Cao Bạch quả (Ginkgo Biloba). Công dụng: Tăng tuần hoàn máu não, giảm đau đầu, hoa mắt, chóng mặt, rối loạn tiền đình, mất ngủ.'
  },
  {
    ProductName: 'Ginkgo Biloba 120mg Nature Made (Bổ não)',
    PathImage: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Thần kinh - Tuần hoàn',
    Quantity: 70,
    Unit: 'Chai',
    Price: 280000,
    Description: 'Hoạt chất: Chiết xuất lá Bạch quả Ginkgo Biloba 120mg. Công dụng: Cải thiện trí nhớ, giảm thiểu năng tuần hoàn não, đau nửa đầu, tê bì tay chân.'
  },
  {
    ProductName: 'Thuốc chống dị ứng Telfast HD 180mg Sanofi',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dị ứng',
    Quantity: 125,
    Unit: 'Hộp',
    Price: 82000,
    Description: 'Hoạt chất: Fexofenadine HCl 180mg (Kháng histamin thế hệ mới không gây buồn ngủ). Công dụng: Trị viêm mũi dị ứng, hắt hơi, ngứa mũi, nổi mề đay, dị ứng thời tiết.'
  },
  {
    ProductName: 'Loratadin 10mg Stada (Trị dị ứng, mề đay)',
    PathImage: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dị ứng',
    Quantity: 200,
    Unit: 'Hộp',
    Price: 28000,
    Description: 'Hoạt chất: Loratadine 10mg. Công dụng: Giảm triệu chứng viêm mũi dị ứng, ngứa mắt, mề đay, dị ứng thức ăn hoặc côn trùng đốt.'
  },
  {
    ProductName: 'Thuốc nhỏ mắt V.Rohto Vitamin (Chai 13ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Chăm sóc mắt',
    Quantity: 175,
    Unit: 'Chai',
    Price: 52000,
    Description: 'Hoạt chất: Vitamin E, Vitamin B6, Sodium Chondroitin Sulfate. Công dụng: Cải thiện mỏi mắt, khô mắt, mờ mắt do làm việc máy tính, bơi lội hoặc khói bụi.'
  },
  {
    ProductName: 'Kem bôi da liễu Bepanthen Bayer (Tuýp 30g)',
    PathImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Da liễu',
    Quantity: 90,
    Unit: 'Tuýp',
    Price: 69000,
    Description: 'Hoạt chất: Dexpanthenol (Tiền vitamin B5) 5%. Công dụng: Làm dịu kích ứng da, hăm tã trẻ em, khô nứt da, phục hồi vết trầy xước nhẹ.'
  },
  {
    ProductName: 'Gel giảm đau cơ xương khớp Voltaren Emulgel 1% (Tuýp 20g)',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Giảm đau - Hạ sốt',
    Quantity: 80,
    Unit: 'Tuýp',
    Price: 68000,
    Description: 'Hoạt chất: Diclofenac diethylamine 1.16%. Công dụng: Bôi ngoài da giảm đau, giảm sưng viêm do bong gân, căng cơ, chấn thương thể thao, đau khớp gối, đau lưng.'
  },
  {
    ProductName: 'Nước muối sinh lý Natri Clorid 0.9% Pharmacity (Chai 500ml)',
    PathImage: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dụng cụ y tế',
    Quantity: 320,
    Unit: 'Chai',
    Price: 12000,
    Description: 'Hoạt chất: Sodium Chloride 0.9%. Công dụng: Súc miệng sát khuẩn họng, rửa mũi xoang, rửa vết thương ngoài da.'
  },
  {
    ProductName: 'Nhiệt kế điện tử hồng ngoại Microlife FR1MF1',
    PathImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
    ProductType: 'Dụng cụ y tế',
    Quantity: 25,
    Unit: 'Hộp',
    Price: 650000,
    Description: 'Thiết bị y tế đo thân nhiệt hồng ngoại vùng trán trong 1 giây không tiếp xúc. Cảnh báo sốt tự động bằng màn hình đổi màu đỏ và tiếng bíp.'
  }
];

async function main() {
  console.log('🌱 Đang khởi tạo dữ liệu mẫu cho Hệ thống Quản lý Nhà thuốc Thông minh (D18CNPM5)...');

  // 1. Tạo tài khoản Admin & Dược sĩ mẫu
  const hashedPassword = await bcrypt.hash('123456', 10);
  const admin = await prisma.user.upsert({
    where: { Email: 'trung.d18cnpm5@epu.edu.vn' },
    update: {},
    create: {
      FullName: 'Nguyễn Văn Trung (Dược sĩ Trưởng)',
      Email: 'trung.d18cnpm5@epu.edu.vn',
      Password: hashedPassword,
      Phone: '0988123456',
      Role: 'ADMIN'
    }
  });

  await prisma.user.upsert({
    where: { Email: 'duc.d18cnpm5@epu.edu.vn' },
    update: {},
    create: {
      FullName: 'Đặng Minh Đức (Dược sĩ Bán hàng)',
      Email: 'duc.d18cnpm5@epu.edu.vn',
      Password: hashedPassword,
      Phone: '0977654321',
      Role: 'PHARMACIST'
    }
  });

  // 2. Xóa dữ liệu cũ nếu có để tránh trùng lặp khi seed lại
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.product.deleteMany();
  await prisma.contact.deleteMany();

  // 3. Nạp 35 sản phẩm thuốc mẫu chuẩn 10 trường yêu cầu
  for (const item of sampleProducts) {
    await prisma.product.create({
      data: item
    });
  }

  const allProducts = await prisma.product.findMany({ take: 3 });

  // 4. Tạo 2 Hóa đơn mẫu & Thanh toán mẫu
  if (allProducts.length >= 2) {
    const inv1 = await prisma.invoice.create({
      data: {
        InvoiceCode: 'HD-2026-0001',
        CustomerName: 'Trần Thị Mai Hương',
        CustomerPhone: '0912345678',
        Note: 'Bệnh nhân sốt nhẹ 38.2 độ, đau rát họng (Đơn thuốc OCR)',
        TotalAmount: allProducts[0].Price * 1 + allProducts[1].Price * 2,
        Status: 'PAID',
        UserID: admin.UserID,
        items: {
          create: [
            {
              ProductID: allProducts[0].ProductID,
              Quantity: 1,
              UnitPrice: allProducts[0].Price,
              DosageNote: 'Sáng 1 viên, Chiều 1 viên sau ăn'
            },
            {
              ProductID: allProducts[1].ProductID,
              Quantity: 2,
              UnitPrice: allProducts[1].Price,
              DosageNote: 'Hòa tan 1 viên khi sốt > 38.5 độ'
            }
          ]
        },
        payment: {
          create: {
            PaymentMethod: 'VIETQR',
            TransactionCode: 'VQR20261104001',
            PaidAmount: allProducts[0].Price * 1 + allProducts[1].Price * 2,
            Status: 'COMPLETED'
          }
        }
      }
    });
    console.log(`✅ Đã tạo hóa đơn mẫu: ${inv1.InvoiceCode}`);
  }

  // 5. Tạo Liên hệ tư vấn mẫu
  await prisma.contact.create({
    data: {
      FullName: 'Lê Hoàng Nam',
      Email: 'hoangnam@gmail.com',
      Phone: '0933112233',
      Subject: 'Tư vấn đơn thuốc điều trị viêm xoang dị ứng thời tiết',
      Message: 'Em hay bị hắt hơi, sổ mũi vào buổi sáng khi trời lạnh, nhờ dược sĩ tư vấn thuốc không gây buồn ngủ.',
      ReplyNote: 'Chào bạn, Dược sĩ khuyên dùng Telfast HD 180mg (1 viên/ngày) kết hợp rửa mũi bằng Natri Clorid 0.9%.',
      Status: 'REPLIED',
      UserID: admin.UserID
    }
  });

  console.log(`🎉 Hoàn tất nạp ${sampleProducts.length} loại thuốc vào SQLite Database (pharmacy.db)!`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
