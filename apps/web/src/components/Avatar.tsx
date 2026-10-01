import React, { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 40,
  className = '',
  style = {},
}) => {
  const [hasError, setHasError] = useState(false);

  // If user has a custom avatar (not null, not empty) and image hasn't failed to load
  if (src && src.trim() !== '' && !hasError) {
    return (
      <img
        src={src}
        alt={name ? `Avatar de ${name}` : 'Avatar do usuário'}
        onError={() => setHasError(true)}
        className={`user-avatar ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'inline-block',
          ...style,
        }}
      />
    );
  }

  // Incógnita avatar (mystery/anonymous question mark silhouette)
  return (
    <div
      className={`user-avatar incognita-avatar ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#2b2d31',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none',
        color: '#949ba4',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
        ...style,
      }}
      title={name ? `${name} (Foto não definida - Incógnita)` : 'Incógnita'}
    >
      <svg
        width={Math.round(size * 0.55)}
        height={Math.round(size * 0.55)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
      </svg>
    </div>
  );
};
