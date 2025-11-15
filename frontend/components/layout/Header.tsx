'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Code, PenTool } from 'lucide-react';
import { ThemeToggle } from '@/components/common';

interface HeaderProps {
  className?: string;
}

/**
 * Main header with logo, navigation tabs, and theme toggle
 */
export const Header: React.FC<HeaderProps> = ({ className = '' }) => {
  const pathname = usePathname();
  
  const navItems = [
    { id: 'text', label: 'Text', href: '/text', icon: FileText },
    { id: 'code', label: 'Code', href: '/code', icon: Code },
    { id: 'annotate', label: 'Annotate', href: '/annotate', icon: PenTool },
  ];
  
  const isActive = (href: string) => pathname === href;
  
  return (
    <header className={`border-b border-border bg-background ${className}`}>
      <div className="flex items-center justify-between h-16 px-6">
        {/* Logo */}
        <Link href="/text" className="flex items-center">
          <div className="text-2xl font-light uppercase tracking-tight text-primary" style={{ fontFamily: 'Inter, var(--font-geist-sans), sans-serif', fontWeight: 300 }}>
            Mimir
          </div>
        </Link>
        
        {/* Navigation Tabs */}
        <nav className="flex space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`
                  flex items-center space-x-2 px-4 py-2 rounded-lg
                  text-sm font-medium transition-all duration-200
                  ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        {/* Theme Toggle */}
        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
