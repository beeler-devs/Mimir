'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { LectureInstance, LectureSourceType } from '@/lib/types';
import type { LectureMetadata } from '@/components/tabs/LectureViewer';

// Dynamically import LectureViewer with SSR disabled
const LectureViewer = dynamic(
  () => import('@/components/tabs/LectureViewer').then((mod) => ({ default: mod.LectureViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
);

interface LectureUploadData {
  sourceType?: LectureSourceType;
  videoUrl?: string;
  youtubeId?: string;
  transcript?: string;
  transcriptSegments?: Array<{
    text: string;
    timestamp: number;
    duration?: number;
  }>;
  slidesUrl?: string;
  slidesFileName?: string;
  slidesPageCount?: number;
  slidesFullText?: string;
  audioUrl?: string;
  duration?: number;
  metadata?: LectureMetadata;
}

interface LectureInstanceRendererProps {
  instance: LectureInstance;
  onUpload: (data: LectureUploadData) => void;
  onAddToChat: (text: string) => void;
}

export const LectureInstanceRenderer: React.FC<LectureInstanceRendererProps> = ({
  instance,
  onUpload,
  onAddToChat,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-border px-4 py-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{instance.title}</h2>
      </div>
      <div className="flex-1 overflow-hidden">
        <LectureViewer
          sourceType={instance.data.sourceType}
          videoUrl={instance.data.videoUrl}
          youtubeId={instance.data.youtubeId}
          transcript={instance.data.transcript}
          transcriptSegments={instance.data.transcriptSegments}
          slidesUrl={instance.data.slidesUrl}
          slidesFileName={instance.data.slidesFileName}
          slidesPageCount={instance.data.slidesPageCount}
          slidesFullText={instance.data.slidesFullText}
          audioUrl={instance.data.audioUrl}
          metadata={instance.data.metadata}
          onUpload={onUpload}
          onAddToChat={onAddToChat}
        />
      </div>
    </div>
  );
};
