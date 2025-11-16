'use client';

import React from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/common';

interface HeaderProps {
  className?: string;
}

/**
 * Main header with logo and theme toggle
 */
export const Header: React.FC<HeaderProps> = ({ className = '' }) => {
  return (
    <header className={`border-b border-border bg-background ${className}`}>
      <div className="flex items-center justify-between h-16 px-6">
        {/* Logo */}
        <Link href="/workspace" className="flex items-center">
          <div className="text-2xl font-light uppercase tracking-tight text-primary" style={{ fontFamily: 'Inter, var(--font-geist-sans), sans-serif', fontWeight: 300 }}>
            Mimir
          </div>
        </Link>
        
        {/* Theme Toggle */}
        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
