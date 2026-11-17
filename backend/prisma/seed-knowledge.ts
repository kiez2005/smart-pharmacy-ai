import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../src/config/prisma';

export interface SeedLeafletEntry {
  productNameMatch: string;
  sourceName: string;
  sourceRef: string;
  sections: Array<{
    section: string;
    content: string;
  }>;
}

const VERIFIED_PRODUCT_LEAFLETS: SeedLeafletEntry[] = [
  {
    productNameMatch: 'Panadol Extra',
    sourceName: 'Tờ HDSD GlaxoSmithKline (GSK) & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-21902-14',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Panadol Extra (OTC - không kê đơn): mỗi viên nén chứa Paracetamol 500mg và Caffeine 65mg. Chỉ định hạ sốt và giảm đau nhẹ đến vừa: đau đầu, đau nửa đầu, đau họng, đau răng, đau nhức cơ bắp, đau bụng kinh.',
      },
      {
        section: 'Liều dùng & Cách dùng',
        content:
          'Người lớn và trẻ từ 12 tuổi trở lên: uống 1–2 viên/lần mỗi 4–6 giờ khi cần thiết. Tối đa không quá 8 viên (4000mg Paracetamol)/24 giờ. Không dùng chung với thuốc khác có chứa Paracetamol.',
      },
      {
        section: 'Chống chỉ định & Thận trọng',
        content:
          'Chống chỉ định ở người suy gan nặng, thiếu hụt G6PD hoặc quá mẫn với Paracetamol/Caffeine. Tránh uống nhiều cà phê/trà chứa caffeine khi dùng thuốc; người bệnh gan, nghiện rượu hoặc suy thận nặng cần hỏi ý kiến bác sĩ.',
      },
    ],
  },
  {
    productNameMatch: 'Efferalgan 500mg',
    sourceName: 'Tờ HDSD UPSA SAS (Pháp) & Dược thư Quốc gia VN 2022',
    sourceRef: 'VN-20922-18',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Viên sủi Efferalgan 500mg (OTC): chứa Paracetamol 500mg dạng viên sủi bọt hấp thu nhanh. Dùng giảm đau và hạ sốt trong cảm cúm, sốt virus, đau đầu, đau cơ khớp nhẹ.',
      },
      {
        section: 'Liều dùng & Cách dùng',
        content:
          'Hòa tan hoàn toàn 1 viên sủi trong cốc 150–200ml nước đun sôi để nguội trước khi uống, không nuốt hoặc nhai nguyên viên. Khoảng cách giữa 2 lần uống ít nhất 4–6 giờ, người lớn tối đa 4g Paracetamol/ngày (trẻ 10–15mg/kg/lần).',
      },
      {
        section: 'Chống chỉ định & Thận trọng',
        content:
          'Chống chỉ định người suy gan nặng, mẫn cảm Paracetamol. Mỗi viên sủi chứa natri bicarbonate (~412mg Na+), thận trọng ở người tăng huyết áp hoặc đang ăn kiêng muối.',
      },
    ],
  },
  {
    productNameMatch: 'Hapacol 250mg',
    sourceName: 'Tờ HDSD DHG Pharma & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-25615-16',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Hapacol 250mg (OTC - thuốc gói hạ sốt cho trẻ em): mỗi gói cốm sủi chứa Paracetamol 250mg. Chỉ định hạ sốt và giảm đau cho trẻ em khi sốt, mọc răng, sau tiêm chủng hoặc cảm lạnh.',
      },
      {
        section: 'Liều dùng & Cách dùng',
        content:
          'Liều dùng tính theo cân nặng của trẻ: 10–15mg Paracetamol/kg thể trọng mỗi lần, cách nhau 4–6 giờ, không quá 5 lần (tối đa 60mg/kg) trong 24 giờ. Thông thường trẻ 16–25kg dùng 1 gói Hapacol 250mg/lần hòa tan với ít nước nguội.',
      },
      {
        section: 'Chống chỉ định & Thận trọng',
        content:
          'Không dùng cho trẻ suy gan nặng, thiếu G6PD hoặc dị ứng Paracetamol. Nếu trẻ sốt cao trên 39°C không đáp ứng thuốc hạ sốt sau 48 giờ hoặc kèm co giật, phát ban, lừ đừ cần đưa đi khám bác sĩ ngay.',
      },
    ],
  },
  {
    productNameMatch: 'Ibuprofen 400mg',
    sourceName: 'Tờ HDSD Stada VN & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-28412-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Ibuprofen 400mg Stada (NSAID - OTC): kháng viêm không steroid, giảm đau và hạ sốt trong đau răng, đau bụng kinh, đau nhức xương khớp, viêm khớp nhẹ hoặc sốt cao đáp ứng kém với paracetamol.',
      },
      {
        section: 'Liều dùng & Cách dùng',
        content:
          'Người lớn và trẻ > 12 tuổi: uống 1 viên (400mg)/lần ngay sau bữa ăn để giảm kích ứng dạ dày, mỗi 6–8 giờ nếu cần, tối đa 1200mg/ngày khi tự dùng OTC.',
      },
      {
        section: 'Chống chỉ định & Thận trọng',
        content:
          'CHỐNG CHỈ ĐỊNH ở người loét dạ dày - tá tràng tiến triển, tiền sử hen phế quản/co thắt phế quản do NSAID, suy tim/suy gan/suy thận nặng, xuất huyết tiêu hóa, sốt xuất huyết Dengue (nguy cơ xuất huyết nặng) và phụ nữ có thai 3 tháng cuối.',
      },
    ],
  },
  {
    productNameMatch: 'Tiffy Dey',
    sourceName: 'Tờ HDSD Thai Nakorn Patana & Cục Quản lý Dược',
    sourceRef: 'VN-19881-16',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Tiffy Dey (OTC): mỗi viên chứa Paracetamol 500mg, Chlorpheniramine maleate 2mg, Phenylephrine HCl 10mg. Giảm triệu chứng cảm lạnh thông thường: sốt, đau đầu, hắt hơi, sổ mũi, nghẹt mũi.',
      },
      {
        section: 'Liều dùng & Thận trọng',
        content:
          'Người lớn uống 1 viên/lần x 3–4 lần/ngày. Lưu ý Chlorpheniramine gây buồn ngủ (không lái xe/vận hành máy móc) và Phenylephrine thận trọng ở người tăng huyết áp, bệnh mạch vành, cường giáp.',
      },
    ],
  },
  {
    productNameMatch: 'Decolgen Forte',
    sourceName: 'Tờ HDSD United Pharma VN',
    sourceRef: 'VD-22580-15',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Decolgen Forte (OTC): Paracetamol 500mg + Phenylephrine 10mg + Chlorpheniramine 2mg. Giảm nghẹt mũi, chảy nước mũi, đau nhức đầu và sốt do cảm lạnh, viêm mũi xoang.',
      },
      {
        section: 'Chống chỉ định & Thận trọng',
        content:
          'Tránh dùng đồng thời thuốc khác chứa Paracetamol (Panadol, Efferalgan) để phòng quá liều gây độc gan. Không dùng cho người tăng huyết áp nặng, glaucom góc hẹp hoặc đang dùng thuốc ức chế MAO.',
      },
    ],
  },
  {
    productNameMatch: 'Siro Ho Prospan',
    sourceName: 'Tờ HDSD Engelhard Arzneimittel (Đức)',
    sourceRef: 'VN-21772-19',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Siro Ho Prospan (OTC thảo dược): chiết xuất khô lá Thường xuân (Hedera helix) 700mg/100ml. Giúp long đờm, giảm co thắt phế quản và dịu cơn ho trong viêm đường hô hấp cấp có kèm ho đờm.',
      },
      {
        section: 'Liều dùng & Lưu ý',
        content:
          'Lắc kỹ trước khi uống. Trẻ sơ sinh–5 tuổi: 2.5ml x 3 lần/ngày (dưới 1 tuổi tham khảo bác sĩ). Trẻ 6–11 tuổi: 5ml x 3 lần/ngày. Người lớn & >= 12 tuổi: 5–7.5ml x 3 lần/ngày. Nếu ho kéo dài > 7 ngày, sốt cao hoặc khó thở phải đi khám.',
      },
    ],
  },
  {
    productNameMatch: 'Acemuc 200mg',
    sourceName: 'Tờ HDSD Sanofi & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-26711-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Acemuc 200mg (OTC): hoạt chất Acetylcysteine 200mg. Thuốc tiêu chất nhầy (long đờm), làm loãng đờm quánh đặc trong viêm phế quản cấp/mạn và viêm đường hô hấp trên.',
      },
      {
        section: 'Liều dùng & Thận trọng',
        content:
          'Người lớn và trẻ > 7 tuổi: 1 gói (200mg) x 3 lần/ngày hòa tan vào nửa ly nước. Thận trọng người tiền sử hen phế quản (có thể gây co thắt phế quản), loét dạ dày. Không dùng chung với thuốc ức chế phản xạ ho như codein/dextromethorphan.',
      },
    ],
  },
  {
    productNameMatch: 'Strepsils Cool',
    sourceName: 'Tờ HDSD Reckitt Benckiser Healthcare',
    sourceRef: 'VN-20112-16',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Strepsils Cool (OTC): chứa 2,4-Dichlorobenzyl alcohol 1.2mg và Amylmetacresol 0.6mg cùng tinh dầu bạc hà. Sát khuẩn nhẹ khoang miệng - hầu họng, làm dịu đau rát họng.',
      },
      {
        section: 'Liều dùng & Thận trọng',
        content:
          'Ngậm chậm 1 viên mỗi 2–3 giờ (tối đa 12 viên/ngày). Không dùng cho trẻ dưới 6 tuổi do nguy cơ hóc sặc viên ngậm.',
      },
    ],
  },
  {
    productNameMatch: 'Otrivin 0.1%',
    sourceName: 'Tờ HDSD GSK Consumer Healthcare',
    sourceRef: 'VN-21208-18',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Thuốc xịt mũi Otrivin 0.1% (OTC): hoạt chất Xylometazoline HCl 0.1%. Co mạch tại chỗ niêm mạc mũi, giảm nhanh nghẹt mũi, sung huyết mũi do cảm lạnh hoặc viêm xoang.',
      },
      {
        section: 'Liều dùng & Thận trọng (QUAN TRỌNG)',
        content:
          'Dùng cho người lớn và trẻ >= 12 tuổi: xịt 1 nhát mỗi bên mũi, 1–3 lần/ngày. KHÔNG DÙNG QUÁ 5–7 NGÀY LIÊN TIẾP để tránh hiện tượng quen thuốc và viêm mũi tái hồi do thuốc (rhinitis medicamentosa).',
      },
    ],
  },
  {
    productNameMatch: 'Augmentin 625mg',
    sourceName: 'Tờ HDSD GSK & Dược thư Quốc gia VN 2022',
    sourceRef: 'VN-21455-18 (Rx)',
    sections: [
      {
        section: 'Thành phần & Phân loại KÊ ĐƠN (Rx)',
        content:
          'Augmentin 625mg (THUỐC KÊ ĐƠN - Rx): chứa Amoxicillin 500mg + Acid Clavulanic 125mg. Kháng sinh nhóm Beta-lactam phối hợp chất ức chế beta-lactamase, chỉ định khi có nhiễm khuẩn nhạy cảm (viêm xoang, viêm phế quản, viêm tai giữa, nhiễm khuẩn tiết niệu) theo đơn bác sĩ.',
      },
      {
        section: 'Liều dùng & Chống chỉ định',
        content:
          'CHỈ BÁN KHI CÓ ĐƠN BÁC SĨ. Uống vào đầu bữa ăn để tăng hấp thu và giảm rối loạn tiêu hóa. Chống chỉ định ở người dị ứng Penicillin/Cephalosporin, tiền sử vàng da ứ mật/rối loạn chức năng gan liên quan Augmentin.',
      },
    ],
  },
  {
    productNameMatch: 'Amoxicillin 500mg',
    sourceName: 'Tờ HDSD Domesco & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-25109-16 (Rx)',
    sections: [
      {
        section: 'Thành phần & Phân loại KÊ ĐƠN (Rx)',
        content:
          'Amoxicillin 500mg Domesco (THUỐC KÊ ĐƠN - Rx): kháng sinh nhóm Aminopenicillin phổ rộng. Chỉ sử dụng điều trị nhiễm khuẩn đường hô hấp, răng hàm mặt, tiết niệu theo đúng chỉ định và đủ thời gian kê đơn của bác sĩ.',
      },
      {
        section: 'Chống chỉ định & Thận trọng',
        content:
          'CHỐNG CHỈ ĐỊNH tuyệt đối ở người dị ứng Penicillin hoặc dị ứng chéo nhóm Beta-lactam. Ngưng thuốc và xử trí cấp cứu ngay nếu nổi mề đay, khó thở, sưng môi. Không tự ý mua dùng cho cảm cúm do virus.',
      },
    ],
  },
  {
    productNameMatch: 'Azithromycin 500mg',
    sourceName: 'Tờ HDSD Pfizer Zithromax & Dược thư Quốc gia VN 2022',
    sourceRef: 'VN-22091-19 (Rx)',
    sections: [
      {
        section: 'Thành phần & Phân loại KÊ ĐƠN (Rx)',
        content:
          'Azithromycin 500mg (Zithromax - THUỐC KÊ ĐƠN Rx): kháng sinh nhóm Macrolid. Dùng trong viêm phổi mắc phải cộng đồng, viêm xoang, viêm họng do vi khuẩn nhạy cảm khi có đơn bác sĩ.',
      },
      {
        section: 'Thận trọng & Tương tác',
        content:
          'Thận trọng ở người kéo dài khoảng QT trên điện tâm đồ, loạn nhịp tim, suy gan nặng. Tránh uống sát thuốc kháng axit chứa nhôm/magie (như Phosphalugel, Gaviscon) — phải uống cách ít nhất 2 giờ.',
      },
    ],
  },
  {
    productNameMatch: 'Cefixim 200mg',
    sourceName: 'Tờ HDSD Traphaco & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-27834-17 (Rx)',
    sections: [
      {
        section: 'Thành phần & Phân loại KÊ ĐƠN (Rx)',
        content:
          'Cefixim 200mg (THUỐC KÊ ĐƠN - Rx): kháng sinh nhóm Cephalosporin thế hệ 3 đường uống. Điều trị nhiễm khuẩn tiết niệu, hô hấp, tai mũi họng nhạy cảm theo đơn bác sĩ.',
      },
      {
        section: 'Chống chỉ định & Thận trọng',
        content:
          'Chống chỉ định người dị ứng Cephalosporin hoặc từng sốc phản vệ với Penicillin. Cần điều chỉnh liều ở bệnh nhân suy thận.',
      },
    ],
  },
  {
    productNameMatch: 'Berberin Mộc Hoa Tràm',
    sourceName: 'Tờ HDSD Dược phẩm Trà Vinh & Dược thư VN',
    sourceRef: 'VD-23901-16',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Berberin 100mg (OTC thảo dược): chiết xuất Vàng đắng chứa Berberin clorid. Hỗ trợ điều trị tiêu chảy do nhiễm khuẩn nhẹ, lỵ trực khuẩn nhẹ, viêm ruột.',
      },
      {
        section: 'Chống chỉ định & Lưu ý',
        content:
          'CHỐNG CHỈ ĐỊNH cho phụ nữ có thai (berberin có thể kích thích co bóp tử cung) và người mẫn cảm. Tiêu chảy nặng cần bù nước Oresol là chính; nếu sốt cao hoặc phân có máu phải đi khám.',
      },
    ],
  },
  {
    productNameMatch: 'Smecta',
    sourceName: 'Tờ HDSD Ipsen Consumer Healthcare',
    sourceRef: 'VN-22410-19',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Smecta 3g (OTC): Diosmectite (chất bao phủ niêm mạc ruột tự nhiên). Điều trị triệu chứng tiêu chảy cấp ở trẻ em (> 2 tuổi) và người lớn kết hợp bù nước Oresol; giảm đau do bệnh thực quản-dạ dày-tá tràng.',
      },
      {
        section: 'Liều dùng & Tương tác',
        content:
          'Hòa tan 1 gói vào 50ml nước (hoặc thức ăn sệt cho trẻ). Uống CÁCH CÁC THUỐC KHÁC ÍT NHẤT 2 GIỜ vì Diosmectite có thể hấp phụ làm giảm hấp thu thuốc uống cùng.',
      },
    ],
  },
  {
    productNameMatch: 'Phosphalugel',
    sourceName: 'Tờ HDSD Pharmatis / Opella (Sanofi)',
    sourceRef: 'VN-21670-18',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Phosphalugel (OTC - thuốc chữ P): gel Nhôm Phosphat keo 20%. Kháng axit và tạo màng bảo vệ niêm mạc dạ dày, giảm đau rát thượng vị, đau bao tử, ợ chua, trào ngược dạ dày - thực quản.',
      },
      {
        section: 'Liều dùng & Lưu ý',
        content:
          'Uống nguyên gói 1–2 gói khi có cơn đau dạ dày hoặc sau ăn 1–2 giờ / trước khi đi ngủ, không quá 6 gói/ngày. Thận trọng người suy thận nặng; uống cách các thuốc khác tối thiểu 2 giờ.',
      },
    ],
  },
  {
    productNameMatch: 'Gaviscon Dual Action',
    sourceName: 'Tờ HDSD Reckitt Benckiser',
    sourceRef: 'VN-22319-19',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Gaviscon Dual Action (OTC): Natri alginate 500mg + Natri bicarbonat 213mg + Calci carbonat 325mg. Tạo lớp bè gel nổi trên dịch vị ngăn trào ngược axit thực quản và trung hòa axit dạ dày, giảm ợ nóng, đau rát sau xương ức, khó tiêu.',
      },
      {
        section: 'Liều dùng & Lưu ý',
        content:
          'Người lớn và trẻ >= 12 tuổi: uống 1–2 gói sau các bữa ăn và lúc đi ngủ (tối đa 4 lần/ngày). Chứa lượng natri và calci đáng kể, thận trọng người suy tim/suy thận hoặc kiêng muối.',
      },
    ],
  },
  {
    productNameMatch: 'Enterogermina',
    sourceName: 'Tờ HDSD Opella Healthcare (Sanofi Ý)',
    sourceRef: 'QLSP-1091-18',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Enterogermina (OTC): 2 tỷ bào tử Bacillus clausii kháng đa kháng sinh trong mỗi ống 5ml. Hỗ trợ phục hồi hệ vi sinh đường ruột, điều trị và phòng ngừa rối loạn khuẩn chí ruột, tiêu chảy, chướng bụng do loạn khuẩn hoặc dùng kháng sinh.',
      },
      {
        section: 'Liều dùng',
        content:
          'Lắc kỹ ống trước khi uống; trẻ em/trẻ nhũ nhi: 1–2 ống/ngày; người lớn: 2–3 ống/ngày cách đều nhau 3–4 giờ. Nếu đang uống kháng sinh nên uống Enterogermina xen kẽ giữa 2 liều kháng sinh.',
      },
    ],
  },
  {
    productNameMatch: 'Oresol 245',
    sourceName: 'Tờ HDSD & Hướng dẫn WHO/Bộ Y tế về Bù nước điện giải',
    sourceRef: 'VD-26045-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Oresol 245 áp lực thẩm thấu thấp (OTC): Glucose + Natri clorid + Kali clorid + Natri citrat. Bù nước và điện giải thiết yếu trong tiêu chảy cấp, nôn nhiều, sốt cao ra mồ hôi nhiều.',
      },
      {
        section: 'Cách pha CHUẨN (BẮT BUỘC ĐÚNG TỶ LỆ)',
        content:
          'Pha toàn bộ 1 gói vào ĐÚNG thể tích nước đun sôi để nguội ghi trên bao bì (thường 200ml hoặc 1000ml theo quy cách gói). TUYỆT ĐỐI KHÔNG chia nửa gói pha ước lượng hoặc pha quá đặc (có thể gây tăng natri máu nguy hiểm). Dung dịch đã pha chỉ dùng trong 24 giờ.',
      },
    ],
  },
  {
    productNameMatch: 'Omeprazol 20mg',
    sourceName: 'Tờ HDSD DHG Pharma & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-27501-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Omeprazol 20mg (thuốc ức chế bơm proton - PPI): giảm tiết acid dịch vị mạnh, dùng điều trị trào ngược dạ dày - thực quản (GERD), ợ nóng thường xuyên, viêm loét dạ dày tá tràng và phòng loét do NSAID.',
      },
      {
        section: 'Liều dùng & Thận trọng',
        content:
          'Nuốt nguyên viên nang bao tan trong ruột (không nhai/nghiền), uống 1 viên (20mg)/ngày trước bữa ăn sáng 30–60 phút. Không tự dùng liên tục quá 14 ngày nếu chưa nội soi/khám bác sĩ; nếu sút cân, nuốt nghẹn, nôn ra máu hoặc đi phân đen phải đi khám ngay.',
      },
    ],
  },
  {
    productNameMatch: 'Berocca Performance',
    sourceName: 'Tờ HDSD Bayer Consumer Care',
    sourceRef: 'VN-20880-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Berocca Performance (OTC): Vitamin nhóm B liều cao (B1, B2, B3, B5, B6, B12), Vitamin C 500mg, Calci, Magie và Kẽm. Bổ sung vitamin khoáng chất khi căng thẳng, mệt mỏi, làm việc trí óc hoặc hồi phục sau ốm.',
      },
      {
        section: 'Lưu ý',
        content:
          'Hòa tan 1 viên sủi trong 200ml nước uống vào buổi sáng. Nước tiểu có thể chuyển vàng tươi do Vitamin B2 (bình thường, không gây hại). Thận trọng người sỏi thận oxalat hoặc suy thận.',
      },
    ],
  },
  {
    productNameMatch: 'Vitamin C 500mg',
    sourceName: 'Tờ HDSD Dược phẩm OPC',
    sourceRef: 'VD-24120-16',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Vitamin C 500mg OPC (OTC): Acid ascorbic 500mg. Tăng sức đề kháng, phòng và điều trị thiếu vitamin C (bệnh Scorbut), hỗ trợ phục hồi khi nhiễm khuẩn nhẹ.',
      },
      {
        section: 'Thận trọng',
        content:
          'Uống vào ban ngày sau ăn. Tránh dùng liều cao (> 1000mg/ngày) kéo dài ở người sỏi thận oxalat, bệnh G6PD hoặc loét dạ dày nặng.',
      },
    ],
  },
  {
    productNameMatch: 'Magnesium B6',
    sourceName: 'Tờ HDSD Sanofi VN',
    sourceRef: 'VD-25230-16',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Magnesium B6 (OTC): Magie lactat dihydrat + Pyridoxin (Vitamin B6). Bổ sung thiếu hụt magie với biểu hiện mệt mỏi, dễ kích thích, chuột rút cơ nhẹ, rối loạn giấc ngủ nhẹ.',
      },
      {
        section: 'Chống chỉ định',
        content:
          'Chống chỉ định suy thận nặng (ClCr < 30ml/phút). Nếu vừa thiếu Calci nặng phải bổ sung Magie trước khi bổ sung Calci.',
      },
    ],
  },
  {
    productNameMatch: 'Omega-3 Orihiro',
    sourceName: 'Thông tin sản phẩm Orihiro Nhật Bản',
    sourceRef: 'TPBVSK-ORI-180',
    sections: [
      {
        section: 'Thành phần & Công dụng',
        content:
          'Dầu cá Omega-3 Orihiro (Thực phẩm bảo vệ sức khỏe): cung cấp EPA và DHA hỗ trợ sức khỏe tim mạch, não bộ và thị lực. Không phải là thuốc và không thay thế thuốc chữa bệnh.',
      },
      {
        section: 'Thận trọng',
        content:
          'Người đang dùng thuốc chống đông máu (warfarin, aspirin) hoặc chuẩn bị phẫu thuật nên hỏi bác sĩ trước khi dùng liều cao dầu cá.',
      },
    ],
  },
  {
    productNameMatch: 'Canxi Corbiere Extra',
    sourceName: 'Tờ HDSD Sanofi VN',
    sourceRef: 'VD-29301-18',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Canxi Corbiere Extra (OTC): Calci glucoheptonat + Vitamin C + Vitamin PP dạng ống uống. Bổ sung calci cho trẻ tăng trưởng chiều cao, phụ nữ có thai/cho con bú, người loãng xương.',
      },
      {
        section: 'Chống chỉ định',
        content:
          'Chống chỉ định tăng calci huyết, tăng calci niệu, sỏi thận calci nặng. Uống vào buổi sáng/trưa để tăng hấp thu và hạn chế lắng đọng.',
      },
    ],
  },
  {
    productNameMatch: 'Hoạt huyết dưỡng não Traphaco',
    sourceName: 'Tờ HDSD Traphaco VN',
    sourceRef: 'VD-26119-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Hoạt huyết dưỡng não Traphaco: cao Đinh lăng + cao Bạch quả (Ginkgo biloba). Hỗ trợ cải thiện tuần hoàn não, giảm hoa mắt chóng mặt, suy giảm trí nhớ, đau mỏi vai gáy do thiểu năng tuần hoàn não.',
      },
      {
        section: 'Chống chỉ định & Lưu ý',
        content:
          'Không dùng cho phụ nữ có thai, người đang chảy máu cấp, rối loạn đông máu hoặc ngay trước phẫu thuật. Nếu chóng mặt cấp kèm yếu liệt, nói khó phải đi cấp cứu đột quỵ ngay.',
      },
    ],
  },
  {
    productNameMatch: 'Ginkgo Biloba 120mg',
    sourceName: 'Tờ thông tin Nature Made & Dược thư tham khảo',
    sourceRef: 'TPBVSK-GB-120',
    sections: [
      {
        section: 'Thành phần & Thận trọng',
        content:
          'Ginkgo Biloba 120mg: chiết xuất lá Bạch quả hỗ trợ tuần hoàn máu não và trí nhớ. Thận trọng cao khi phối hợp với thuốc chống đông máu/kháng kết tập tiểu cầu (Warfarin, Clopidogrel, Aspirin) vì làm tăng nguy cơ chảy máu.',
      },
    ],
  },
  {
    productNameMatch: 'Telfast HD 180mg',
    sourceName: 'Tờ HDSD Sanofi (Opella) & Dược thư Quốc gia VN 2022',
    sourceRef: 'VN-21560-18',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Telfast HD 180mg (OTC): Fexofenadine HCl 180mg — thuốc kháng histamin H1 thế hệ 2 không gây buồn ngủ. Điều trị nổi mề đay mạn tính vô căn, ngứa da, viêm mũi dị ứng.',
      },
      {
        section: 'Liều dùng & Tương tác',
        content:
          'Người lớn và trẻ >= 12 tuổi: uống 1 viên (180mg)/ngày với nước lọc. KHÔNG uống cùng nước ép bưởi, cam, táo vì làm giảm hấp thu thuốc; uống cách thuốc kháng axit chứa Al/Mg ít nhất 2 giờ.',
      },
    ],
  },
  {
    productNameMatch: 'Loratadin 10mg',
    sourceName: 'Tờ HDSD Stada VN & Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-25902-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Loratadin 10mg (OTC): thuốc kháng histamin H1 thế hệ 2 ít gây buồn ngủ. Giảm triệu chứng viêm mũi dị ứng (hắt hơi, sổ mũi, ngứa mắt) và dị ứng ngoài da, nổi mề đay.',
      },
      {
        section: 'Liều dùng & Thận trọng',
        content:
          'Người lớn và trẻ > 12 tuổi: uống 1 viên (10mg)/ngày. Người suy gan nặng giảm liều còn 10mg cách ngày.',
      },
    ],
  },
  {
    productNameMatch: 'V.Rohto Vitamin',
    sourceName: 'Tờ HDSD Rohto-Mentholatum VN',
    sourceRef: 'VD-24599-16',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Thuốc nhỏ mắt V.Rohto Vitamin (OTC): Vitamin E, B6, Na Chondroitin Sulfate, K L-Aspartate, Chlorpheniramine. Giảm mỏi mắt, xung huyết kết mạc, ngứa mắt, phòng bệnh về mắt do bụi/bơi lội/máy tính.',
      },
      {
        section: 'Lưu ý vô khuẩn',
        content:
          'Nhỏ 2–3 giọt mỗi bên, 5–6 lần/ngày. Không để đầu lọ chạm vào lông mi/mắt; mở nắp chỉ sử dụng tối đa trong vòng 30 ngày.',
      },
    ],
  },
  {
    productNameMatch: 'Bepanthen',
    sourceName: 'Tờ HDSD Bayer Consumer Health',
    sourceRef: 'VN-20411-17',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Bepanthen Balm/Ointment (OTC): chứa Dexpanthenol (tiền vitamin B5) 5%. Phòng và điều trị hăm tã ở trẻ sơ sinh, da khô nứt nẻ, nứt đầu ti ở bà mẹ cho con bú, hỗ trợ phục hồi biểu bì da nhẹ.',
      },
    ],
  },
  {
    productNameMatch: 'Voltaren Emulgel',
    sourceName: 'Tờ HDSD GSK Consumer Healthcare',
    sourceRef: 'VN-21899-18',
    sections: [
      {
        section: 'Thành phần & Chỉ định',
        content:
          'Voltaren Emulgel 1% (OTC dùng ngoài): gel Diclofenac diethylamine 1.16%. Giảm đau tại chỗ và kháng viêm trong bong gân, căng cơ, đau lưng, viêm gân, thoái hóa khớp nông.',
      },
      {
        section: 'Chống chỉ định',
        content:
          'CHỈ BÔI NGOÀI DA lành; không bôi lên vết thương hở, niêm mạc mắt. Chống chỉ định người dị ứng Diclofenac/NSAID và phụ nữ mang thai 3 tháng cuối.',
      },
    ],
  },
  {
    productNameMatch: 'Natri Clorid 0.9%',
    sourceName: 'Dược thư Quốc gia VN 2022',
    sourceRef: 'VD-21004-15',
    sections: [
      {
        section: 'Thành phần & Cách dùng',
        content:
          'Nước muối sinh lý Natri Clorid 0.9% dùng ngoài (500ml): rửa vết thương ngoài da, súc miệng họng hỗ trợ giảm viêm họng, làm sạch khoang mũi. Lưu ý chai 500ml dùng rửa ngoài/súc miệng, KHÔNG dùng truyền tĩnh mạch và không dùng nhỏ mắt nếu không ghi vô khuẩn nhỏ mắt.',
      },
    ],
  },
  {
    productNameMatch: 'Microlife FR1MF1',
    sourceName: 'HDSD Thiết bị y tế Microlife (Thụy Sĩ)',
    sourceRef: 'TTBYT-2021-FR1MF1',
    sections: [
      {
        section: 'Công dụng & Cách đo đúng',
        content:
          'Nhiệt kế hồng ngoại không tiếp xúc Microlife FR1MF1: đo nhiệt độ cơ thể vùng trán cách da 1–3cm trong 1 giây, cảnh báo sốt >= 37.5°C. Nên để người được đo nghỉ ngơi trong phòng mát 10 phút và lau khô mồ hôi trán trước khi đo.',
      },
    ],
  },
];

