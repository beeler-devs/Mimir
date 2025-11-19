'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText,
  Code2,
  PenTool,
  File,
  Video,
  Send,
  Loader2,
  Upload,
  ChevronDown,
  Paperclip,
  X
} from 'lucide-react';
import { InstanceType, LearningMode, CodeFile, FileTreeNode, CodeLanguage } from '@/lib/types';
import { useActiveLearningMode, getAllLearningModes, getLearningModeConfig } from '@/lib/learningMode';

export interface InstanceCreationFormProps {
  onCreateInstance: (title: string, type: InstanceType, additionalData?: any) => Promise<void>;
  onCancel?: () => void;
  /** Whether to show in compact modal style */
  compact?: boolean;
}

// YouTube URL detection
const isYouTubeUrl = (url: string): boolean => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i;
  return youtubeRegex.test(url);
};

// Extract YouTube ID
const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Detect language from file extension
const detectLanguage = (filename: string): CodeLanguage => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py': return 'python';
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'java': return 'java';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'h':
    case 'hpp': return 'cpp';
    default: return 'python';
  }
};

// Detect instance type from file extension
const detectModeFromFile = (filename: string): InstanceType | null => {
  const name = filename.toLowerCase();

  // PDF files
  if (name.endsWith('.pdf')) {
    return 'pdf';
  }

  // Code files
  if (name.endsWith('.zip') ||
      name.endsWith('.js') ||
      name.endsWith('.py') ||
      name.endsWith('.java') ||
      name.endsWith('.cpp') ||
      name.endsWith('.ts') ||
      name.endsWith('.jsx') ||
      name.endsWith('.tsx') ||
      name.endsWith('.cc') ||
      name.endsWith('.cxx') ||
      name.endsWith('.h') ||
      name.endsWith('.hpp')) {
    return 'code';
  }

  // Audio/video files for lecture
  if (name.endsWith('.mp3') ||
      name.endsWith('.mp4') ||
      name.endsWith('.wav') ||
      name.endsWith('.m4a') ||
      name.endsWith('.webm') ||
      name.endsWith('.mov')) {
    return 'lecture';
  }

  return null;
};

// Extract filename without extension for auto-titling
const extractTitleFromFilename = (filename: string): string => {
  // Remove extension
  return filename.replace(/\.[^/.]+$/, '');
};

// Process zip file and extract contents
const extractZipContents = async (file: File): Promise<{ files: CodeFile[]; fileTree: FileTreeNode[] }> => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);

  const files: CodeFile[] = [];
  const fileTree: FileTreeNode[] = [];
  const folderMap = new Map<string, FileTreeNode>();

  // Create root node
  const rootNode: FileTreeNode = {
    id: 'root',
    name: 'root',
    type: 'folder',
    parentId: null,
    children: [],
  };
  fileTree.push(rootNode);
  folderMap.set('', rootNode);

  // Process each file
  for (const [path, zipEntry] of Object.entries(contents.files)) {
    if (zipEntry.dir) {
      const parts = path.split('/').filter(p => p);
      const name = parts[parts.length - 1] || 'root';
      const parentPath = parts.slice(0, -1).join('/');

      const folderNode: FileTreeNode = {
        id: path,
        name,
        type: 'folder',
        parentId: parentPath || 'root',
        children: [],
      };

      folderMap.set(path, folderNode);

      const parent = folderMap.get(parentPath || '');
      if (parent && parent.children) {
        parent.children.push(folderNode);
      }
    } else {
      const content = await zipEntry.async('text');
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      const language = detectLanguage(name);

      const codeFile: CodeFile = {
        id: path,
        name,
        path,
        content,
        language,
      };
      files.push(codeFile);

      const fileNode: FileTreeNode = {
        id: path,
        name,
        type: 'file',
        parentId: parentPath || 'root',
        language,
        path,
      };

      const parent = folderMap.get(parentPath || '');
      if (parent && parent.children) {
        parent.children.push(fileNode);
      }
    }
  }

  return { files, fileTree };
};

