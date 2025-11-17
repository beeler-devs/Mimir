'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/common';
import { supabase } from '@/lib/supabaseClient';
import {
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquarePlus,
  Youtube,
  Mic,
  Video,
  Loader2,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  StopCircle,
} from 'lucide-react';
import { LectureSourceType } from '@/lib/types';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface LectureMetadata {
  title?: string;
  speaker?: string;
  date?: string;
  subject?: string;
  keywords?: string;
}

interface TranscriptSegment {
  text: string;
  timestamp: number;
  duration?: number;
  title?: string;
}

interface LectureViewerProps {
  sourceType?: LectureSourceType;
  videoUrl?: string;
  youtubeId?: string;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  slidesUrl?: string;
  slidesFileName?: string;
  slidesPageCount?: number;
  audioUrl?: string;
  metadata?: LectureMetadata;
  onUpload: (data: {
    sourceType: LectureSourceType;
    videoUrl?: string;
    youtubeId?: string;
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    slidesUrl?: string;
    slidesFileName?: string;
    slidesPageCount?: number;
    slidesFullText?: string;
    audioUrl?: string;
    duration?: number;
    metadata?: LectureMetadata;
  }) => void;
  onAddToChat?: (text: string) => void;
}

export interface LectureViewerRef {
  getCurrentSlideImage?: () => Promise<string | null>;
  getCurrentVideoFrame?: () => Promise<string | null>;
}

/**
 * Lecture Viewer Component
 * Supports 4 input methods:
 * 1. YouTube video link (with transcript retrieval)
 * 2. Audio recording (with live transcription)
 * 3. PDF slides + optional audio recording
 * 4. Video file upload (.mov, .mp4) with transcript extraction
 */