const CLINICAL_GUIDELINES = [
  {
    docType: 'GUIDELINE',
    title: 'Phác đồ Tư vấn Dược lâm sàng: Sốt & Đau nhức (Trẻ em & Người lớn)',
    section: 'Phác đồ OTC tham khảo',
    sourceName: 'Dược thư Quốc gia Việt Nam 2022 & Hướng dẫn Nhà thuốc GPP Bộ Y tế',
    sourceRef: 'GPP-GL-FEVER-01',
    content:
      'Bước 1: Đánh giá nhiệt độ (>= 38.5°C mới cần hạ sốt bằng thuốc, kết hợp chườm ấm, mặc thoáng, uống đủ nước/Oresol). ' +
      'Bước 2 (Thuốc OTC ưu tiên): Trẻ em dùng Hapacol 250mg (Paracetamol 10–15mg/kg/lần mỗi 4–6h, không dùng Aspirin/Ibuprofen nếu nghi sốt xuất huyết). Người lớn dùng Efferalgan 500mg hoặc Panadol Extra 500mg/65mg (tối đa 4g Paracetamol/ngày; tuyệt đối không cộng dồn nhiều thuốc cùng chứa Paracetamol như Tiffy/Decolgen + Panadol). ' +
      'Cờ đỏ chuyển viện: sốt >= 39.5°C, co giật, phát ban xuất huyết, li bì, sốt kéo dài > 48–72 giờ.',
  },
  {
    docType: 'GUIDELINE',
    title: 'Phác đồ Tư vấn Dược lâm sàng: Đau dạ dày, Đau bao tử, Ợ nóng & Trào ngược',
    section: 'Phác đồ OTC tham khảo',
    sourceName: 'Dược thư Quốc gia Việt Nam 2022 & Hướng dẫn Tiêu hóa',
    sourceRef: 'GPP-GL-GI-02',
    content:
      'Phân biệt triệu chứng dạ dày - trào ngược axit: đau rát vùng thượng vị (đau bao tử), ợ hơi, ợ chua, nóng rát sau xương ức. ' +
      'Lựa chọn OTC phù hợp: (1) Giảm đau nhanh trung hòa axit & bảo vệ niêm mạc: Phosphalugel hoặc Gaviscon Dual Action uống sau ăn 1–2 giờ hoặc lúc đau (cách thuốc khác >= 2 giờ). (2) Giảm tiết axit mạnh kéo dài khi ợ nóng nhiều ngày: Omeprazol 20mg uống 1 viên trước ăn sáng 30 phút (tối đa 14 ngày OTC). ' +
      'Tránh tuyệt đối các thuốc NSAID (Ibuprofen, Voltaren uống) ở người đang đau bao tử. Cờ đỏ chuyển bác sĩ: nôn ra máu, đi cầu phân đen, sút cân không rõ nguyên nhân, đau bụng dữ dội.',
  },
  {
    docType: 'GUIDELINE',
    title: 'Phác đồ Tư vấn Dược lâm sàng: Ho có đờm, Đau rát họng & Cảm lạnh hô hấp',
    section: 'Phác đồ OTC tham khảo',
    sourceName: 'Hướng dẫn Dược lâm sàng Nhà thuốc GPP - Bộ Y tế',
    sourceRef: 'GPP-GL-RESP-03',
    content:
      'Đa số cảm lạnh, ho rát họng khởi phát do virus — KHÔNG TỰ Ý DÙNG KHÁNG SINH (Augmentin, Amoxicillin, Azithromycin, Cefixim đều là thuốc Kê đơn Rx phải có đơn bác sĩ). ' +
      'Lựa chọn OTC: Ho có đờm dùng Siro Ho Prospan (thảo dược) hoặc Acemuc 200mg (làm loãng đờm, thận trọng người hen/loét dạ dày). Đau rát họng súc họng nước muối Natri Clorid 0.9% và ngậm Strepsils Cool (>= 6 tuổi). Nghẹt mũi nhiều ngày xịt Otrivin 0.1% tối đa 5–7 ngày. ' +
      'Cờ đỏ đi khám: khó thở, thở nhanh rít, đau ngực, sốt cao kéo dài > 3 ngày hoặc ho khạc đờm lẫn máu.',
  },
  {
    docType: 'GUIDELINE',
    title: 'Phác đồ Tư vấn Dược lâm sàng: Tiêu chảy cấp & Bù nước điện giải',
    section: 'Phác đồ OTC tham khảo',
    sourceName: 'WHO & Hướng dẫn Xử trí Tiêu chảy cấp Bộ Y tế VN',
    sourceRef: 'GPP-GL-DIARRHEA-04',
    content:
      'Nguyên tắc vàng hàng đầu trong tiêu chảy cấp là BÙ NƯỚC & ĐIỆN GIẢI bằng Oresol 245 pha ĐÚNG tỷ lệ nước ghi trên gói (uống từng ngụm nhỏ, tuyệt đối không pha đặc hơn hướng dẫn). ' +
      'Hỗ trợ OTC kèm theo: Men vi sinh Enterogermina giúp phục hồi hệ khuẩn ruột, và Smecta (uống cách thuốc khác 2 giờ) giúp bao phủ niêm mạc, giảm số lần đi ngoài. Không dùng Berberin cho phụ nữ mang thai. ' +
      'Cờ đỏ nhập viện: mắt trũng, khát dữ dội, tiểu ít/không tiểu, nôn liên tục không uống được, sốt cao hoặc phân có máu/nhầy mũi.',
  },
  {
    docType: 'GUIDELINE',
    title: 'Phác đồ Tư vấn Dược lâm sàng: Viêm mũi dị ứng & Nổi mề đay',
    section: 'Phác đồ OTC tham khảo',
    sourceName: 'Dược thư Quốc gia Việt Nam 2022',
    sourceRef: 'GPP-GL-ALLERGY-05',
    content:
      'Ngứa da, nổi mề đay cấp, hắt hơi sổ mũi trong do dị ứng thời tiết/thức ăn có thể cân nhắc kháng histamin thế hệ 2 ít gây buồn ngủ như Loratadin 10mg (1 viên/ngày) hoặc Telfast HD 180mg (tránh uống cùng nước ép trái cây). ' +
      'CẢNH BÁO SỐC PHẢN VỆ: Nếu dị ứng kèm khó thở, khò khè, sưng phù môi/mắt/lưỡi, chóng mặt tụt huyết áp sau dùng thuốc hoặc ăn uống -> gọi cấp cứu 115 ngay lập tức.',
  },
  {
    docType: 'FAQ',
    title: 'Chính sách Giao Hàng Hỏa Tốc 2H & Miễn Phí Vận Chuyển',
    section: 'Giao nhận & Phí vận chuyển',
    sourceName: 'Quy trình Vận hành PharmaCore Direct',
    sourceRef: 'FAQ-SHIP-01',
    content:
      'Nhà thuốc PharmaCore Direct hỗ trợ giao nhanh hỏa tốc trong 2 giờ (EXPRESS_2H) tại khu vực nội thành và giao tiêu chuẩn (STANDARD). ' +
      'Đơn hàng bán lẻ có tổng giá trị từ 300.000đ trở lên được MIỄN PHÍ giao hàng. Mọi lô thuốc xuất kho đều áp dụng nguyên tắc FEFO (ưu tiên lô hạn dùng chuẩn còn dài ngày) và được Dược sĩ kiểm duyệt trước khi đóng gói.',
  },
  {
    docType: 'FAQ',
    title: 'Hướng dẫn Mua Thuốc Kê Đơn (Rx) & Tải Ảnh Đơn Thuốc Bảo Mật',
    section: 'Quy định Thuốc Kê Đơn (Rx)',
    sourceName: 'Quy trình Vận hành PharmaCore Direct & Thông tư BYT',
    sourceRef: 'FAQ-RX-02',
    content:
      'Theo quy định Bộ Y tế, đối với thuốc Kê đơn (có nhãn Kê đơn Rx màu đỏ), nhà thuốc chỉ cấp phát khi khách hàng tải lên ảnh chụp đơn thuốc hợp lệ của bác sĩ (hỗ trợ JPG, PNG, WEBP tối đa 3MB). ' +
      'Khách hàng có thể bấm nút "Gửi Đơn Thuốc (Rx)" trên thanh tiêu đề hoặc tải đơn trực tiếp khi thanh toán/trong khung chat Tư vấn để Dược sĩ thẩm định và gọi xác nhận trong 5 phút.',
  },
  {
    docType: 'FAQ',
    title: 'Hướng dẫn Tra Cứu & Tự Hủy Đơn Hàng Trực Tuyến',
    section: 'Tra cứu & Hủy đơn hàng',
    sourceName: 'Quy trình Vận hành PharmaCore Direct',
    sourceRef: 'FAQ-TRACK-03',
    content:
      'Sau khi đặt hàng thành công, hệ thống cấp Mã đơn hàng (OrderCode, vd: WEB-...) và Mã bảo mật tra cứu (TrackingToken dạng TRK-...). ' +
      'Bấm "Tra cứu đơn" trên đầu trang, nhập đúng Mã đơn + Mã TRK-... để xem trạng thái giao hàng theo thời gian thực. Khách có thể tự hủy đơn khi đơn vẫn đang ở trạng thái Chờ duyệt (PENDING_REVIEW).',
  },
  {
    docType: 'FAQ',
    title: 'Thanh Toán COD / VietQR & Cung Ứng Sỉ B2B Cho Phòng Khám',
    section: 'Thanh toán & Khách hàng Doanh nghiệp',
    sourceName: 'Quy trình Vận hành PharmaCore Direct',
    sourceRef: 'FAQ-PAY-B2B-04',
    content:
      'Storefront bán lẻ hỗ trợ thanh toán tiền mặt khi nhận hàng (COD) hoặc chuyển khoản ngân hàng qua mã VietQR đối soát tự động. ' +
      'Đối với Phòng khám, Bệnh viện hoặc Quầy thuốc cần mua số lượng lớn (B2B giá sỉ & xuất hóa đơn VAT), vui lòng chọn mục "Báo giá Sỉ B2B" để bộ phận Dược sĩ kinh doanh liên hệ lập hợp đồng cung ứng riêng.',
  },
  {
    docType: 'FAQ',
    title: 'Bán Lẻ Linh Hoạt Hộp / Vỉ / Viên & Tư Vấn Dược Sĩ Miễn Phí',
    section: 'Đơn vị bán lẻ & Liên hệ Dược sĩ',
    sourceName: 'Quy trình Vận hành PharmaCore Direct',
    sourceRef: 'FAQ-UNIT-05',
    content:
      'Nhiều sản phẩm OTC và thuốc đóng hộp cho phép chọn linh hoạt theo Hộp, Vỉ hoặc Viên lẻ đúng liều dùng thực tế ngay trên trang chi tiết sản phẩm. ' +
      'Khách hàng cần hỏi tương tác thuốc phức tạp, bệnh nền (huyết áp, tiểu đường, suy gan/thận), phụ nữ mang thai hoặc cho con bú có thể bấm "Gặp Dược sĩ" hoặc gọi tổng đài 1800-6868 để Dược sĩ chuyên môn tư vấn trực tiếp.',
  },
];

