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
  ChevronUp,
  ChevronDown,
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

const LIVE_TRANSCRIPT_CHUNK_SECONDS = 3;
const TRANSCRIPT_CHUNK_SECONDS = 30;

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
  slidesFullText?: string; // Added this prop
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
  slidesFullText,
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
  const [deepgramSocket, setDeepgramSocket] = useState<WebSocket | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const streamingTranscriptRef = useRef<TranscriptSegment[]>([]);
  const latestSelectedMethodRef = useRef<LectureSourceType | null>(null);
  const transcriptClockRef = useRef<number>(0);

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
  const lectureContainerRef = useRef<HTMLDivElement>(null);
  const transcriptionScrollRef = useRef<HTMLDivElement>(null);

  // Text selection state
  const [selectedText, setSelectedText] = useState<string>('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Lecture split resize state (slides vs transcription)
  const [slidesHeightPercent, setSlidesHeightPercent] = useState<number>(50); // Default 50/50 split
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const splitResizeStartRef = useRef<{ y: number; slidesHeightPercent: number } | null>(null);
  
  // Expand/collapse state for slides and transcription
  const [slidesExpanded, setSlidesExpanded] = useState(true);
  const [transcriptionExpanded, setTranscriptionExpanded] = useState(true);
  
  // Minimum heights for slides and transcription (in pixels)
  const MIN_SLIDES_HEIGHT = 300;
  const MIN_TRANSCRIPTION_HEIGHT = 200;
  const COLLAPSED_BAR_HEIGHT = 48; // Height of collapsed bar

  // Set method based on existing data
  useEffect(() => {
    if (sourceType) {
      setSelectedMethod(sourceType);
    }
  }, [sourceType]);

  // Load saved split ratio from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mimir.lectureSplitRatio');
    if (saved) {
      try {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          setSlidesHeightPercent(parsed);
        }
      } catch (error) {
        console.error('Failed to parse saved split ratio:', error);
      }
    }
  }, []);

  // Save split ratio to localStorage
  useEffect(() => {
    localStorage.setItem('mimir.lectureSplitRatio', slidesHeightPercent.toString());
  }, [slidesHeightPercent]);

  // Handle split resize
  const handleSplitResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingSplit(true);
    splitResizeStartRef.current = {
      y: e.clientY,
      slidesHeightPercent,
    };
  }, [slidesHeightPercent]);

  const handleSplitResizeMove = useCallback((e: PointerEvent) => {
    if (!isResizingSplit || !splitResizeStartRef.current || !lectureContainerRef.current) return;

    const container = lectureContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerHeight = containerRect.height;
    
    // Find toolbar height by looking for the toolbar element
    const toolbar = container.querySelector('[class*="border-b"]');
    const toolbarHeight = toolbar ? toolbar.getBoundingClientRect().height : 48;
    
    // Calculate available height (container minus toolbar)
    const availableHeight = containerHeight - toolbarHeight;
    if (availableHeight <= 0) return;

    // Calculate delta in pixels
    const deltaY = e.clientY - splitResizeStartRef.current.y;
    
    // Convert delta to percentage change
    const deltaPercent = (deltaY / availableHeight) * 100;
    
    // Calculate new slides height percentage
    let newSlidesPercent = splitResizeStartRef.current.slidesHeightPercent + deltaPercent;
    
    // Calculate actual heights in pixels
    const newSlidesHeight = (newSlidesPercent / 100) * availableHeight;
    const newTranscriptionHeight = availableHeight - newSlidesHeight;
    
    // Apply minimum constraints
    if (newSlidesHeight < MIN_SLIDES_HEIGHT) {
      newSlidesPercent = (MIN_SLIDES_HEIGHT / availableHeight) * 100;
    } else if (newTranscriptionHeight < MIN_TRANSCRIPTION_HEIGHT) {
      newSlidesPercent = ((availableHeight - MIN_TRANSCRIPTION_HEIGHT) / availableHeight) * 100;
    }
    
    // Clamp to valid range
    newSlidesPercent = Math.max(0, Math.min(100, newSlidesPercent));
    
    setSlidesHeightPercent(newSlidesPercent);
  }, [isResizingSplit]);

  const handleSplitResizeEnd = useCallback(() => {
    setIsResizingSplit(false);
    splitResizeStartRef.current = null;
  }, []);

  // Global mouse move/up handlers for split resize
  useEffect(() => {
    if (isResizingSplit) {
      document.addEventListener('pointermove', handleSplitResizeMove);
      document.addEventListener('pointerup', handleSplitResizeEnd);
      return () => {
        document.removeEventListener('pointermove', handleSplitResizeMove);
        document.removeEventListener('pointerup', handleSplitResizeEnd);
      };
    }
  }, [isResizingSplit, handleSplitResizeMove, handleSplitResizeEnd]);

  // Show scrollbar when scrolling transcription
  useEffect(() => {
    const transcriptionElement = transcriptionScrollRef.current;
    if (!transcriptionElement) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      transcriptionElement.classList.add('scrolling');
      
      // Clear existing timeout
      clearTimeout(scrollTimeout);
      
      // Remove scrolling class after scrolling stops
      scrollTimeout = setTimeout(() => {
        transcriptionElement.classList.remove('scrolling');
      }, 500);
    };

    transcriptionElement.addEventListener('scroll', handleScroll);
    
    return () => {
      transcriptionElement.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [isRecording, isTranscribing, transcript, streamingTranscript, audioUrl]);

  useEffect(() => {
    latestSelectedMethodRef.current = selectedMethod;
  }, [selectedMethod]);

  useEffect(() => {
    streamingTranscriptRef.current = streamingTranscript;
  }, [streamingTranscript]);

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

  // Start audio recording with live transcription
  const handleStartRecording = async () => {
    setStreamingTranscript([]);

    try {
      // Get Deepgram config
      const configResponse = await fetch('/api/lecture/transcribe-live');
      if (!configResponse.ok) {
        throw new Error('Failed to get transcription config');
      }
      const config = await configResponse.json();

      // Establish WebSocket connection to Deepgram
      const wsUrl = new URL(config.wsUrl);
      wsUrl.searchParams.append('model', config.options.model);
      wsUrl.searchParams.append('smart_format', config.options.smart_format);
      wsUrl.searchParams.append('punctuate', config.options.punctuate);
      wsUrl.searchParams.append('interim_results', config.options.interim_results);
      wsUrl.searchParams.append('language', config.options.language);

      const socket = new WebSocket(wsUrl.toString(), ['token', config.apiKey]);
      deepgramSocketRef.current = socket;
      setDeepgramSocket(socket);

      // Handle WebSocket events
      socket.onopen = () => {
        console.log('Deepgram WebSocket connected');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.channel?.alternatives?.[0]?.transcript) {
            const transcript = data.channel.alternatives[0].transcript;
            
            // Only process non-empty transcripts
            if (transcript.trim()) {
              const isFinal = data.is_final;
              
              if (isFinal) {
                const segmentTimestamp = transcriptClockRef.current;
                const bucketStart = Math.floor(segmentTimestamp / TRANSCRIPT_CHUNK_SECONDS) * TRANSCRIPT_CHUNK_SECONDS;
                const nextTimestamp = segmentTimestamp + LIVE_TRANSCRIPT_CHUNK_SECONDS;

                // Group final transcripts into minute buckets while preserving 3s cadence internally
                setStreamingTranscript((prev) => {
                  const updated = [...prev];
                  const lastSegment = updated[updated.length - 1];
                  const newDuration = Math.min(bucketStart + TRANSCRIPT_CHUNK_SECONDS, nextTimestamp) - bucketStart;

                  if (lastSegment && lastSegment.timestamp === bucketStart) {
                    updated[updated.length - 1] = {
                      ...lastSegment,
                      text: `${lastSegment.text} ${transcript}`.trim(),
                      duration: Math.max(lastSegment.duration ?? 0, newDuration),
                    };
                  } else {
                    updated.push({
                      text: transcript,
                      timestamp: bucketStart,
                      duration: newDuration,
                    });
                  }

                  return updated;
                });

                transcriptClockRef.current = nextTimestamp;
              } else {
                // Interim transcripts are ignored for now; we only store finalized minute buckets
              }
            }
          }
        } catch (error) {
          console.error('Error parsing Deepgram message:', error);
        }
      };

      socket.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
      };

      socket.onclose = () => {
        console.log('Deepgram WebSocket closed');
      };

      // Start audio recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          
          // Send audio chunk to Deepgram WebSocket
          if (socket.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then((buffer) => {
              socket.send(buffer);
            });
          }
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        transcriptClockRef.current = 0;
        
        // Close WebSocket
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'CloseStream' }));
          socket.close();
        }
        
        await processAudioRecording(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording with chunks every 250ms for real-time streaming
      recorder.start(250);
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      setIsRecording(true);
      setStreamingTranscript([]); // Clear previous transcripts
      transcriptClockRef.current = 0;

      // If we're in slides mode, update to slides-recording
      const isSlidesContext = selectedMethod === 'slides' || selectedMethod === 'slides-recording' || sourceType === 'slides' || sourceType === 'slides-recording' || Boolean(slidesUrl);
      const nextMethod: LectureSourceType = isSlidesContext ? 'slides-recording' : 'recording';
      setSelectedMethod(nextMethod);
      latestSelectedMethodRef.current = nextMethod;
      
      console.log('Recording started - live transcription active');
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

  // Process recorded audio - upload to storage (transcription already done via WebSocket)
  const processAudioRecording = async (audioBlob: Blob) => {
    setProcessing(true);
    
    try {
      // Upload audio to Supabase for storage and playback
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload audio file to get storage URL
      const uploadFormData = new FormData();
      uploadFormData.append('audio', audioBlob);
      uploadFormData.append('userId', user.id);

      const uploadResponse = await fetch('/api/lecture/transcribe-audio', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        // Read the error details from the API response
        const errorData = await uploadResponse.json();
        const errorMessage = errorData.details || errorData.error || 'Failed to upload audio';
        console.error('Audio upload error:', errorData);
        throw new Error(errorMessage);
      }

      const uploadResult = await uploadResponse.json();
      const audioUrl = uploadResult.audioUrl;

      // Use the live transcription data from WebSocket
      const allSegments = streamingTranscriptRef.current;
      const finalTranscript = allSegments.map(s => s.text).join(' ');
      const lastSegment = allSegments[allSegments.length - 1];
      const finalDuration = allSegments.length > 0 
        ? lastSegment.timestamp + (lastSegment.duration ?? TRANSCRIPT_CHUNK_SECONDS)
        : 0;

      // Keep the source type as slides-recording if we're in that mode
      const isSlidesContext = latestSelectedMethodRef.current === 'slides-recording' 
        || latestSelectedMethodRef.current === 'slides' 
        || sourceType === 'slides-recording' 
        || sourceType === 'slides' 
        || Boolean(slidesUrl);
      const finalSourceType: LectureSourceType = isSlidesContext ? 'slides-recording' : 'recording';
      
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

      // Keep the UI aligned with the data we save
      setSelectedMethod(finalSourceType);
    } catch (error) {
      console.error('Error processing audio:', error);
      alert(error instanceof Error ? error.message : 'Failed to process audio recording');
    } finally {
      setProcessing(false);
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
                className="w-full px-4 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#F5F5F5', color: 'var(--foreground)' }}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Start Recording</span>
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
            {isRecording && streamingTranscript.length === 0 && (
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm">Recording... Speak to see live transcription.</span>
              </div>
            )}
            {processing && !isRecording && (
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Uploading audio...</span>
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
  if ((sourceType === 'slides' || sourceType === 'slides-recording' || selectedMethod === 'slides' || selectedMethod === 'slides-recording') && slidesUrl) {
    return (
      <div ref={lectureContainerRef} className="flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 border-b bg-background/95 backdrop-blur flex-shrink-0">
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

            <div className="w-px h-6 bg-border mx-1" />

            <button
              onClick={() => {
                if (!transcriptionExpanded) {
                  // Don't allow collapsing PDF if transcription is already collapsed
                  return;
                }
                setSlidesExpanded(!slidesExpanded);
              }}
              disabled={!transcriptionExpanded}
              className={`flex items-center gap-1.5 px-2 text-sm font-medium transition-opacity ${
                !transcriptionExpanded
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:opacity-80 cursor-pointer'
              }`}
              aria-label={slidesExpanded ? "Collapse slides" : "Expand slides"}
            >
              {slidesExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>Expand</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* PDF Display - Resizable with Collapse */}
        {slidesExpanded ? (
          <div
            ref={containerRef}
            className="overflow-auto bg-muted/30 flex items-start justify-center p-8 relative"
            style={{ 
              height: transcriptionExpanded
                ? `${slidesHeightPercent}%`
                : '100%',
              minHeight: `${MIN_SLIDES_HEIGHT}px`,
              maxHeight: transcriptionExpanded
                ? `calc(100% - ${MIN_TRANSCRIPTION_HEIGHT}px)`
                : '100%'
            }}
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
        ) : null}

        {/* Resize Handle - Only show when both sections are expanded */}
        {slidesExpanded && transcriptionExpanded && (
          <div
            onPointerDown={handleSplitResizeStart}
            className="relative w-full h-1 cursor-row-resize group select-none touch-none z-10"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize slides and transcription panels"
          >
            {/* Wider hit area for easier grabbing */}
            <div
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-4 cursor-row-resize"
            />
          </div>
        )}

        {/* Recording Controls / Audio Player and Transcription - Resizable with Collapse */}
        <div 
          className="flex flex-col border-t bg-background overflow-hidden relative"
          style={{
            height: transcriptionExpanded
              ? (slidesExpanded 
                  ? `${100 - slidesHeightPercent}%`
                  : '100%')
              : `${COLLAPSED_BAR_HEIGHT}px`,
            minHeight: transcriptionExpanded 
              ? (slidesExpanded
                  ? `${MIN_TRANSCRIPTION_HEIGHT}px`
                  : `${MIN_TRANSCRIPTION_HEIGHT}px`)
              : `${COLLAPSED_BAR_HEIGHT}px`,
            maxHeight: transcriptionExpanded
              ? (slidesExpanded
                  ? `calc(100% - ${MIN_SLIDES_HEIGHT}px)`
                  : '100%')
              : `${COLLAPSED_BAR_HEIGHT}px`
          }}
        >
          {transcriptionExpanded ? (
            <>
              {/* Show start recording button only if no audio and not recording */}
              {!audioUrl && !isRecording && !transcript && !streamingTranscript.length && (
                <div className="flex items-center justify-center p-6 border-b">
                  <button
                    onClick={handleStartRecording}
                    disabled={processing}
                    className="px-6 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#F5F5F5', color: 'var(--foreground)' }}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        <span>Record Audio</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Streaming Transcription */}
              {(isRecording || isTranscribing || transcript || streamingTranscript.length > 0 || audioUrl) && (
                <div ref={transcriptionScrollRef} className="flex-1 overflow-y-auto p-6 sidebar-scrollbar">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-6 flex-1">
                      <h3 className="text-xl font-semibold">Transcription</h3>
                  {/* Show uploading/processing status inline with title */}
                  {processing && !isRecording && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Uploading audio...</span>
                    </div>
                  )}
                  {/* Show audio player inline with title after processing is complete */}
                  {audioUrl && !isRecording && !processing && (
                    <div className="flex items-center justify-center flex-1">
                      <audio controls className="max-w-sm w-full h-11" src={audioUrl}>
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}
                </div>
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
              {isRecording && streamingTranscript.length === 0 && (
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm">Recording... Speak to see live transcription.</span>
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
              {/* Collapse button for transcription */}
              <div className="flex items-center justify-between px-4 py-2 border-t bg-background/95">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Transcription</span>
                </div>
                <button
                  onClick={() => {
                    if (!slidesExpanded) {
                      // Don't allow collapsing transcription if PDF is already collapsed
                      return;
                    }
                    setTranscriptionExpanded(false);
                  }}
                  disabled={!slidesExpanded}
                  className={`flex items-center gap-1.5 px-2 text-sm font-medium transition-opacity ${
                    !slidesExpanded
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:opacity-80 cursor-pointer'
                  }`}
                  aria-label="Collapse transcription"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Collapse</span>
                </button>
              </div>
            </>
          ) : (
            /* Collapsed transcription bar */
            <div className="flex items-center justify-between px-4 py-3 border-t bg-background/95">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Transcription</span>
              </div>
              <button
                onClick={() => {
                  setTranscriptionExpanded(true);
                }}
                className="flex items-center gap-1.5 px-2 text-sm font-medium hover:opacity-80 transition-opacity cursor-pointer"
                aria-label="Expand transcription"
              >
                <ChevronUp className="w-4 h-4" />
                <span>Expand</span>
              </button>
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

        {/* Drag Overlay for split resize */}
        {isResizingSplit && (
          <div
            className="fixed inset-0 z-[9999] cursor-row-resize"
            style={{ background: 'transparent' }}
          />
        )}
      </div>
    );
  }

  // Render audio recording playback (only when there are no slides)
  if ((sourceType === 'recording' || selectedMethod === 'recording') && audioUrl && !slidesUrl) {
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