export const LectureViewer = React.forwardRef<LectureViewerRef, LectureViewerProps>(({
  sourceType,
  videoUrl,
  youtubeId,
  transcript,
  transcriptSegments,
  slidesUrl,
  slidesFileName,
  slidesPageCount,
  audioUrl,
  metadata,
  onUpload,
  onAddToChat,
}, ref) => {
  // State for input method selection
  const [selectedMethod, setSelectedMethod] = useState<LectureSourceType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Streaming transcription state
  const [streamingTranscript, setStreamingTranscript] = useState<TranscriptSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // YouTube state
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Video player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // PDF slides state
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Text selection state
  const [selectedText, setSelectedText] = useState<string>('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Set method based on existing data
  useEffect(() => {
    if (sourceType) {
      setSelectedMethod(sourceType);
    }
  }, [sourceType]);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Format time helper
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format timestamp for chapters (MM:SS format)
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // YouTube upload handler
  const handleYoutubeUpload = async () => {
    if (!youtubeUrl.trim()) return;

    setProcessing(true);
    try {
      // Extract YouTube ID from URL
      const videoId = extractYoutubeId(youtubeUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // Call API to fetch transcript
      const response = await fetch('/api/lecture/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeId: videoId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch YouTube transcript');
      }

      const data = await response.json();

      onUpload({
        sourceType: 'youtube',
        youtubeId: videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        transcript: data.transcript,
        transcriptSegments: data.segments,
        duration: data.duration,
        metadata: {
          title: data.title,
          date: data.publishedAt,
        },
      });

      setSelectedMethod('youtube');
    } catch (error) {
      console.error('Error uploading YouTube video:', error);
      alert(error instanceof Error ? error.message : 'Failed to process YouTube video');
    } finally {
      setProcessing(false);
    }
  };

  // Extract YouTube video ID from URL
  const extractYoutubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
      /youtube\.com\/embed\/([^&\s]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  // Start audio recording
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await processAudioRecording(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      setIsRecording(true);
      setStreamingTranscript([]); // Clear previous transcripts
      
      // If we're in slides mode, update to slides-recording
      if (selectedMethod === 'slides' || sourceType === 'slides') {
        setSelectedMethod('slides-recording');
      }
      
      // Show immediate feedback that transcription is ready
      console.log('Recording started - transcription will appear after you stop recording');
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please allow microphone access.');
    }
  };

  // Stop audio recording
  const handleStopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  // Process recorded audio with real-time transcription
  const processAudioRecording = async (audioBlob: Blob) => {
    setProcessing(true);
    setIsTranscribing(true);
    setStreamingTranscript([]); // Clear any previous transcript
    
    try {
      // Upload audio to Supabase and transcribe
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // First, upload to Supabase storage
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('userId', user.id);

      // Start streaming transcription
      const streamResponse = await fetch('/api/lecture/transcribe-audio-stream', {
        method: 'POST',
        body: formData,
      });

      if (!streamResponse.ok) {
        throw new Error('Failed to start transcription');
      }

      const reader = streamResponse.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let buffer = '';
      let allSegments: TranscriptSegment[] = [];
      let finalTranscript = '';
      let finalDuration = 0;
      let audioUrl = '';

      // Read the SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'segment') {
                // Add segment to streaming display
                allSegments.push(data.segment);
                setStreamingTranscript([...allSegments]);
              } else if (data.type === 'done') {
                finalTranscript = data.transcript;
                allSegments = data.segments;
                finalDuration = data.duration;
                setStreamingTranscript(allSegments);
              } else if (data.type === 'error') {
                throw new Error(data.content);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      // Now upload audio file to get the storage URL
      const uploadFormData = new FormData();
      uploadFormData.append('audio', audioBlob);
      uploadFormData.append('userId', user.id);

      // Upload to Supabase for storage
      const uploadResponse = await fetch('/api/lecture/transcribe-audio', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload audio');
      }

      const uploadResult = await uploadResponse.json();
      audioUrl = uploadResult.audioUrl;

      // Use the streamed transcription data
      // Keep the source type as slides-recording if we're in that mode
      const finalSourceType = selectedMethod === 'slides-recording' || sourceType === 'slides-recording' 
        ? 'slides-recording' 
        : 'recording';
      
      // Preserve slides data if we're in slides-recording mode
      const uploadData: any = {
        sourceType: finalSourceType,
        audioUrl: audioUrl,
        transcript: finalTranscript,
        transcriptSegments: allSegments,
        duration: finalDuration,
        metadata: {
          date: new Date().toISOString(),
        },
      };

      // If we're in slides mode, preserve the slides data
      if (finalSourceType === 'slides-recording' && slidesUrl) {
        uploadData.slidesUrl = slidesUrl;
        uploadData.slidesFileName = slidesFileName;
        uploadData.slidesPageCount = slidesPageCount;
        uploadData.slidesFullText = slidesFullText;
        if (metadata) {
          uploadData.metadata = { ...uploadData.metadata, ...metadata };
        }
      }
      
      onUpload(uploadData);

      // Don't change the selected method if we're already in slides mode
      if (selectedMethod !== 'slides-recording' && sourceType !== 'slides-recording') {
        setSelectedMethod('recording');
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      alert(error instanceof Error ? error.message : 'Failed to process audio recording');
    } finally {
      setProcessing(false);
      setIsTranscribing(false);
    }
  };

  // Handle PDF slides upload
  const handleSlidesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload PDF to Supabase Storage
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('userId', user.id);

      const uploadResponse = await fetch('/api/pdf/upload', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload slides');
      }

      const uploadData = await uploadResponse.json();

      // Analyze PDF
      const analyzeFormData = new FormData();
      analyzeFormData.append('file', file);

      const analyzeResponse = await fetch('/api/pdf/analyze', {
        method: 'POST',
        body: analyzeFormData,
      });

      if (!analyzeResponse.ok) {
        throw new Error('Failed to analyze slides');
      }

      const analyzeData = await analyzeResponse.json();

      onUpload({
        sourceType: selectedMethod === 'slides-recording' ? 'slides-recording' : 'slides',
        slidesUrl: uploadData.url,
        slidesFileName: file.name,
        slidesPageCount: analyzeData.metadata.pages,
        slidesFullText: analyzeData.fullText,
        metadata: {
          title: analyzeData.metadata.title,
          subject: analyzeData.metadata.subject,
        },
      });

      setSelectedMethod(selectedMethod === 'slides-recording' ? 'slides-recording' : 'slides');
    } catch (error) {
      console.error('Error uploading slides:', error);
      alert(error instanceof Error ? error.message : 'Failed to process slides');
    } finally {
      setUploading(false);
    }
  };

  // Handle video file upload with real-time transcription
  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || (!file.type.includes('video'))) return;

    setUploading(true);
    setProcessing(true);
    setIsTranscribing(true);
    setStreamingTranscript([]);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload video and extract transcript
      const formData = new FormData();
      formData.append('video', file);
      formData.append('userId', user.id);

      const response = await fetch('/api/lecture/upload-video', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process video');
      }

      const data = await response.json();

      // Display segments as they come in (simulated for now since upload-video is not streaming)
      // In a real implementation, you'd stream the transcription as it's being processed
      if (data.segments) {
        setStreamingTranscript(data.segments);
      }

      onUpload({
        sourceType: 'upload',
        videoUrl: data.videoUrl,
        transcript: data.transcript,
        transcriptSegments: data.segments,
        duration: data.duration,
        metadata: {
          title: file.name,
          date: new Date().toISOString(),
        },
      });

      setSelectedMethod('upload');
    } catch (error) {
      console.error('Error uploading video:', error);
      alert(error instanceof Error ? error.message : 'Failed to process video file');
    } finally {
      setUploading(false);
      setProcessing(false);
      setIsTranscribing(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(file => file.type.includes('video'));
    const pdfFile = files.find(file => file.type === 'application/pdf');

    if (videoFile) {
      const mockEvent = {
        target: { files: [videoFile] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await handleVideoUpload(mockEvent);
    } else if (pdfFile) {
      const mockEvent = {
        target: { files: [pdfFile] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await handleSlidesUpload(mockEvent);
    }
  };

  // Text selection for chat
  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      setSelectedText(text);
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();

      if (rect) {
        setPopupPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
        setShowPopup(true);
      }
    } else {
      setShowPopup(false);
    }
  };

  const handleAddToChat = () => {
    if (selectedText && onAddToChat) {
      onAddToChat(selectedText);
      setShowPopup(false);
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    }
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);

  // PDF handlers
  const onDocumentLoadSuccess = useCallback(({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);
    setCurrentPage(1);
    pageRefs.current = new Array(pages).fill(null);
  }, []);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  // Video player controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Empty state - method selection
  if (!sourceType && !selectedMethod) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full gap-6 p-8 bg-background transition-colors ${
          isDragging ? 'bg-muted/50 border-2 border-dashed border-primary' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Video className="w-16 h-16 text-muted-foreground" />
          <h3 className="text-lg font-medium">Create a Lecture Instance</h3>
          {isDragging && (
            <p className="text-sm text-muted-foreground max-w-md">
              Drop your video or PDF slides here
            </p>
          )}
        </div>

        {!isDragging && (
          <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
            {/* Upload Slides */}
            <button
              onClick={() => setSelectedMethod('slides')}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-medium transition-all hover:border-primary/50 hover:bg-muted/50"
            >
              <FileText className="w-5 h-5 text-green-500" />
              <h4 className="text-foreground">Upload Slides</h4>
            </button>

            {/* YouTube Video */}
            <button
              onClick={() => setSelectedMethod('youtube')}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-medium transition-all hover:border-primary/50 hover:bg-muted/50"
            >
              <Youtube className="w-5 h-5 text-red-500" />
              <h4 className="text-foreground">YouTube Video</h4>
            </button>

            {/* Record Audio */}
            <button
              onClick={() => setSelectedMethod('recording')}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-medium transition-all hover:border-primary/50 hover:bg-muted/50"
            >
              <Mic className="w-5 h-5 text-blue-500" />
              <h4 className="text-foreground">Record Audio</h4>
            </button>

            {/* Upload Video */}
            <button
              onClick={() => setSelectedMethod('upload')}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-medium transition-all hover:border-primary/50 hover:bg-muted/50"
            >
              <Video className="w-5 h-5 text-purple-500" />
              <h4 className="text-foreground">Upload Video</h4>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Conditional input areas after method selection (but before content is uploaded)
  // YouTube input
  if (selectedMethod === 'youtube' && !youtubeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 bg-background">
        <div className="flex flex-col items-center gap-4 w-full max-w-xl">
          <Youtube className="w-16 h-16 text-red-500" />
          <h3 className="text-lg font-medium">YouTube Video</h3>
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleYoutubeUpload}
            disabled={!youtubeUrl.trim() || processing}
            className="w-full px-4 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#F5F5F5', color: 'var(--foreground)' }}
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Fetch Transcript'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Upload Slides input
  if (selectedMethod === 'slides' && !slidesUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 bg-background">
        <div className="flex flex-col items-center gap-4 w-full max-w-xl">
          <FileText className="w-16 h-16 text-green-500" />
          <h3 className="text-lg font-medium">Upload Slides</h3>
          <label htmlFor="slides-upload-input" className="w-full">
            <div
              className="w-full px-4 py-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:opacity-80 transition-colors flex flex-col items-center gap-2"
              style={{ backgroundColor: '#F5F5F5' }}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                  <span className="text-sm font-medium text-foreground">Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Click to upload PDF</span>
                  <span className="text-xs text-muted-foreground">or drag and drop</span>
                </>
              )}
            </div>
            <input
              id="slides-upload-input"
              type="file"
              accept="application/pdf"
              onChange={handleSlidesUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </div>
    );
  }

  // Recording input (show immediately)
  if (selectedMethod === 'recording' && !audioUrl) {
    return (
      <div className="flex flex-col h-full">
        {!isRecording && !isTranscribing && (
          <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8 bg-background">
            <div className="flex flex-col items-center gap-4 w-full max-w-xl">
              <Mic className="w-16 h-16 text-blue-500" />
              <h3 className="text-lg font-medium">Record Audio</h3>
              <button
                onClick={handleStartRecording}
                disabled={processing}
                className="w-full px-4 py-3 font-medium rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#F5F5F5', color: 'var(--foreground)' }}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 inline mr-2" />
                    Start Recording
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        
        {/* Streaming transcription area */}
        {(isRecording || isTranscribing) && (
          <div className="flex-1 overflow-y-auto bg-background p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Transcription</h3>
              {isRecording && (
                <button
                  onClick={handleStopRecording}
                  className="px-4 py-2 font-medium rounded-lg transition-colors flex items-center gap-2"
                  style={{ backgroundColor: '#F5F5F5', color: 'var(--foreground)' }}
                >
                  <StopCircle className="w-4 h-4" />
                  Stop Recording
                </button>
              )}
            </div>
            {isRecording && !isTranscribing && streamingTranscript.length === 0 && (
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm">Recording in progress... Transcription will appear when you stop.</span>
              </div>
            )}
            {isTranscribing && (
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Transcribing...</span>
              </div>
            )}
            {streamingTranscript.map((segment, idx) => (
              <div key={idx} className="mb-6">
                <div className="text-sm font-mono text-muted-foreground mb-1">
                  {formatTimestamp(segment.timestamp)}
                </div>
                {segment.title && (
                  <h4 className="text-lg font-semibold mb-2">{segment.title}</h4>
                )}
                <p className="text-sm text-muted-foreground">{segment.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Upload Video input
  if (selectedMethod === 'upload' && !videoUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 bg-background">
        <div className="flex flex-col items-center gap-4 w-full max-w-xl">
          <Video className="w-16 h-16 text-purple-500" />
          <h3 className="text-lg font-medium">Upload Video</h3>
          <label htmlFor="video-upload-input" className="w-full">
            <div
              className="w-full px-4 py-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:opacity-80 transition-colors flex flex-col items-center gap-2"
              style={{ backgroundColor: '#F5F5F5' }}
            >
              {uploading || processing ? (
                <>
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                  <span className="text-sm font-medium text-foreground">
                    {processing ? 'Processing...' : 'Uploading...'}
                  </span>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Click to upload video</span>
                  <span className="text-xs text-muted-foreground">.mov or .mp4 files</span>
                </>
              )}
            </div>
            <input
              id="video-upload-input"
              type="file"
              accept="video/mp4,video/quicktime,.mov,.mp4"
              onChange={handleVideoUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </div>
    );
  }

  // Render YouTube player
  if ((sourceType === 'youtube' || selectedMethod === 'youtube') && youtubeId) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Video Player */}
        <div className="w-full bg-black" style={{ height: '40vh', minHeight: '300px' }}>
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {/* Transcript Chapters */}
        <div className="flex-1 overflow-y-auto bg-background p-6">
          <h3 className="text-xl font-semibold mb-4">Chapters</h3>
          {transcriptSegments && transcriptSegments.length > 0 ? (
            transcriptSegments.map((segment, idx) => (
              <div key={idx} className="mb-6">
                <div className="text-sm font-mono text-muted-foreground mb-1">
                  {formatTimestamp(segment.timestamp)}
                </div>
                {segment.title && (
                  <h4 className="text-lg font-semibold mb-2">{segment.title}</h4>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{segment.text}</p>
              </div>
            ))
          ) : transcript ? (
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {transcript}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No transcript available</p>
          )}
        </div>

        {/* Text Selection Popup */}
        {showPopup && (
          <div
            className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg animate-in fade-in zoom-in-95"
            style={{
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              transform: 'translate(-50%, -100%)',
              backgroundColor: '#F5F5F5',
              borderRadius: '0.85rem',
              borderColor: 'var(--border)',
            }}
          >
            <button
              onClick={handleAddToChat}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Ask Mimir
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render uploaded video player
  if ((sourceType === 'upload' || selectedMethod === 'upload') && videoUrl) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Video Player */}
        <div className="w-full bg-black" style={{ height: '40vh', minHeight: '300px' }}>
          <video
            ref={videoRef}
            className="w-full h-full"
            src={videoUrl}
            controls
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
        </div>

        {/* Transcript Chapters */}
        <div className="flex-1 overflow-y-auto bg-background p-6">
          <h3 className="text-xl font-semibold mb-4">Chapters</h3>
          {isTranscribing && (
            <div className="flex items-center gap-2 mb-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Transcribing video...</span>
            </div>
          )}
          {streamingTranscript && streamingTranscript.length > 0 ? (
            streamingTranscript.map((segment, idx) => (
              <div key={idx} className="mb-6">
                <div className="text-sm font-mono text-muted-foreground mb-1">
                  {formatTimestamp(segment.timestamp)}
                </div>
                {segment.title && (
                  <h4 className="text-lg font-semibold mb-2">{segment.title}</h4>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{segment.text}</p>
              </div>
            ))
          ) : transcriptSegments && transcriptSegments.length > 0 ? (
            transcriptSegments.map((segment, idx) => (
              <div key={idx} className="mb-6">
                <div className="text-sm font-mono text-muted-foreground mb-1">
                  {formatTimestamp(segment.timestamp)}
                </div>
                {segment.title && (
                  <h4 className="text-lg font-semibold mb-2">{segment.title}</h4>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{segment.text}</p>
              </div>
            ))
          ) : transcript ? (
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {transcript}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Transcription will appear here...</p>
          )}
        </div>

        {/* Text Selection Popup */}
        {showPopup && (
          <div
            className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg"
            style={{
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              transform: 'translate(-50%, -100%)',
              backgroundColor: '#F5F5F5',
              borderRadius: '0.85rem',
            }}
          >
            <button
              onClick={handleAddToChat}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Ask Mimir
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render PDF slides viewer
  if ((sourceType === 'slides' || sourceType === 'slides-recording' || selectedMethod === 'slides') && slidesUrl) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium truncate max-w-[200px]">
              {metadata?.title || slidesFileName || 'lecture-slides.pdf'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-sm px-2 font-medium">
              Page {currentPage} of {numPages}
            </span>

            <div className="w-px h-6 bg-border mx-1" />

            <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={scale <= 0.5}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm px-2 min-w-[4rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={scale >= 3.0}>
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* PDF Display */}
        <div
          ref={containerRef}
          className="overflow-auto bg-muted/30 flex items-start justify-center p-8"
          style={{ height: '50vh', minHeight: '400px' }}
        >
          <div className="flex flex-col gap-4">
            <Document
              file={slidesUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              className="pdf-document"
            >
              {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNumber) => (
                <div
                  key={`page-${pageNumber}`}
                  ref={(el) => {
                    pageRefs.current[pageNumber - 1] = el;
                  }}
                  className="relative shadow-2xl mb-4 bg-white"
                  data-page-number={pageNumber}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                  />
                  <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                    {pageNumber}
                  </div>
                </div>
              ))}
            </Document>
          </div>
        </div>

        {/* Recording Controls / Audio Player and Transcription */}
        <div className="flex-1 flex flex-col border-t bg-background overflow-hidden">
          {/* Show start recording button only if no audio and not recording */}
          {!audioUrl && !isRecording && !transcript && !streamingTranscript.length && (
            <div className="flex items-center justify-center p-6 border-b">
              <button
                onClick={handleStartRecording}
                disabled={processing}
                className="px-6 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: '#F5F5F5', color: 'var(--foreground)' }}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    Record Audio
                  </>
                )}
              </button>
            </div>
          )}

          {/* Audio Player (after recording is complete) */}
          {audioUrl && !isRecording && (
            <div className="flex items-center gap-4 p-4 border-b bg-muted/20">
              <Mic className="w-8 h-8 text-blue-500 flex-shrink-0" />
              <audio controls className="flex-1" src={audioUrl}>
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {/* Streaming Transcription */}
          {(isRecording || isTranscribing || transcript || streamingTranscript.length > 0 || audioUrl) && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">Transcription</h3>
                {isRecording && (
                  <button
                    onClick={handleStopRecording}
                    className="px-4 py-2 font-medium rounded-lg transition-colors flex items-center gap-2"
                    style={{ backgroundColor: '#F5F5F5', color: 'var(--foreground)' }}
                  >
                    <StopCircle className="w-4 h-4" />
                    Stop Recording
                  </button>
                )}
              </div>
              {isRecording && !isTranscribing && streamingTranscript.length === 0 && (
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm">Recording in progress... Transcription will appear when you stop.</span>
                </div>
              )}
              {isTranscribing && (
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Transcribing...</span>
                </div>
              )}
              {streamingTranscript.length > 0 ? (
                streamingTranscript.map((segment, idx) => (
                  <div key={idx} className="mb-6">
                    <div className="text-sm font-mono text-muted-foreground mb-1">
                      {formatTimestamp(segment.timestamp)}
                    </div>
                    {segment.title && (
                      <h4 className="text-lg font-semibold mb-2">{segment.title}</h4>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed">{segment.text}</p>
                  </div>
                ))
              ) : transcriptSegments && transcriptSegments.length > 0 ? (
                transcriptSegments.map((segment, idx) => (
                  <div key={idx} className="mb-6">
                    <div className="text-sm font-mono text-muted-foreground mb-1">
                      {formatTimestamp(segment.timestamp)}
                    </div>
                    {segment.title && (
                      <h4 className="text-lg font-semibold mb-2">{segment.title}</h4>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed">{segment.text}</p>
                  </div>
                ))
              ) : transcript ? (
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {transcript}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Text Selection Popup */}
        {showPopup && (
          <div
            className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg"
            style={{
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              transform: 'translate(-50%, -100%)',
              backgroundColor: '#F5F5F5',
              borderRadius: '0.85rem',
            }}
          >
            <button
              onClick={handleAddToChat}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Ask Mimir
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render audio recording playback
  if ((sourceType === 'recording' || selectedMethod === 'recording') && audioUrl) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Audio Player */}
        <div className="flex flex-col items-center gap-4 p-8 border-b bg-muted/20">
          <Mic className="w-12 h-12 text-blue-500" />
          <h3 className="text-lg font-medium">Audio Lecture</h3>
          <audio controls className="w-full max-w-md" src={audioUrl}>
            Your browser does not support the audio element.
          </audio>
        </div>

        {/* Transcript Chapters */}
        <div className="flex-1 overflow-y-auto bg-background p-6">
          <h3 className="text-xl font-semibold mb-4">Transcript</h3>
          {transcriptSegments && transcriptSegments.length > 0 ? (
            transcriptSegments.map((segment, idx) => (
              <div key={idx} className="mb-6">
                <div className="text-sm font-mono text-muted-foreground mb-1">
                  {formatTimestamp(segment.timestamp)}
                </div>
                {segment.title && (
                  <h4 className="text-lg font-semibold mb-2">{segment.title}</h4>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{segment.text}</p>
              </div>
            ))
          ) : transcript ? (
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {transcript}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No transcript available</p>
          )}
        </div>

        {/* Text Selection Popup */}
        {showPopup && (
          <div
            className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg"
            style={{
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              transform: 'translate(-50%, -100%)',
              backgroundColor: '#F5F5F5',
              borderRadius: '0.85rem',
            }}
          >
            <button
              onClick={handleAddToChat}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Ask Mimir
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
});

LectureViewer.displayName = 'LectureViewer';
