import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertOctagon, CheckCircle2, RefreshCw } from 'lucide-react';
import { aiApi, AiModelsHealthReport } from '../../services/ai.api';

interface AiModelsHealthBarProps {
  compact?: boolean;
  onHealthLoaded?: (report: AiModelsHealthReport) => void;
}

export const AiModelsHealthBar: React.FC<AiModelsHealthBarProps> = ({
  compact = false,
  onHealthLoaded,
}) => {
  const [health, setHealth] = useState<AiModelsHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await aiApi.getHealth();
      setHealth(data);
      onHealthLoaded?.(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [onHealthLoaded]);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const items = health
    ? [
        { key: 'llm', label: 'Tư Vấn Lâm Sàng', desc: 'Phân tích đơn & triệu chứng', data: health.models.llm },
        { key: 'ocr', label: 'Nhận Diện Đơn Thuốc', desc: 'Quét bảng thuốc điều trị', data: health.models.ocr },
        { key: 'stt', label: 'Nhận Diện Giọng Nói', desc: 'Chuyển giọng nói tiếng Việt', data: health.models.stt },
        { key: 'embeddings', label: 'Tra Cứu Dược Thư', desc: 'Đối chiếu HDSD & Dược thư', data: health.models.embeddings },
      ]
    : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity
            className={`h-4 w-4 ${
              health?.status === 'OK'
                ? 'text-emerald-600'
                : health?.status === 'DEGRADED'
                  ? 'text-amber-600'
                  : 'text-rose-600'
            }`}
          />
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            Hệ Thống Trợ Lý AI Dược Lâm Sàng
          </span>
          {health && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                health.status === 'OK'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : health.status === 'DEGRADED'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {health.status === 'OK' ? 'Hoạt động ổn định' : 'Đang kiểm tra kết nối'} •{' '}
              {health.indexStats.products} danh mục thuốc / {health.indexStats.knowledgeDocuments}{' '}
              tài liệu HDSD
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void fetchHealth()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Làm mới trạng thái
        </button>
      </div>

      {!compact && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {items.map(({ key, label, desc, data }) => {
            const isReady = data.status === 'READY';
            return (
              <div
                key={key}
                className={`rounded-lg border px-2.5 py-2 text-xs ${
                  isReady
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-rose-200 bg-rose-50/70'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-slate-800">{label}</span>
                  <span
                    className={`inline-flex items-center gap-1 font-bold text-[10px] ${
                      isReady ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {isReady ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertOctagon className="h-3 w-3" />
                    )}
                    {isReady ? 'Sẵn sàng' : 'Tạm ngưng'}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">{desc}</div>
              </div>
            );
          })}
        </div>
      )}

      {health && health.deadModels.length > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <AlertOctagon className="h-4 w-4 shrink-0 text-rose-600" />
            Cảnh báo kết nối dịch vụ AI lâm sàng:
          </div>
          <ul className="list-disc pl-5 text-[11px] space-y-0.5">
            {health.deadModels.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
