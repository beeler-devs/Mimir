'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Loader2, CheckCircle, XCircle, Film } from 'lucide-react';
import { WorkspaceContext } from '@/lib/types';

interface AnimationSuggestion {
  description: string;
  topic: string;
}

interface AnimationPanelProps {
  suggestion: AnimationSuggestion;
  workspaceContext?: WorkspaceContext;
  onClose?: () => void;
}

type JobStatus = 'idle' | 'pending' | 'running' | 'done' | 'error';

interface JobResponse {
  job_id: string;
  status: JobStatus;
  video_url?: string;
  error?: string;
}

/**
 * AnimationPanel component
 * Handles animation job creation, polling, and video display
 */
export const AnimationPanel: React.FC<AnimationPanelProps> = ({ suggestion, workspaceContext, onClose }) => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);

  // Start polling when job is created
  useEffect(() => {
    if (jobId && (status === 'pending' || status === 'running')) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [jobId, status]);

  const startPolling = () => {
    if (pollingInterval.current) return;

    pollingInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/manim/jobs/${jobId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const data: JobResponse = await response.json();
        setStatus(data.status);

        if (data.status === 'done' && data.video_url) {
          setVideoUrl(data.video_url);
          stopPolling();
        } else if (data.status === 'error') {
          setError(data.error || 'Unknown error occurred');
          stopPolling();
        }
      } catch (err) {
        console.error('Error polling job status:', err);
        setError('Failed to check job status');
        stopPolling();
      }
    }, 2000); // Poll every 2 seconds
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  const handleGenerateAnimation = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setStatus('pending');

      const response = await fetch('/api/manim/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: suggestion.description,
          topic: suggestion.topic,
          workspace_context: workspaceContext || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create animation job');
      }

      const data: JobResponse = await response.json();
      console.log('Job creation response:', data);
      console.log('Job ID:', data.job_id);
      setJobId(data.job_id);
      setStatus(data.status);
      
    } catch (err) {
      console.error('Error creating animation:', err);
      setError(err instanceof Error ? err.message : 'Failed to create animation');
      setStatus('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'idle':
        return <Film className="h-5 w-5 text-muted-foreground" />;
      case 'pending':
      case 'running':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'done':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'Ready to generate';
      case 'pending':
        return 'Queued...';
      case 'running':
        return 'Rendering animation...';
      case 'done':
        return 'Animation ready!';
      case 'error':
        return 'Generation failed';
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-card my-2">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <div>
            <h4 className="font-medium text-sm">Animation Suggestion</h4>
            <p className="text-xs text-muted-foreground">{getStatusText()}</p>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="mb-3">
        <p className="text-sm text-foreground bg-muted p-3 rounded">
          {suggestion.description}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Topic: <span className="font-medium">{suggestion.topic}</span>
        </p>
      </div>

      {/* Generate Button */}
      {status === 'idle' && (
        <button
          onClick={handleGenerateAnimation}
          disabled={isGenerating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating Job...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Generate Animation
            </>
          )}
        </button>
      )}

      {/* Video Player */}
      {status === 'done' && videoUrl && (
        <div className="mt-3">
          <video
            controls
            className="w-full rounded-lg bg-black"
            src={videoUrl}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && error && (
        <div className="mt-3 p-3 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
          <p className="font-medium">Error:</p>
          <p>{error}</p>
          <button
            onClick={() => {
              setStatus('idle');
              setError(null);
              setJobId(null);
            }}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Progress Info */}
      {(status === 'pending' || status === 'running') && jobId && (
        <div className="mt-3 text-xs text-muted-foreground">
          <p>Job ID: {jobId.substring(0, 8)}...</p>
          <p className="mt-1">
            This may take 30-60 seconds. The video will appear automatically when ready.
          </p>
        </div>
      )}
    </div>
  );
};


