export interface PharmacyVietQrProfile {
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  template: 'compact2' | 'compact' | 'qr_only';
}

export interface PharmacyStoreProfile {
  storeName: string;
  brandSubtitle: string;
  companyName: string;
  branchCode: string;
  branchName: string;
  hotline: string;
  supportPhone: string;
  email: string;
  address: string;
  openingHours: string;
  gppCertificateNo: string;
  gppIssuedBy: string;
  businessLicenseNo: string;
  pharmacistInCharge: string;
  pharmacistPracticeCertNo: string;
  vietQr: PharmacyVietQrProfile;
}

export const PHARMACY_STORE_PROFILE: PharmacyStoreProfile = {
  storeName: 'Nhà Thuốc Chuẩn GPP PharmaCore',
  brandSubtitle: 'Hệ thống Bán lẻ & Phân phối Dược phẩm Chính hãng',
  companyName: 'CÔNG TY CỔ PHẦN DƯỢC PHẨM PHARMACORE VIỆT NAM',
  branchCode: 'CS1-GPP',
  branchName: 'Cơ sở 1 — Trung tâm Dược phẩm & Tư vấn Lâm sàng Thanh Xuân',
  hotline: '1800 6868',
  supportPhone: '024 3868 6868',
  email: 'cskh@pharmacore.vn',
  address: 'Số 128 Nguyễn Trãi, Phường Thượng Đình, Quận Thanh Xuân, TP. Hà Nội',
  openingHours: '07:00 – 22:30 (Tất cả các ngày trong tuần)',
  gppCertificateNo: '108/GPP-SYT',
  gppIssuedBy: 'Sở Y tế TP. Hà Nội',
  businessLicenseNo: '0109886868',
  pharmacistInCharge: 'DS. Đặng Minh Đức',
  pharmacistPracticeCertNo: '004821/HNO-CCHND',
  vietQr: {
    bankId: 'MB',
    bankName: 'MB Bank (Ngân hàng TMCP Quân Đội)',
    accountNo: '0388889999',
    accountName: 'NHA THUOC PHARMACORE',
    template: 'compact2',
  },
};