async function upsertDoc(
  prisma: PrismaClient,
  data: {
    ProductID: number | null;
    DocType: string;
    Title: string;
    Section: string;
    Content: string;
    SourceName: string;
    SourceRef: string | null;
    VerifiedBy: string;
  }
): Promise<'created' | 'updated'> {
  const existing = await prisma.knowledgeDocument.findFirst({
    where: {
      Title: data.Title,
      Section: data.Section,
    },
    select: { DocID: true },
  });

  if (existing) {
    await prisma.knowledgeDocument.update({
      where: { DocID: existing.DocID },
      data: {
        ProductID: data.ProductID,
        DocType: data.DocType,
        Content: data.Content,
        SourceName: data.SourceName,
        SourceRef: data.SourceRef,
        VerifiedBy: data.VerifiedBy,
        IsActive: true,
        VerifiedAt: new Date(),
      },
    });
    return 'updated';
  }

  await prisma.knowledgeDocument.create({
    data: {
      ProductID: data.ProductID,
      DocType: data.DocType,
      Title: data.Title,
      Section: data.Section,
      Content: data.Content,
      SourceName: data.SourceName,
      SourceRef: data.SourceRef,
      VerifiedBy: data.VerifiedBy,
      IsActive: true,
    },
  });
  return 'created';
}

