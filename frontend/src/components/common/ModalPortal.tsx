import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * ModalPortal: Render modal trực tiếp ra document.body
 * Đảm bảo lớp nền mờ (backdrop overlay) bao phủ 100% toàn bộ viewport màn hình,
 * che phủ hoàn toàn cả Top Header lẫn Sidebar, tuyệt đối không bị hở ở trên hay viền.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
};