export const InstanceCreationForm: React.FC<InstanceCreationFormProps> = ({
  onCreateInstance,
  onCancel,
  compact = false
}) => {
  const [title, setTitle] = useState('');
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<InstanceType | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // Learning mode state
  const [activeMode, overrideMode, setOverrideMode] = useActiveLearningMode();
  const allModes = getAllLearningModes();

  const modes: Array<{ type: InstanceType; icon: any; label: string; description: string }> = [
    { type: 'lecture', icon: Video, label: 'Lecture', description: 'Video, audio, or slides' },
    { type: 'text', icon: FileText, label: 'Text', description: 'Notes and essays' },
    { type: 'code', icon: Code2, label: 'Code', description: 'Multi-file editor' },
    { type: 'pdf', icon: File, label: 'PDF', description: 'Study documents' },
    { type: 'annotate', icon: PenTool, label: 'Annotate', description: 'Draw on PDFs' },
  ];

  const adjustTextareaHeight = () => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(150, textarea.scrollHeight)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  // Click outside handler for mode dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isClickInsideDropdown = modeDropdownRef.current?.contains(event.target as Node);
      const isClickOnButton = modeButtonRef.current?.contains(event.target as Node);

      if (!isClickInsideDropdown && !isClickOnButton) {
        setShowModeDropdown(false);
      }
    };

    if (showModeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModeDropdown]);

  // Handle file processing with auto-classification and auto-titling
  const processFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;

    setAttachedFiles(prev => [...prev, ...files]);

    const firstFile = files[0];

    // Auto-classify: detect mode from file type
    const detectedMode = detectModeFromFile(firstFile.name);
    if (detectedMode && !selectedMode) {
      setSelectedMode(detectedMode);
    }

    // Auto-title: set title from filename if empty
    if (!title) {
      setTitle(extractTitleFromFilename(firstFile.name));
    }
  }, [selectedMode, title]);

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    processFiles(Array.from(files));
    e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the dropzone entirely
    if (dropzoneRef.current && !dropzoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const removeAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled()) return;

    setLoading(true);
    setUploadProgress('Processing...');

    try {
      let detectedType: InstanceType = selectedMode || 'text';
      let finalTitle = title.trim() || input.trim() || 'Untitled';
      let additionalData: any = {};

      // Handle code mode with files
      if (detectedType === 'code' && attachedFiles.length > 0) {
        const zipFile = attachedFiles.find(f => f.name.toLowerCase().endsWith('.zip'));

        if (zipFile) {
          const { files, fileTree } = await extractZipContents(zipFile);
          if (!title.trim()) {
            finalTitle = zipFile.name.replace('.zip', '');
          }
          additionalData = {
            files,
            fileTree,
            activeFilePath: files.length > 0 ? files[0].path : null,
            openFiles: files.slice(0, 3).map(f => f.path),
          };
        } else {
          const codeFiles: CodeFile[] = [];
          const fileTree: FileTreeNode[] = [];

          for (const file of attachedFiles) {
            const name = file.name.toLowerCase();
            if (name.endsWith('.js') || name.endsWith('.py') || name.endsWith('.java') ||
                name.endsWith('.cpp') || name.endsWith('.ts') || name.endsWith('.jsx') || name.endsWith('.tsx')) {
              const content = await file.text();
              const language = detectLanguage(file.name);

              codeFiles.push({
                id: file.name,
                name: file.name,
                path: file.name,
                content,
                language,
              });

              fileTree.push({
                id: file.name,
                name: file.name,
                type: 'file',
                parentId: null,
                language,
                path: file.name,
              });
            }
          }

          if (codeFiles.length > 0) {
            if (!title.trim()) {
              finalTitle = codeFiles[0].name.replace(/\.[^/.]+$/, '');
            }
            additionalData = {
              files: codeFiles,
              fileTree,
              activeFilePath: codeFiles[0].path,
              openFiles: codeFiles.slice(0, 3).map(f => f.path),
            };
          }
        }
      }

      // Handle PDF mode with file
      if (detectedType === 'pdf' && attachedFiles.length > 0) {
        const pdfFile = attachedFiles.find(f => f.name.toLowerCase().endsWith('.pdf'));
        if (pdfFile) {
          if (!title.trim()) {
            finalTitle = pdfFile.name.replace('.pdf', '');
          }
          additionalData = {
            fileName: pdfFile.name,
            fileSize: pdfFile.size,
            processingStatus: 'pending',
          };
        }
      }

      // Check for YouTube URL
      if (isYouTubeUrl(input)) {
        detectedType = 'lecture';
        const youtubeId = extractYouTubeId(input);
        if (!title.trim()) {
          finalTitle = `YouTube Lecture: ${youtubeId}`;
        }
        additionalData = {
          sourceType: 'youtube',
          youtubeId,
          videoUrl: input,
          processingStatus: 'pending',
        };
      }

      // Create instance
      await onCreateInstance(finalTitle, detectedType, additionalData);

      // Reset form
      setTitle('');
      setInput('');
      setSelectedMode(null);
      setAttachedFiles([]);
      setUploadProgress(null);
    } catch (error) {
      console.error('Failed to create instance:', error);
      setUploadProgress('Error creating instance');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    // Command+U: open file picker for attachments
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      attachmentInputRef.current?.click();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSubmitDisabled = () => {
    if (loading) return true;

    // Code mode: require files
    if (selectedMode === 'code') {
      const hasValidFiles = attachedFiles.some(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.zip') ||
               name.endsWith('.js') ||
               name.endsWith('.py') ||
               name.endsWith('.java') ||
               name.endsWith('.cpp') ||
               name.endsWith('.ts') ||
               name.endsWith('.jsx') ||
               name.endsWith('.tsx');
      });
      return !hasValidFiles;
    }

    // PDF mode: require PDF file
    if (selectedMode === 'pdf') {
      const hasPdf = attachedFiles.some(file => file.name.toLowerCase().endsWith('.pdf'));
      return !hasPdf;
    }

    // For other modes, require title or text input or a mode selection
    return !title.trim() && !input.trim() && !selectedMode;
  };

  return (
    <div className={`w-full ${compact ? 'space-y-4' : 'space-y-6'}`}>
      {/* Mode Selection */}
      <div className={`grid grid-cols-5 gap-2 ${compact ? '' : 'max-w-2xl mx-auto'}`}>
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isSelected = selectedMode === mode.type;

          return (
            <button
              key={mode.type}
              onClick={() => setSelectedMode(isSelected ? null : mode.type)}
              className={`
                p-2.5 rounded-xl border-2 transition-all
                ${isSelected
                  ? 'border-primary bg-primary/10 shadow-md'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              <div className="flex items-center justify-center gap-1.5 opacity-70">
                <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className={`text-xs ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {mode.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dropzone - Always Visible */}
      <div
        ref={dropzoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => attachmentInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
          ${isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
          }
        `}
      >
        <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
        <p className="text-sm text-muted-foreground">
          {isDragging
            ? 'Drop files here...'
            : 'Drag and drop files here, or click to browse'
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, ZIP, code files (.py, .js, .ts, .java, .cpp)
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        accept=".pdf,.zip,.js,.py,.java,.cpp,.ts,.jsx,.tsx,.mp3,.mp4,.wav,.m4a,.webm,.mov"
        onChange={handleAttachmentSelect}
        className="hidden"
      />

      {/* Attached Files Display */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm"
            >
              <File className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground">{file.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeAttachment(index);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{uploadProgress}</span>
          </div>
        </div>
      )}

      {/* Title Input */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Instance title (auto-filled from file)"
          disabled={loading}
          className="
            w-full px-4 py-2.5
            bg-background text-foreground text-sm
            border-2 border-border rounded-xl
            focus:outline-none focus:border-primary
            disabled:opacity-50 disabled:cursor-not-allowed
            placeholder:text-muted-foreground
          "
        />
      </div>

      {/* Description/URL Input */}
      <div className="relative border-2 border-border rounded-xl overflow-visible bg-background shadow-sm">
        {/* Learning mode dropdown */}
        {showModeDropdown && (
          <div
            ref={modeDropdownRef}
            className="absolute bottom-full left-3 mb-2 w-64 bg-background border border-border rounded-xl shadow-lg py-1 z-50"
          >
            {allModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setOverrideMode(mode.id);
                  setShowModeDropdown(false);
                }}
                className={`
                  w-full px-3 py-2 text-left hover:bg-muted transition-colors
                  ${activeMode === mode.id ? 'bg-primary/10' : ''}
                `}
              >
                <div className="font-medium text-sm">{mode.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {mode.description}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedMode === 'lecture'
              ? 'Paste YouTube link or describe your lecture...'
              : selectedMode === 'code'
              ? 'Describe your code project...'
              : 'What would you like to learn today?'
          }
          disabled={loading}
          rows={1}
          className="
            w-full px-4 pt-3 pb-1 max-h-[150px]
            bg-transparent text-foreground text-sm
            resize-none border-0
            focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Paperclip attachment button */}
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              aria-label="Attach files (Cmd+U)"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Learning mode selector */}
            <button
              ref={modeButtonRef}
              type="button"
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs"
            >
              <span>{getLearningModeConfig(activeMode).name}</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {selectedMode && (
              <div className="px-2.5 py-1 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{modes.find(m => m.type === selectedMode)?.label}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                onClick={onCancel}
                disabled={loading}
                className="
                  px-3 py-1.5 rounded-lg
                  text-muted-foreground hover:text-foreground
                  hover:bg-muted
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors text-sm
                "
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={isSubmitDisabled()}
              className="
                px-3 py-1.5 rounded-lg
                bg-primary text-primary-foreground
                hover:bg-primary/90
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
                flex items-center gap-1.5 text-sm
              "
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>{compact ? 'Create' : 'Start Learning'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {!compact && (
        <p className="text-xs text-muted-foreground text-center">
          Press Cmd+U to attach files, paste a YouTube link for lectures, or just start typing
        </p>
      )}
    </div>
  );
};