export async function seedKnowledgeDocuments(targetPrisma: PrismaClient = defaultPrisma): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;

  const products = await targetPrisma.product.findMany({
    include: { packaging: true },
    orderBy: { ProductID: 'asc' },
  });

  const realProducts = products.filter((p) => !p.packaging?.IsTestOnly);

  for (const prod of realProducts) {
    const matched = VERIFIED_PRODUCT_LEAFLETS.find((entry) =>
      prod.ProductName.toLowerCase().includes(entry.productNameMatch.toLowerCase())
    );

    if (matched) {
      for (const sec of matched.sections) {
        const res = await upsertDoc(targetPrisma, {
          ProductID: prod.ProductID,
          DocType: 'LEAFLET',
          Title: `Tờ HDSD: ${prod.ProductName}`,
          Section: sec.section,
          Content: sec.content,
          SourceName: matched.sourceName,
          SourceRef: matched.sourceRef,
          VerifiedBy: 'Hội đồng Dược lâm sàng PharmaCore',
        });
        if (res === 'created') created += 1;
        else updated += 1;
      }
    } else if (prod.Description && prod.Description.trim().length > 10) {
      const rxText = prod.packaging?.IsRx ? 'THUỐC KÊ ĐƠN (Rx - chỉ bán theo đơn bác sĩ).' : 'Sản phẩm không kê đơn (OTC).';
      const res = await upsertDoc(targetPrisma, {
        ProductID: prod.ProductID,
        DocType: 'LEAFLET',
        Title: `Thông tin sản phẩm: ${prod.ProductName}`,
        Section: 'Thành phần & Chỉ định',
        Content: `${prod.ProductName} (${prod.ProductType} - ${rxText}). ${prod.Description}`,
        SourceName: 'Hồ sơ Sản phẩm Nội bộ & HDSD Nhà sản xuất',
        SourceRef: `SP-${prod.ProductID}`,
        VerifiedBy: 'Hội đồng Dược lâm sàng PharmaCore',
      });
      if (res === 'created') created += 1;
      else updated += 1;
    }
  }

  for (const gl of CLINICAL_GUIDELINES) {
    const res = await upsertDoc(targetPrisma, {
      ProductID: null,
      DocType: gl.docType,
      Title: gl.title,
      Section: gl.section,
      Content: gl.content,
      SourceName: gl.sourceName,
      SourceRef: gl.sourceRef,
      VerifiedBy: 'Hội đồng Dược lâm sàng PharmaCore',
    });
    if (res === 'created') created += 1;
    else updated += 1;
  }

  const total = await targetPrisma.knowledgeDocument.count({ where: { IsActive: true } });
  return { created, updated, total };
}

if (require.main === module) {
  seedKnowledgeDocuments(defaultPrisma)
    .then((stats) => {
      console.log('[SEED KNOWLEDGE OK]', stats);
      return defaultPrisma.$disconnect();
    })
    .catch(async (err) => {
      console.error('[SEED KNOWLEDGE FAILED]', err);
      await defaultPrisma.$disconnect();
      process.exit(1);
    });
}
