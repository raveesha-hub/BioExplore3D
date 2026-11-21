import React, { useState } from 'react';
import { Dna } from 'lucide-react';

interface BrandLogoProps {
  size?: 'sm' | 'md';
}

export const LOGO_IMAGE_PATH =
  '/assets/aistudio/3D_Biotechnology_Logo_Design___Life_Science_Branding_9c2b7cc7.jpg';

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  const boxSize = size === 'sm' ? 'w-7 h-7 rounded-md' : 'w-9 h-9 rounded-lg';
  const textSize = size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      {!imgFailed ? (
        <img
          src={LOGO_IMAGE_PATH}
          alt="BioExplora 3D logo"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${boxSize} object-cover shrink-0 border border-sky-200/80 dark:border-slate-700 bg-white`}
        />
      ) : (
        <span
          className={`${boxSize} shrink-0 bg-gradient-to-br from-sky-600 to-emerald-600 text-white flex items-center justify-center`}
        >
          <Dna className="w-4 h-4" />
        </span>
      )}
      <span className={`font-display ${textSize} font-bold tracking-tight whitespace-nowrap`}>
        <span className="text-sky-600 dark:text-sky-400">Bio</span>
        <span className="text-emerald-600 dark:text-emerald-400">Explora</span>{' '}
        <span className="text-blue-700 dark:text-sky-300">3D</span>
      </span>
    </span>
  );
};
