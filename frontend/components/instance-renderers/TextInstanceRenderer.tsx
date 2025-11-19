'use client';

import React from 'react';
import { TextEditor } from '@/components/tabs';
import type { TextInstance } from '@/lib/types';

interface TextInstanceRendererProps {
  instance: TextInstance;
  onContentChange: (value: string) => void;
}

export const TextInstanceRenderer: React.FC<TextInstanceRendererProps> = ({
  instance,
  onContentChange,
}) => {
  return (
    <TextEditor
      content={instance.data.content}
      onChange={onContentChange}
    />
  );
};
