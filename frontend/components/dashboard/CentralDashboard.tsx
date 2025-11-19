'use client';

import React from 'react';
import { InstanceType } from '@/lib/types';
import { InstanceCreationForm } from './InstanceCreationForm';

interface CentralDashboardProps {
  onCreateInstance: (title: string, type: InstanceType, additionalData?: any) => Promise<void>;
}

export const CentralDashboard: React.FC<CentralDashboardProps> = ({ onCreateInstance }) => {
  return (
    <div className="flex-1 flex items-start justify-center bg-background p-8 pt-50">
      <div className="w-full max-w-4xl space-y-8">
        {/* Hero Section */}
        <div className="text-center">
          <h1 className="text-4xl font-normal text-foreground">Learn with Mimir</h1>
        </div>

        {/* Instance Creation Form */}
        <InstanceCreationForm onCreateInstance={onCreateInstance} />
      </div>
    </div>
  );
};
