import 'dotenv/config';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config/env';
import { prisma } from '../src/config/prisma';

const API_BASE = 'http://127.0.0.1:5000/api';
const PY_BASE = 'http://127.0.0.1:8000/api/py-ai';
const OLLAMA_BASE = 'http://127.0.0.1:11434';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];
function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✅ PASS' : '❌ FAIL'} | ${name}: ${detail}`);
}

async function main() {
  console.log('=== KIỂM THỬ TOÀN DIỆN LOCAL AI STACK (REAL MODELS END-TO-END) ===');

  // 1. Lấy JWT Dược sĩ hợp lệ đang active trong DB (không sửa đổi mật khẩu user)
  const pharm = await prisma.user.findFirst({
    where: { Role: 'PHARMACIST', Status: 'ACTIVE' },
  });
  if (!pharm) {
    throw new Error('Không tìm thấy tài khoản PHARMACIST đang ACTIVE trong DB.');
  }
  const token = jwt.sign(
    {
      UserID: pharm.UserID,
      Email: pharm.Email,
      Role: pharm.Role,
      FullName: pharm.FullName,
      TokenVersion: pharm.TokenVersion,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Test Model Single-Load & Real Health Check
  const healthBefore = await (await fetch(`${API_BASE}/ai/health`, { headers: authHeaders })).json();
  const hData = healthBefore?.data;
  const expectedModel = hData?.activeLlmModel || 'qwen2.5:7b';
  const isGeminiActive = hData?.activeLlmProvider === 'google-ai-studio';
  const allReady =
    hData?.status === 'OK' &&
    hData?.startupLoadCount === 1 &&
    hData?.singleLlmSharedPolicy === true &&
    (expectedModel === 'qwen2.5:7b' || isGeminiActive) &&
    hData?.models?.llm?.status === 'READY' &&
    hData?.models?.ocr?.status === 'READY' &&
    hData?.models?.stt?.status === 'READY' &&
    hData?.models?.embeddings?.status === 'READY';
  record(
    'MODEL-SINGLE-LOAD-HEALTH',
    allReady,
    `status=${hData?.status}, provider=${hData?.activeLlmProvider}, model=${expectedModel}, loadCount=${hData?.startupLoadCount}, docs=${hData?.indexStats?.knowledgeDocuments}, products=${hData?.indexStats?.products}`
  );

  // 3. Test Real OCR + Top-K Candidates + Unconfirmed Guard (Backend & Draft DB)
  const samplePngPath = path.join(os.tmpdir(), `verify-rx-${Date.now()}.png`);
  const blankPngPath = path.join(os.tmpdir(), `verify-blank-${Date.now()}.png`);
  const speechWavPath = path.join(os.tmpdir(), `verify-speech-${Date.now()}.wav`);
  let createdDraftId: number | null = null;

  try {
  execFileSync(
    'py',
    [
      '-3.10',
      '-c',
      `import cv2, numpy as np
img = np.full((620, 1080, 3), 255, dtype=np.uint8)
cv2.putText(img, "PHONG KHAM DA KHOA", (40, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20,20,20), 2)
cv2.putText(img, "1. Panadol Extra 500mg/65mg x 2 Hop", (40, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.95, (10,10,10), 2)
cv2.putText(img, "2. Omeprazol 20mg DHG x 1 Hop", (40, 245), cv2.FONT_HERSHEY_SIMPLEX, 0.95, (10,10,10), 2)
cv2.imwrite(r"${samplePngPath}", img)
blank = np.full((400, 600, 3), 255, dtype=np.uint8)
cv2.imwrite(r"${blankPngPath}", blank)`,
    ],
    { stdio: 'pipe' }
  );

  // 3a. Blank image MUST return 422 (zero mock fallback)
  const blankFd = new FormData();
  blankFd.append('file', new Blob([fs.readFileSync(blankPngPath)], { type: 'image/png' }), 'blank.png');
  const blankRes = await fetch(`${API_BASE}/ai/ocr-prescription`, {
    method: 'POST',
    headers: authHeaders,
    body: blankFd,
  });
  record('OCR-REJECT-BLANK', blankRes.status === 422, `status=${blankRes.status}`);

  // 3b. Real prescription OCR
  const ocrFd = new FormData();
  ocrFd.append('file', new Blob([fs.readFileSync(samplePngPath)], { type: 'image/png' }), 'prescription.png');
  const ocrRes = await fetch(`${API_BASE}/ai/ocr-prescription`, {
    method: 'POST',
    headers: authHeaders,
    body: ocrFd,
  });
  const ocrJson = (await ocrRes.json())?.data;
  if (ocrJson?.draftId) createdDraftId = ocrJson.draftId;
  const line1 = ocrJson?.lines?.find((l: any) => l.candidates?.some((c: any) => c.ProductName.includes('Panadol')));
  const line2 = ocrJson?.lines?.find((l: any) => l.candidates?.some((c: any) => c.ProductName.includes('Omeprazol')));
  record(
    'OCR-REAL-TOPK',
    ocrRes.status === 200 &&
      Boolean(ocrJson?.draftId) &&
      ocrJson?.engine?.includes('RapidOCR') &&
      ocrJson?.allLinesConfirmed === false &&
      Boolean(line1) &&
      Boolean(line2) &&
      ocrJson.lines.every((l: any) => l.confirmed === false && l.selectedProductId === null),
    `engine=${ocrJson?.engine}, lines=${ocrJson?.lines?.length}, cand1=${line1?.candidates?.[0]?.ProductName} (${line1?.candidates?.[0]?.combinedConfidence})`
  );

  // 3c. Unconfirmed OCR draft MUST block POST /api/invoices (HTTP 400 OCR_ITEMS_UNCONFIRMED)
  const blockedInvRes = await fetch(`${API_BASE}/invoices`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      CustomerName: 'Test OCR Guard',
      PaymentMethod: 'CASH',
      ocrDraftId: ocrJson?.draftId,
      ocrVerification: {
        draftId: ocrJson?.draftId,
        confirmedLines: 0,
        unconfirmedCount: 2,
      },
      items: [{ ProductID: line1?.candidates?.[0]?.ProductID || 1, Quantity: 1 }],
    }),
  });
  const blockedInvJson = await blockedInvRes.json();
  record(
    'OCR-UNCONFIRMED-INVOICE-BLOCK',
    blockedInvRes.status === 400 && blockedInvJson?.code === 'OCR_ITEMS_UNCONFIRMED',
    `status=${blockedInvRes.status}, code=${blockedInvJson?.code}`
  );

  // 3d. Verify draft lines on backend
  const verifyRes = await fetch(`${API_BASE}/ai/ocr-drafts/${ocrJson?.draftId}/verify`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lines: [
        {
          lineId: line1.lineId,
          selectedProductId: line1.candidates[0].ProductID,
          quantity: 2,
          dosage: 'Uống 1 viên khi sốt',
          confirmed: true,
        },
        {
          lineId: line2.lineId,
          selectedProductId: line2.candidates[0].ProductID,
          quantity: 1,
          dosage: 'Uống 1 viên trước ăn sáng',
          confirmed: true,
        },
      ],
    }),
  });
  const verifyJson = (await verifyRes.json())?.data;
  record(
    'OCR-VERIFY-DRAFT',
    verifyRes.status === 200 && verifyJson?.status === 'CONFIRMED' && verifyJson?.confirmedLines === 2,
    `status=${verifyJson?.status}, confirmedLines=${verifyJson?.confirmedLines}`
  );

  // 4. Unified Qwen 2.5 7B RAG Chatbot (Drug Q&A + Symptom Consultation + Single LLM check)
  const qaRes = await fetch(`${API_BASE}/ai/chat-rag`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'DRUG_QA',
      message: 'Panadol Extra 500mg/65mg có liều dùng tối đa và chống chỉ định như thế nào?',
    }),
  });
  const qaJson = (await qaRes.json())?.data;
  record(
    'RAG-DRUG-QA',
    qaRes.status === 200 &&
      qaJson?.modelUsed === expectedModel &&
      qaJson?.mode === 'DRUG_QA' &&
      Array.isArray(qaJson?.citations) &&
      qaJson.citations.length >= 1 &&
      /\[DOC-\d+\]/.test(qaJson?.answer || ''),
    `model=${qaJson?.modelUsed}, citations=${qaJson?.citations?.length}, docIds=${qaJson?.citations?.map((c: any) => c.docId).join(',')}`
  );

  const symRes = await fetch(`${API_BASE}/ai/chat-rag`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'SYMPTOM_CONSULTATION',
      message: 'Bé nặng 20kg bị sốt 38.8 độ, nên dùng thuốc hạ sốt nào an toàn và dấu hiệu nào cần đi viện?',
    }),
  });
  const symJson = (await symRes.json())?.data;
  const noRxSuggested = (symJson?.suggestedProducts || []).every((p: any) => !p.IsRx);
  record(
    'RAG-SYMPTOM-CONSULTATION',
    symRes.status === 200 &&
      symJson?.modelUsed === expectedModel &&
      symJson?.mode === 'SYMPTOM_CONSULTATION' &&
      Array.isArray(symJson?.citations) &&
      symJson.citations.length >= 1 &&
      noRxSuggested,
    `model=${symJson?.modelUsed}, citations=${symJson?.citations?.length}, otcProducts=${symJson?.suggestedProducts?.map((p: any) => p.ProductName).join(',')}`
  );

  const oodRes = await fetch(`${API_BASE}/ai/chat-rag`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Thuốc ngoài hành tinh XenoPharm-9999XYZ trị bệnh gì?',
    }),
  });
  const oodJson = (await oodRes.json())?.data;
  record(
    'RAG-OUT-OF-DOMAIN-BLOCK',
    oodRes.status === 200 && oodJson?.insufficientKnowledge === true && oodJson?.citations?.length === 0,
    `insufficient=${oodJson?.insufficientKnowledge}, citations=${oodJson?.citations?.length}`
  );

  // Verify single LLM policy in Ollama (/api/ps): 0 when cloud Gemini active, 1 qwen2.5:7b when local Ollama active
  const ollamaPs = await (await fetch(`${OLLAMA_BASE}/api/ps`)).json();
  const activeModels = (ollamaPs?.models || []).map((m: any) => m.name);
  record(
    'SINGLE-QWEN-IN-VRAM',
    isGeminiActive ? activeModels.length <= 1 : activeModels.length === 1 && activeModels[0].startsWith('qwen2.5:7b'),
    `provider=${hData?.activeLlmProvider}, activeOllamaModels=${JSON.stringify(activeModels)}`
  );

  // 5. Faster-Whisper Local STT (synthesize real spoken WAV with Windows SAPI TTS)
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${speechWavPath}'); $s.Speak('Paracetamol 500 milligrams for fever'); $s.Dispose()`,
    ],
    { stdio: 'pipe' }
  );
  const sttFd = new FormData();
  sttFd.append('file', new Blob([fs.readFileSync(speechWavPath)], { type: 'audio/wav' }), 'speech.wav');
  const sttRes = await fetch(`${API_BASE}/ai/speech-to-text`, {
    method: 'POST',
    headers: authHeaders,
    body: sttFd,
  });
  const sttJson = (await sttRes.json())?.data;
  record(
    'STT-FASTER-WHISPER',
    sttRes.status === 200 &&
      sttJson?.modelUsed?.includes('faster-whisper') &&
      /paracetamol/i.test(sttJson?.text || ''),
    `model=${sttJson?.modelUsed}, text="${sttJson?.text}", time=${sttJson?.processingTimeSec}s`
  );

  // 6. Hybrid Search (Exact + Typo + Semantic + Gibberish)
  const hExact = await (await fetch(`${API_BASE}/online-orders/catalog?search=Panadol`)).json();
  const hTypo = await (await fetch(`${API_BASE}/online-orders/catalog?search=paracetamon`)).json();
  const hSem1 = await (await fetch(`${API_BASE}/online-orders/catalog?search=${encodeURIComponent('thuốc hạ sốt trẻ em')}`)).json();
  const hSem2 = await (await fetch(`${API_BASE}/online-orders/catalog?search=${encodeURIComponent('đau bao tử')}`)).json();
  const hZero = await (await fetch(`${API_BASE}/online-orders/catalog?search=xyz999khongtontai`)).json();

  const sem1Names = (hSem1?.data?.items || []).map((p: any) => p.ProductName);
  const sem2Names = (hSem2?.data?.items || []).map((p: any) => p.ProductName);

  record(
    'HYBRID-SEARCH-STOREFRONT',
    hExact?.data?.searchMeta?.engine === 'hybrid-rrf' &&
      (hExact?.data?.items || []).some((p: any) => p.ProductName.includes('Panadol')) &&
      (hTypo?.data?.items || []).some((p: any) => p.Description?.includes('Paracetamol') || p.ProductName.includes('Panadol')) &&
      sem1Names.some((n: string) => /Hapacol|Efferalgan|Panadol/i.test(n)) &&
      sem2Names.some((n: string) => /Phosphalugel|Omeprazol|Gaviscon/i.test(n)) &&
      hZero?.data?.total === 0,
    `engine=${hExact?.data?.searchMeta?.engine}, semFever=${sem1Names.slice(0, 3).join(', ')}, semStomach=${sem2Names.slice(0, 3).join(', ')}, zero=${hZero?.data?.total}`
  );

  // 7. Storefront Public Chatbot: Fast-Path + CRAG Mở rộng + SSE Streaming + A6 DTO Allowlist + Red Flag
  const sfHelloRes = await fetch(`${API_BASE}/online-orders/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Xin chào' }),
  });
  const sfHello = (await sfHelloRes.json())?.data;
  record(
    'STOREFRONT-FAST-PATH',
    sfHelloRes.status === 200 &&
      sfHello?.groundingMode === 'FAST_PATH' &&
      sfHello?.insufficientKnowledge === false &&
      Boolean(sfHello?.answer),
    `status=${sfHelloRes.status}, grounding=${sfHello?.groundingMode}`
  );

  const sfGeneralRes = await fetch(`${API_BASE}/online-orders/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Bị nhiệt miệng đau rát nên súc miệng hay bôi gì cho mau khỏi?' }),
  });
  const sfGeneral = (await sfGeneralRes.json())?.data;
  record(
    'STOREFRONT-CRAG-GENERAL-MEDICAL',
    sfGeneralRes.status === 200 &&
      sfGeneral?.insufficientKnowledge === false &&
      (sfGeneral?.groundingMode === 'GENERAL_MEDICAL' || sfGeneral?.groundingMode === 'LOCAL_HDSD') &&
      String(sfGeneral?.answer || '').length >= 40,
    `status=${sfGeneralRes.status}, grounding=${sfGeneral?.groundingMode}, insufficient=${sfGeneral?.insufficientKnowledge}, len=${sfGeneral?.answer?.length}`
  );

  const sfFaqRes = await fetch(`${API_BASE}/online-orders/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Phí giao hàng 2h và đơn bao nhiêu tiền thì được miễn phí ship?' }),
  });
  const sfFaq = (await sfFaqRes.json())?.data;
  record(
    'STOREFRONT-FAQ-LOGISTICS',
    sfFaqRes.status === 200 &&
      sfFaq?.insufficientKnowledge === false &&
      Array.isArray(sfFaq?.citations) &&
      sfFaq.citations.length >= 1,
    `citations=${sfFaq?.citations?.length}, grounding=${sfFaq?.groundingMode}`
  );

  // SSE Streaming + A6 Public DTO check
  const sseResp = await fetch(`${API_BASE}/online-orders/assistant/chat-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'SYMPTOM_CONSULTATION',
      message: 'Đau bao tử ợ chua nóng rát nên dùng thuốc OTC nào?',
    }),
  });
  const sseText = await sseResp.text();
  const hasMeta = sseText.includes('event: meta');
  const hasDelta = sseText.includes('event: delta');
  const doneMatch = sseText.match(/event: done\s+data: (.+)/);
  const doneJson = doneMatch ? JSON.parse(doneMatch[1]) : null;
  const publicDtoValid =
    Array.isArray(doneJson?.suggestedProducts) &&
    doneJson.suggestedProducts.every(
      (p: any) =>
        'StockStatus' in p &&
        'InStock' in p &&
        !('TotalStock' in p) &&
        !('Quantity' in p) &&
        !p.IsRx
    );
  record(
    'STOREFRONT-SSE-STREAM-A6',
    sseResp.status === 200 &&
      hasMeta &&
      hasDelta &&
      Boolean(doneJson?.answer) &&
      publicDtoValid,
    `meta=${hasMeta}, delta=${hasDelta}, products=${doneJson?.suggestedProducts?.length}, dtoClean=${publicDtoValid}`
  );

  const sfRedRes = await fetch(`${API_BASE}/online-orders/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Tôi đột ngột khó thở và đau thắt ngực dữ dội' }),
  });
  const sfRed = (await sfRedRes.json())?.data;
  record(
    'STOREFRONT-EMERGENCY-REDFLAG',
    sfRedRes.status === 200 &&
      sfRed?.emergencyAlert === true &&
      sfRed?.shouldConsultPharmacist === true &&
      /115/.test(JSON.stringify(sfRed?.warnings || []) + (sfRed?.answer || '')),
    `emergency=${sfRed?.emergencyAlert}, consult=${sfRed?.shouldConsultPharmacist}`
  );

  // Re-check startupLoadCount did not increase after all inferences!
  const healthAfter = await (await fetch(`${PY_BASE}/health`)).json();
  record(
    'SINGLE-LOAD-INVARIANT',
    healthAfter?.startupLoadCount === 1,
    `startupLoadCount=${healthAfter?.startupLoadCount}`
  );
  } finally {
    try { fs.unlinkSync(samplePngPath); } catch {}
    try { fs.unlinkSync(blankPngPath); } catch {}
    try { fs.unlinkSync(speechWavPath); } catch {}
    if (createdDraftId) {
      await prisma.ocrDraft.delete({ where: { DraftID: createdDraftId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n=== TỔNG KẾT: ${results.length - failed.length}/${results.length} PASSED ===`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ SCRIPT CRASH:', err);
  process.exit(1);
});
