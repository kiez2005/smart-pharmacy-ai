import React, { useState } from 'react';

const PHARMACY_FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" fill="none">
      <rect width="240" height="240" rx="24" fill="#F0FDFA"/>
      <rect x="74" y="54" width="92" height="132" rx="18" fill="#CCFBF1" stroke="#0D9488" stroke-width="5"/>
      <rect x="92" y="34" width="56" height="22" rx="6" fill="#0D9488"/>
      <path d="M120 94v44M98 116h44" stroke="#0F766E" stroke-width="10" stroke-linecap="round"/>
      <text x="120" y="212" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#0F766E">PHARMACORE GPP</text>
    </svg>`
  );

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  fallbackSrc = PHARMACY_FALLBACK_SVG,
  onError,
  ...rest
}) => {
  const [failed, setFailed] = useState(false);
  const effectiveSrc = !src || failed ? fallbackSrc : src;

  return (
    <img
      {...rest}
      src={effectiveSrc}
      alt={alt || 'Dược phẩm PharmaCore'}
      onError={(e) => {
        if (!failed) {
          setFailed(true);
        }
        onError?.(e);
      }}
    />
  );
};
