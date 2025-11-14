import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * Reusable Input component with clean borders and focus states
 * Shadcn-style: rounded, subtle borders, smooth transitions
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium mb-1.5 text-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            flex h-10 w-full rounded-lg border border-input
            bg-background px-3 py-2 text-sm
            ring-offset-background
            file:border-0 file:bg-transparent file:text-sm file:font-medium
            placeholder:text-muted-foreground
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
            disabled:cursor-not-allowed disabled:opacity-50
            transition-all
            ${error ? 'border-red-500' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-500 mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

