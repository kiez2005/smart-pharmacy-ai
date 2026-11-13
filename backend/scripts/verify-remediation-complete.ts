/**
 * Comprehensive End-to-End Remediation Verification Suite (S1-S3, A1-A7, D1, U4, P1)
 * Run against an isolated temporary SQLite DB copy (`DATABASE_URL=file:./tmp-verify.db`)
 * with `DISABLE_AUTO_LISTEN=1` so the live pharmacy.db is never polluted.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import assert from 'assert';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✅' : '❌'} [${name}] ${detail}`);
}

async function httpReq(
  baseUrl: string,
  method: string,
  urlPath: string,
  opts?: {
    token?: string;
    origin?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<{ status: number; headers: Headers; json: any; text: string }> {
  const headers: Record<string, string> = { ...(opts?.headers || {}) };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts?.origin) headers.Origin = opts.origin;
  if (opts?.body !== undefined && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body:
      opts?.body === undefined
        ? undefined
        : opts.body instanceof FormData
        ? opts.body
        : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

async function run() {
  process.env.DISABLE_AUTO_LISTEN = '1';
  const { app } = await import('../src/index');
  const { prisma } = await import('../src/config/prisma');
  const { productService } = await import('../src/services/product.service');

  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}/api`;
  const uploadedFilesToClean: string[] = [];

  try {
    // Seed temporary test accounts in isolated DB
    const pwHash = await bcrypt.hash('Verify@12345', 10);
    const ts = Date.now();
    const pharmacist = await prisma.user.create({
      data: {
        FullName: 'Dược sĩ Kiểm thử',
        Email: `pharm_${ts}@test.local`,
        Password: pwHash,
        Role: 'PHARMACIST',
        Status: 'ACTIVE',
      },
    });
    const cashier = await prisma.user.create({
      data: {
        FullName: 'Thu ngân Kiểm thử',
        Email: `cashier_${ts}@test.local`,
        Password: pwHash,
        Role: 'CASHIER',
        Status: 'ACTIVE',
      },
    });

    const loginPharm = await httpReq(baseUrl, 'POST', '/auth/login', {
      body: { Email: pharmacist.Email, Password: 'Verify@12345' },
    });
    const pharmToken: string = loginPharm.json?.data?.token;
    assert(loginPharm.status === 200 && pharmToken, 'Pharmacist login must succeed');

    const loginCashier = await httpReq(baseUrl, 'POST', '/auth/login', {
      body: { Email: cashier.Email, Password: 'Verify@12345' },
    });
    const cashierToken: string = loginCashier.json?.data?.token;
    assert(loginCashier.status === 200 && cashierToken, 'Cashier login must succeed');

    // Create isolated test products for multi-lot FEFO (D1) & clinical safety (S1/S2)
    const paraA = await prisma.product.create({
      data: {
        ProductName: `Paracetamol Alpha Test ${ts}`,
        ProductType: 'Giảm đau - Hạ sốt',
        Quantity: 8,
        Unit: 'Hộp',
        Price: 100000,
        Description: 'Paracetamol 500mg giảm đau hạ sốt',
      },
    });
    await prisma.productPackaging.create({
      data: {
        ProductID: paraA.ProductID,
        PackageUnit: 'Hộp',
        SmallestUnit: 'Viên',
        UnitsPerPackage: 10,
        AllowFractionalSale: false,
        IsPublished: true,
        IsTestOnly: false,
      },
    });
    const lotA1 = await prisma.stockLot.create({
      data: {
        ProductID: paraA.ProductID,
        BatchNumber: `LOT-A1-${ts}`,
        ExpiryDate: '2027-06-30',
        InitialQuantity: 3,
        RemainingQuantity: 3,
        Status: 'ACTIVE',
      },
    });
    const lotA2 = await prisma.stockLot.create({
      data: {
        ProductID: paraA.ProductID,
        BatchNumber: `LOT-A2-${ts}`,
        ExpiryDate: '2028-12-31',
        InitialQuantity: 5,
        RemainingQuantity: 5,
        Status: 'ACTIVE',
      },
    });

    const paraB = await prisma.product.create({
      data: {
        ProductName: `Efferalgan Test ${ts}`,
        ProductType: 'Giảm đau - Hạ sốt',
        Quantity: 10,
        Unit: 'Hộp',
        Price: 90000,
        Description: 'Chứa Paracetamol 500mg sủi',
      },
    });
    await prisma.productPackaging.create({
      data: {
        ProductID: paraB.ProductID,
        PackageUnit: 'Hộp',
        SmallestUnit: 'Viên',
        UnitsPerPackage: 10,
        AllowFractionalSale: false,
        IsPublished: true,
        IsTestOnly: false,
      },
    });
    await prisma.stockLot.create({
      data: {
        ProductID: paraB.ProductID,
        BatchNumber: `LOT-B1-${ts}`,
        ExpiryDate: '2028-12-31',
        InitialQuantity: 10,
        RemainingQuantity: 10,
        Status: 'ACTIVE',
      },
    });

    const amox = await prisma.product.create({
      data: {
        ProductName: `Augmentin Test ${ts}`,
        ProductType: 'Kháng sinh',
        Quantity: 10,
        Unit: 'Hộp',
        Price: 220000,
        Description: 'Amoxicillin 875mg + Clavulanic acid 125mg',
      },
    });
    await prisma.productPackaging.create({
      data: {
        ProductID: amox.ProductID,
        PackageUnit: 'Hộp',
        SmallestUnit: 'Viên',
        UnitsPerPackage: 14,
        AllowFractionalSale: false,
        IsPublished: true,
        IsTestOnly: false,
      },
    });
    await prisma.stockLot.create({
      data: {
        ProductID: amox.ProductID,
        BatchNumber: `LOT-AMOX-${ts}`,
        ExpiryDate: '2028-10-01',
        InitialQuantity: 10,
        RemainingQuantity: 10,
        Status: 'ACTIVE',
      },
    });

    // -------------------------------------------------------------------------
    // TEST S1: POS Critical Clinical Override RBAC + Structured Audit Log
    // -------------------------------------------------------------------------
    const s1CashierRes = await httpReq(baseUrl, 'POST', '/invoices', {
      token: cashierToken,
      body: {
        CustomerName: 'Khách POS Test',
        OrderType: 'RETAIL',
        Channel: 'POS',
        PaymentMethod: 'CASH',
        ClinicalOverrideCode: 'DOCTOR_CONFIRMED',
        ClinicalOverrideNote: 'Cashier attempting unauthorized override',
        items: [
          { ProductID: paraA.ProductID, Quantity: 1, Unit: 'Hộp' },
          { ProductID: paraB.ProductID, Quantity: 1, Unit: 'Hộp' },
        ],
      },
    });

    const s1PharmBadNote = await httpReq(baseUrl, 'POST', '/invoices', {
      token: pharmToken,
      body: {
        CustomerName: 'Khách POS Test',
        OrderType: 'RETAIL',
        Channel: 'POS',
        PaymentMethod: 'CASH',
        ClinicalOverrideCode: 'DOCTOR_CONFIRMED',
        ClinicalOverrideNote: 'ngắn',
        items: [
          { ProductID: paraA.ProductID, Quantity: 1, Unit: 'Hộp' },
          { ProductID: paraB.ProductID, Quantity: 1, Unit: 'Hộp' },
        ],
      },
    });

    const s1PharmOk = await httpReq(baseUrl, 'POST', '/invoices', {
      token: pharmToken,
      body: {
        CustomerName: 'Khách POS Test',
        OrderType: 'RETAIL',
        Channel: 'POS',
        PaymentMethod: 'CASH',
        ClinicalOverrideCode: 'STAGGERED_DOSING',
        ClinicalOverrideNote: 'Dược sĩ đã hướng dẫn dùng giãn cách theo phác đồ',
        items: [
          { ProductID: paraA.ProductID, Quantity: 1, Unit: 'Hộp' },
          { ProductID: paraB.ProductID, Quantity: 1, Unit: 'Hộp' },
        ],
      },
    });

    const s1Audit = s1PharmOk.json?.data?.InvoiceID
      ? await prisma.clinicalAuditLog.findFirst({
          where: { InvoiceID: s1PharmOk.json.data.InvoiceID },
        })
      : null;

    record(
      'S1',
      s1CashierRes.status === 403 &&
        [400, 422].includes(s1PharmBadNote.status) &&
        s1PharmOk.status === 201 &&
        s1Audit?.ReasonCode === 'STAGGERED_DOSING',
      `Cashier override=${s1CashierRes.status}, short note=${s1PharmBadNote.status}, Pharmacist override=${s1PharmOk.status}, AuditLog=${Boolean(s1Audit)}`
    );

    // -------------------------------------------------------------------------
    // TEST A2: Concurrent Atomic Idempotency (Promise.all) + Conflict 409
    // -------------------------------------------------------------------------
    const idemKey = `race-inv-${ts}`;
    const invPayload = {
      CustomerName: 'Khách Idempotent',
      OrderType: 'RETAIL',
      Channel: 'POS',
      PaymentMethod: 'VIETQR',
      items: [{ ProductID: paraB.ProductID, Quantity: 1, Unit: 'Hộp' }],
    };
    const [r1, r2] = await Promise.all([
      httpReq(baseUrl, 'POST', '/invoices', {
        token: pharmToken,
        headers: { 'Idempotency-Key': idemKey },
        body: invPayload,
      }),
      httpReq(baseUrl, 'POST', '/invoices', {
        token: pharmToken,
        headers: { 'Idempotency-Key': idemKey },
        body: invPayload,
      }),
    ]);
    const rConflict = await httpReq(baseUrl, 'POST', '/invoices', {
      token: pharmToken,
      headers: { 'Idempotency-Key': idemKey },
      body: { ...invPayload, CustomerName: 'Payload Khác' },
    });
    const idemCount = await prisma.invoice.count({ where: { CustomerName: 'Khách Idempotent' } });
    record(
      'A2',
      [200, 201].includes(r1.status) &&
        [200, 201].includes(r2.status) &&
        r1.json?.data?.InvoiceID === r2.json?.data?.InvoiceID &&
        idemCount === 1 &&
        rConflict.status === 409,
      `Concurrent statuses=(${r1.status},${r2.status}), same InvoiceID=${r1.json?.data?.InvoiceID === r2.json?.data?.InvoiceID}, DB count=${idemCount}, mismatch=${rConflict.status}`
    );

    // -------------------------------------------------------------------------
    // TEST D1: Multi-Lot FEFO Split & Exact Per-Lot Refund + Missing Lot Fail-Closed
    // -------------------------------------------------------------------------
    // At this point paraA had 3 in lotA1 and 5 in lotA2, minus 1 deducted in S1 => lotA1=2, lotA2=5
    const multiLotInv = await httpReq(baseUrl, 'POST', '/invoices', {
      token: pharmToken,
      body: {
        CustomerName: 'Khách MultiLot D1',
        OrderType: 'RETAIL',
        Channel: 'POS',
        PaymentMethod: 'CASH',
        items: [{ ProductID: paraA.ProductID, Quantity: 5, Unit: 'Hộp' }],
      },
    });
    const lotA1AfterDeduct = await prisma.stockLot.findUnique({ where: { LotID: lotA1.LotID } });
    const lotA2AfterDeduct = await prisma.stockLot.findUnique({ where: { LotID: lotA2.LotID } });
    const invItemLots = await prisma.invoiceItemLot.findMany({
      where: { invoiceItem: { InvoiceID: multiLotInv.json?.data?.InvoiceID } },
    });

    const cancelMulti = await httpReq(
      baseUrl,
      'POST',
      `/invoices/${multiLotInv.json?.data?.InvoiceID}/cancel`,
      { token: pharmToken, body: { cancelReason: 'Hoàn trả kiểm tra multi-lot' } }
    );
    const lotA1AfterRefund = await prisma.stockLot.findUnique({ where: { LotID: lotA1.LotID } });
    const lotA2AfterRefund = await prisma.stockLot.findUnique({ where: { LotID: lotA2.LotID } });

    // Missing lot fail-closed: Product.Quantity=3, NO StockLot rows
    const noLotProd = await prisma.product.create({
      data: {
        ProductName: `Thuốc Không Có Lô ${ts}`,
        ProductType: 'Kháng sinh',
        Quantity: 3,
        Unit: 'Hộp',
        Price: 50000,
        Description: 'Missing lot test',
      },
    });
    const noLotAttempt = await httpReq(baseUrl, 'POST', '/invoices', {
      token: pharmToken,
      body: {
        CustomerName: 'Khách Missing Lot',
        OrderType: 'RETAIL',
        Channel: 'POS',
        PaymentMethod: 'CASH',
        items: [{ ProductID: noLotProd.ProductID, Quantity: 1, Unit: 'Hộp' }],
      },
    });
    const synthLotsCount = await prisma.stockLot.count({
      where: { ProductID: noLotProd.ProductID },
    });

    // Clone check creates opening StockLot
    const cloned = await productService.cloneOne(paraA.ProductID);
    const clonedLotsCount = await prisma.stockLot.count({
      where: { ProductID: cloned.ProductID, Status: 'ACTIVE' },
    });

    record(
      'D1',
      multiLotInv.status === 201 &&
        lotA1AfterDeduct?.RemainingQuantity === 0 &&
        lotA2AfterDeduct?.RemainingQuantity === 2 &&
        invItemLots.length === 2 &&
        cancelMulti.status === 200 &&
        lotA1AfterRefund?.RemainingQuantity === 2 &&
        lotA2AfterRefund?.RemainingQuantity === 5 &&
        [400, 409].includes(noLotAttempt.status) &&
        synthLotsCount === 0 &&
        clonedLotsCount >= 1,
      `Split lots=${invItemLots.length}, post-deduct=(${lotA1AfterDeduct?.RemainingQuantity},${lotA2AfterDeduct?.RemainingQuantity}), post-refund=(${lotA1AfterRefund?.RemainingQuantity},${lotA2AfterRefund?.RemainingQuantity}), noLot=${noLotAttempt.status}, syntheticLots=${synthLotsCount}, clonedLots=${clonedLotsCount}`
    );

    // -------------------------------------------------------------------------
    // TEST A1 & A5 & S2: Public Order Guards, Multipart Rx Upload, Guest Allergy Persistence, TrackingToken
    // -------------------------------------------------------------------------
    // 1. A1 Guards
    const guardCust = await httpReq(baseUrl, 'POST', '/online-orders', {
      body: {
        CustomerID: 1,
        CustomerName: 'Hacker',
        CustomerPhone: '0912345678',
        ShippingAddress: '123 Test Street, Hanoi',
        items: [{ ProductID: amox.ProductID, Quantity: 1 }],
      },
    });
    const guardWholesale = await httpReq(baseUrl, 'POST', '/online-orders', {
      body: {
        OrderType: 'WHOLESALE',
        PaymentMethod: 'CREDIT',
        CustomerName: 'Hacker',
        CustomerPhone: '0912345678',
        ShippingAddress: '123 Test Street, Hanoi',
        items: [{ ProductID: amox.ProductID, Quantity: 1 }],
      },
    });
    const guardBase64 = await httpReq(baseUrl, 'POST', '/online-orders', {
      body: {
        CustomerName: 'Guest Inline Base64',
        CustomerPhone: '0912345678',
        ShippingAddress: '123 Test Street, Hanoi',
        PrescriptionImage: 'data:image/png;base64,iVBORw0KGgoAAAANS',
        items: [{ ProductID: amox.ProductID, Quantity: 1 }],
      },
    });
    record(
      'A1',
      guardCust.status === 403 && guardWholesale.status === 403 && guardBase64.status === 400,
      `CustomerID=${guardCust.status}, WHOLESALE/CREDIT=${guardWholesale.status}, Base64Inline=${guardBase64.status}`
    );

    // 2. A5 Rx Upload magic-byte check + RBAC download
    const fakeForm = new FormData();
    fakeForm.append(
      'prescription',
      new Blob(['NOT_A_REAL_PNG_FILE'], { type: 'image/png' }),
      'fake.png'
    );
    const badUpload = await httpReq(baseUrl, 'POST', '/online-orders/prescriptions', {
      body: fakeForm,
    });

    // Valid PNG magic header bytes + minimal IHDR bytes
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const validForm = new FormData();
    validForm.append('prescription', new Blob([validPngBytes], { type: 'image/png' }), 'rx.png');
    const goodUpload = await httpReq(baseUrl, 'POST', '/online-orders/prescriptions', {
      body: validForm,
    });
    const rxFileKey: string | undefined = goodUpload.json?.data?.fileKey;
    if (rxFileKey) {
      uploadedFilesToClean.push(
        path.resolve(__dirname, '..', 'uploads', 'prescriptions', rxFileKey)
      );
    }

    const dlGuest = rxFileKey
      ? await httpReq(baseUrl, 'GET', `/online-orders/prescriptions/${rxFileKey}`)
      : { status: 0 };
    const dlCashier = rxFileKey
      ? await httpReq(baseUrl, 'GET', `/online-orders/prescriptions/${rxFileKey}`, {
          token: cashierToken,
        })
      : { status: 0 };
    const dlPharm = rxFileKey
      ? await httpReq(baseUrl, 'GET', `/online-orders/prescriptions/${rxFileKey}`, {
          token: pharmToken,
        })
      : { status: 0 };

    // 3. S2 PatientAllergies preserved + A5 TrackingTokenHash
    const guestOrderRes = await httpReq(baseUrl, 'POST', '/online-orders', {
      body: {
        OrderType: 'RETAIL',
        CustomerName: 'Bệnh nhân Dị ứng Online',
        CustomerPhone: '0987654321',
        ShippingAddress: '45 Nguyễn Trãi, Hà Nội',
        ShippingMethod: 'EXPRESS_2H',
        PaymentMethod: 'COD',
        PatientAllergies: 'Penicillin',
        PrescriptionFileKey: rxFileKey,
        items: [{ ProductID: amox.ProductID, Quantity: 1, Unit: 'Hộp' }],
      },
    });

    const createdOrder = guestOrderRes.json?.data;
    const orderInDb = createdOrder?.OrderID
      ? await prisma.onlineOrder.findUnique({ where: { OrderID: createdOrder.OrderID } })
      : null;

    // Wrong tracking token & wrong phone should fail 403
    const trackWrong = createdOrder?.OrderCode
      ? await httpReq(
          baseUrl,
          'GET',
          `/online-orders/track?orderCode=${encodeURIComponent(createdOrder.OrderCode)}&trackingToken=TRK-WRONG`
        )
      : { status: 0 };
    const trackValid =
      createdOrder?.OrderCode && createdOrder?.TrackingToken
        ? await httpReq(
            baseUrl,
            'GET',
            `/online-orders/track?orderCode=${encodeURIComponent(createdOrder.OrderCode)}&trackingToken=${encodeURIComponent(createdOrder.TrackingToken)}`
          )
        : { status: 0, json: null };

    // Cashier review blocked, blind review blocked, valid Pharmacist review creates ClinicalAuditLog with PatientAllergies
    const reviewCashier = createdOrder?.OrderID
      ? await httpReq(baseUrl, 'POST', `/online-orders/${createdOrder.OrderID}/review`, {
          token: cashierToken,
          body: { action: 'APPROVE' },
        })
      : { status: 0 };
    const reviewBlind = createdOrder?.OrderID
      ? await httpReq(baseUrl, 'POST', `/online-orders/${createdOrder.OrderID}/review`, {
          token: pharmToken,
          body: { action: 'APPROVE' },
        })
      : { status: 0 };
    const reviewOk = createdOrder?.OrderID
      ? await httpReq(baseUrl, 'POST', `/online-orders/${createdOrder.OrderID}/review`, {
          token: pharmToken,
          body: {
            action: 'APPROVE',
            clinicalOverrideCode: 'DOCTOR_CONFIRMED',
            clinicalReviewNote: 'Đã liên hệ BS đổi chỉ định và theo dõi dị ứng lâm sàng',
          },
        })
      : { status: 0 };
    const s2Audit = createdOrder?.OrderID
      ? await prisma.clinicalAuditLog.findFirst({ where: { OnlineOrderID: createdOrder.OrderID } })
      : null;

    record(
      'S2',
      guestOrderRes.status === 201 &&
        orderInDb?.PatientAllergies === 'Penicillin' &&
        createdOrder?.ClinicalSafetyStatus === 'WARNING_REQUIRES_REVIEW' &&
        reviewCashier.status === 403 &&
        [400, 422].includes(reviewBlind.status) &&
        reviewOk.status === 200 &&
        s2Audit?.PatientAllergies === 'Penicillin',
      `Order=${guestOrderRes.status}, allergySaved=${orderInDb?.PatientAllergies}, warning=${createdOrder?.ClinicalSafetyStatus}, cashierReview=${reviewCashier.status}, blindReview=${reviewBlind.status}, pharmReview=${reviewOk.status}, auditAllergy=${s2Audit?.PatientAllergies}`
    );

    record(
      'A5',
      badUpload.status === 400 &&
        goodUpload.status === 201 &&
        dlGuest.status === 401 &&
        dlCashier.status === 403 &&
        dlPharm.status === 200 &&
        typeof createdOrder?.TrackingToken === 'string' &&
        createdOrder.TrackingToken.startsWith('TRK-') &&
        Boolean(orderInDb?.TrackingTokenHash) &&
        orderInDb?.TrackingToken === null &&
        trackWrong.status === 403 &&
        trackValid.status === 200,
      `BadUpload=${badUpload.status}, GoodUpload=${goodUpload.status}, DL(guest/cashier/pharm)=${dlGuest.status}/${dlCashier.status}/${dlPharm.status}, HashOnlyInDB=${orderInDb?.TrackingToken === null && Boolean(orderInDb?.TrackingTokenHash)}, Track(wrong/valid)=${trackWrong.status}/${trackValid.status}`
    );

    // -------------------------------------------------------------------------
    // TEST S3: AI Clinical Advisory Metadata & Zero Fake similarityScore
    // -------------------------------------------------------------------------
    const s3Diagnose = await httpReq(baseUrl, 'POST', '/ai/diagnose-chat', {
      token: pharmToken,
      body: { message: 'Bệnh nhân sốt 38.5 độ đau đầu' },
    });
    const recItems = s3Diagnose.json?.data?.recommendedProducts || [];
    const hasFakeSimilarity = recItems.some((item: any) => 'similarityScore' in item);
    const s3Interact = await httpReq(baseUrl, 'POST', '/enterprise/drug-interactions', {
      token: pharmToken,
      body: { productIds: [paraA.ProductID, paraB.ProductID], patientAllergies: '' },
    });
    record(
      'S3',
      s3Diagnose.status === 200 &&
        s3Diagnose.json?.data?.isAdvisoryOnly === true &&
        Boolean(s3Diagnose.json?.data?.disclaimer) &&
        !hasFakeSimilarity &&
        s3Interact.json?.data?.isAdvisoryOnly === true &&
        Boolean(s3Interact.json?.data?.warnings?.[0]?.ruleId) &&
        Boolean(s3Interact.json?.data?.warnings?.[0]?.source),
      `Diagnose advisory=${s3Diagnose.json?.data?.isAdvisoryOnly}, noSimilarityScore=${!hasFakeSimilarity}, interactRule=${s3Interact.json?.data?.warnings?.[0]?.ruleId}`
    );

    // -------------------------------------------------------------------------
    // TEST A3: Live DB User Validation, Role Change & Logout JWT Revocation
    // -------------------------------------------------------------------------
    const meBefore = await httpReq(baseUrl, 'GET', '/auth/me', { token: cashierToken });
    const logoutRes = await httpReq(baseUrl, 'POST', '/auth/logout', { token: cashierToken });
    const meAfterLogout = await httpReq(baseUrl, 'GET', '/auth/me', { token: cashierToken });
    record(
      'A3',
      meBefore.status === 200 && logoutRes.status === 200 && meAfterLogout.status === 401,
      `/me before logout=${meBefore.status}, logout=${logoutRes.status}, /me after logout=${meAfterLogout.status}`
    );

    // -------------------------------------------------------------------------
    // TEST A6 & U4: Sanitized Storefront Catalog DTO + Zero Test SKUs
    // -------------------------------------------------------------------------
    // Create a hidden test SKU that must NEVER appear in public catalog
    const hiddenSku = await prisma.product.create({
      data: {
        ProductName: `Thuốc Kiểm Thử Ẩn ${ts}`,
        ProductType: 'Kháng sinh',
        Quantity: 5,
        Unit: 'Hộp',
        Price: 10000,
        Description: 'Should be hidden from storefront',
      },
    });
    await prisma.productPackaging.create({
      data: {
        ProductID: hiddenSku.ProductID,
        PackageUnit: 'Hộp',
        SmallestUnit: 'Viên',
        UnitsPerPackage: 10,
        IsPublished: false,
        IsTestOnly: true,
      },
    });

    const catRes = await httpReq(baseUrl, 'GET', '/online-orders/catalog?page=1&limit=100');
    const catItems: any[] = catRes.json?.data?.items || [];
    const leakedFields = catItems.some(
      (i) =>
        'Quantity' in i ||
        'stockLots' in i ||
        'WholesalePrice' in (i.packaging || {}) ||
        'LooseUnits' in (i.packaging || {})
    );
    const leakedTestSku = catItems.some((i) => i.ProductID === hiddenSku.ProductID);
    const hasPublicDtoShape = catItems.every(
      (i) =>
        ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(i.StockStatus) &&
        typeof i.InStock === 'boolean' &&
        typeof i.MaxOrderQty === 'number'
    );
    record(
      'A6/U4',
      catRes.status === 200 && !leakedFields && !leakedTestSku && hasPublicDtoShape,
      `Items=${catItems.length}, noInternalFields=${!leakedFields}, noTestSku=${!leakedTestSku}, strictDtoShape=${hasPublicDtoShape}`
    );

    // -------------------------------------------------------------------------
    // TEST A7: Strict CORS Allowlist & Security Headers
    // -------------------------------------------------------------------------
    const evilCors = await httpReq(baseUrl, 'GET', '/health', {
      origin: 'http://evil-attacker.example.com',
    });
    const goodCors = await httpReq(baseUrl, 'GET', '/health', {
      origin: 'http://localhost:5174',
    });
    record(
      'A7',
      evilCors.status === 403 &&
        goodCors.status === 200 &&
        goodCors.headers.get('x-powered-by') === null &&
        goodCors.headers.get('x-content-type-options') === 'nosniff' &&
        goodCors.headers.get('x-frame-options') === 'DENY',
      `EvilOrigin=${evilCors.status}, AllowedOrigin=${goodCors.status}, noXPoweredBy=${goodCors.headers.get('x-powered-by') === null}, nosniff=${goodCors.headers.get('x-content-type-options')}`
    );

    // -------------------------------------------------------------------------
    // TEST P1 & A4: Pagination Metadata, SQLite Query Plans & Error Sanitization
    // -------------------------------------------------------------------------
    const pagedCat = await httpReq(baseUrl, 'GET', '/online-orders/catalog?page=1&limit=5');
    const badJsonRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"badJson": ',
    });
    const badJsonBody = await badJsonRes.json();

    // Verify SQLite EXPLAIN QUERY PLAN uses indexes on key filtered queries
    const dbUrl = process.env.DATABASE_URL || '';
    const dbFile = dbUrl.replace(/^file:/, '');
    const resolvedDbPath = path.isAbsolute(dbFile)
      ? dbFile
      : path.resolve(__dirname, '..', 'prisma', dbFile);
    let planUsesIndex = false;
    if (fs.existsSync(resolvedDbPath)) {
      const sql = new DatabaseSync(resolvedDbPath, { readOnly: true });
      const plan1 = sql
        .prepare(`EXPLAIN QUERY PLAN SELECT * FROM "StockLot" WHERE ProductID = 1 AND Status = 'ACTIVE'`)
        .all() as Array<{ detail: string }>;
      const plan2 = sql
        .prepare(`EXPLAIN QUERY PLAN SELECT * FROM "OnlineOrder" WHERE Status = 'PENDING_REVIEW' ORDER BY CreateDate DESC`)
        .all() as Array<{ detail: string }>;
      sql.close();
      planUsesIndex =
        plan1.some((r) => /USING INDEX|SEARCH/i.test(r.detail)) &&
        plan2.some((r) => /USING INDEX|SEARCH/i.test(r.detail));
    }

    record(
      'P1/A4',
      pagedCat.json?.data?.items?.length <= 5 &&
        typeof pagedCat.json?.data?.totalPages === 'number' &&
        badJsonRes.status >= 400 &&
        !('stack' in (badJsonBody || {})) &&
        planUsesIndex,
      `PagedItems=${pagedCat.json?.data?.items?.length}, totalPages=${pagedCat.json?.data?.totalPages}, errorSanitized=${!('stack' in (badJsonBody || {}))}, sqliteIndexPlan=${planUsesIndex}`
    );

    // Burst POST /api/auth/login with bad password to trigger express-rate-limit (default 25 / 15m)
    let rateLimitStatus = 0;
    let rateLimitCode: string | undefined;
    for (let i = 0; i < 28; i += 1) {
      const burst = await httpReq(baseUrl, 'POST', '/auth/login', {
        body: { Username: 'rate_probe', Password: 'wrong' },
      });
      if (burst.status === 429) {
        rateLimitStatus = burst.status;
        rateLimitCode = burst.json?.code;
        break;
      }
    }
    record(
      'A4-RateLimit',
      rateLimitStatus === 429,
      `Triggered HTTP=${rateLimitStatus}, code=${rateLimitCode ?? 'none'}`
    );
  } finally {
    for (const f of uploadedFilesToClean) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // ignore cleanup failure
        }
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('FATAL REMEDIATION VERIFY ERROR:', err);
  process.exit(1);
});
