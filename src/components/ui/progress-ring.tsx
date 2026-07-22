import React from 'react';

interface ProgressRingProps {
  value: number; // 0–100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  value,
  size = 80,
  strokeWidth = 7,
  color = '#2EAF6F',
  trackColor = '#E5E7EB',
  label,
  sublabel,
  className = '',
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {(label || sublabel || children) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
          {label && <span className="font-black leading-none" style={{ fontSize: size * 0.2, color: '#1A1A2E', fontFamily: 'Nunito, sans-serif' }}>{label}</span>}
          {sublabel && <span className="leading-none mt-0.5" style={{ fontSize: size * 0.13, color: '#9CA3AF' }}>{sublabel}</span>}
        </div>
      )}
    </div>
  );
}
