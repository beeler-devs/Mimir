'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  ariaLabel = 'Select an option',
  className = 'w-48',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  const handleToggle = () => setIsOpen(!isOpen);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="
          w-full flex items-center justify-between px-4 py-2
          border border-border rounded-xl bg-background
          text-sm text-foreground
          hover:border-primary/60 transition-colors
          text-left
        "
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        <div className="flex flex-col overflow-hidden">
          <span className="truncate font-medium">{selectedOption?.label || 'Select...'}</span>
          {selectedOption?.description && (
            <span className="text-xs text-muted-foreground truncate">
              {selectedOption.description}
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="
            absolute z-10 mt-1 w-full
            bg-background border border-border rounded-xl shadow-lg
            py-1 max-h-64 overflow-y-auto
          "
          role="listbox"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`
                w-full text-left px-4 py-2 text-sm
                hover:bg-muted transition-colors
                ${option.value === value ? 'bg-primary/5' : ''}
              `}
              role="option"
              aria-selected={option.value === value}
            >
              <div className="font-medium text-foreground">
                {option.label}
              </div>
              {option.description && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
