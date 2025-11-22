'use client';

import React from 'react';
import { CentralDashboard } from '@/components/dashboard/CentralDashboard';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import type { InstanceType } from '@/lib/types';
import { useWorkspace } from './WorkspaceProvider';

function WorkspaceDashboardContent() {
  const { createInstance } = useWorkspace();

  const handleCreateInstance = async (title: string, type: InstanceType, additionalData?: any) => {
    const trimmed = title.trim();
    if (!trimmed) {
      console.warn('[handleCreateInstance] Empty title provided, aborting');
      return;
    }

    console.log('[handleCreateInstance] ========================================');
    console.log('[handleCreateInstance] Creating new instance...');
    console.log('[handleCreateInstance] Title:', trimmed);
    console.log('[handleCreateInstance] Type:', type);
    console.log('[handleCreateInstance] Additional data:', additionalData);

    const instancePayload = {
      title: trimmed,
      type,
      folderId: null,
      data: additionalData,
    };

    console.log('[handleCreateInstance] Full payload:', JSON.stringify(instancePayload, null, 2));

    try {
      console.log('[handleCreateInstance] Calling createInstance...');
      await createInstance(trimmed, type, additionalData);
      console.log('[handleCreateInstance] ✅ Instance created successfully!');
      console.log('[handleCreateInstance] ========================================');
    } catch (error) {
      console.error('[handleCreateInstance] ========================================');
      console.error('[handleCreateInstance] ❌ FAILED to create instance');
      console.error('[handleCreateInstance] Error type:', typeof error);
      console.error('[handleCreateInstance] Error:', error);

      if (error instanceof Error) {
        console.error('[handleCreateInstance] Error name:', error.name);
        console.error('[handleCreateInstance] Error message:', error.message);
        console.error('[handleCreateInstance] Error stack:', error.stack);
      }

      // Try to extract Supabase-specific error details
      if (error && typeof error === 'object') {
        console.error('[handleCreateInstance] Error keys:', Object.keys(error));
        console.error('[handleCreateInstance] Error code:', (error as any).code);
        console.error('[handleCreateInstance] Error message:', (error as any).message);
        console.error('[handleCreateInstance] Error details:', (error as any).details);
        console.error('[handleCreateInstance] Error hint:', (error as any).hint);
      }

      console.error('[handleCreateInstance] Full error JSON:', JSON.stringify(error, null, 2));
      console.error('[handleCreateInstance] ========================================');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <CentralDashboard onCreateInstance={handleCreateInstance} />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <WorkspaceDashboardContent />
    </ProtectedRoute>
  );
}
