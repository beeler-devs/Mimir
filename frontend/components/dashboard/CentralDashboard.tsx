'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { InstanceType, LearningMode, CodeFile, FileTreeNode, CodeLanguage } from '@/lib/types';
import { useActiveLearningMode, getAllLearningModes, getLearningModeConfig } from '@/lib/learningMode';

interface CentralDashboardProps {
  onCreateInstance: (title: string, type: InstanceType, additionalData?: any) => Promise<void>;
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

// Process zip file and extract contents
const extractZipContents = async (file: File): Promise<{ files: CodeFile[]; fileTree: FileTreeNode[] }> => {
  // Use JSZip library to extract files
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
      // Create folder node
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

      // Add to parent's children
      const parent = folderMap.get(parentPath || '');
      if (parent && parent.children) {
        parent.children.push(folderNode);
      }
    } else {
      // Extract file content
      const content = await zipEntry.async('text');
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      const language = detectLanguage(name);

      // Create file object
      const codeFile: CodeFile = {
        id: path,
        name,
        path,
        content,
        language,
      };
      files.push(codeFile);

      // Create file tree node
      const fileNode: FileTreeNode = {
        id: path,
        name,
        type: 'file',
        parentId: parentPath || 'root',
        language,
        path,
      };

      // Add to parent's children
      const parent = folderMap.get(parentPath || '');
      if (parent && parent.children) {
        parent.children.push(fileNode);
      }
    }
  }

  return { files, fileTree };
};

export const CentralDashboard: React.FC<CentralDashboardProps> = ({ onCreateInstance }) => {
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<InstanceType | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);

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
    textarea.style.height = `${Math.min(200, textarea.scrollHeight)}px`;
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

  const handleSubmit = async () => {
    if (!input.trim() && !selectedMode) return;

    setLoading(true);
    setUploadProgress('Processing...');

    try {
      // Auto-detect content type
      let detectedType: InstanceType = selectedMode || 'text';
      let title = input.trim() || 'Untitled';
      let additionalData: any = {};

      // Check for YouTube URL
      if (isYouTubeUrl(input)) {
        detectedType = 'lecture';
        const youtubeId = extractYouTubeId(input);
        title = `YouTube Lecture: ${youtubeId}`;
        additionalData = {
          sourceType: 'youtube',
          youtubeId,
          videoUrl: input,
          processingStatus: 'pending',
        };
      }

      // Create instance
      await onCreateInstance(title, detectedType, additionalData);

      // Reset
      setInput('');
      setSelectedMode(null);
      setUploadProgress(null);
    } catch (error) {
      console.error('Failed to create instance:', error);
      setUploadProgress('Error creating instance');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setLoading(true);
    setUploadProgress(`Uploading ${file.name}...`);

    try {
      // Handle PDF upload
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const type: InstanceType = selectedMode === 'annotate' ? 'annotate' : 'pdf';

        // TODO: Upload to Supabase Storage and extract text
        // For now, just create instance with file info
        await onCreateInstance(
          file.name.replace('.pdf', ''),
          type,
          {
            fileName: file.name,
            fileSize: file.size,
            processingStatus: 'pending',
          }
        );
      }

      setUploadProgress(null);
      e.target.value = ''; // Reset input
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress('Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('Please upload a .zip file');
      return;
    }

    setLoading(true);
    setUploadProgress(`Extracting ${file.name}...`);

    try {
      // Extract zip contents
      const { files: codeFiles, fileTree } = await extractZipContents(file);

      // Create code instance with extracted files
      await onCreateInstance(
        file.name.replace('.zip', ''),
        'code',
        {
          files: codeFiles,
          fileTree,
          activeFilePath: codeFiles.length > 0 ? codeFiles[0].path : null,
          openFiles: codeFiles.slice(0, 3).map(f => f.path), // Open first 3 files
        }
      );

      setUploadProgress(null);
      e.target.value = ''; // Reset input
    } catch (error) {
      console.error('Zip extraction error:', error);
      setUploadProgress('Failed to extract zip file');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-4xl space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Sparkles className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Welcome to Mimir</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Your AI-powered learning companion for STEM education
          </p>
        </div>

        {/* Mode Selection */}
        <div className="grid grid-cols-5 gap-3">
          {modes.map((mode) => {
            const Icon = mode.icon;
            const isSelected = selectedMode === mode.type;

            return (
              <button
                key={mode.type}
                onClick={() => setSelectedMode(isSelected ? null : mode.type)}
                className={`
                  p-4 rounded-xl border-2 transition-all
                  ${isSelected
                    ? 'border-primary bg-primary/10 shadow-md'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }
                `}
              >
                <div className="flex flex-col items-center gap-2">
                  <Icon className={`h-8 w-8 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <div className={`font-medium text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                      {mode.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {mode.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Upload Options (shown when mode is selected) */}
        {(selectedMode === 'code' || selectedMode === 'pdf' || selectedMode === 'annotate') && (
          <div className="flex justify-center gap-3">
            {selectedMode === 'code' && (
              <>
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleZipUpload}
                  className="hidden"
                />
                <button
                  onClick={() => zipInputRef.current?.click()}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload ZIP file</span>
                </button>
              </>
            )}
            {(selectedMode === 'pdf' || selectedMode === 'annotate') && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload PDF</span>
                </button>
              </>
            )}
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

        {/* Input Area */}
        <div className="space-y-2">
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
                  ? 'Describe your code project or upload a ZIP file...'
                  : 'What would you like to learn today?'
              }
              disabled={loading}
              rows={1}
              className="
                w-full px-4 pt-3 pb-1 max-h-[200px]
                bg-transparent text-foreground text-base
                resize-none border-0
                focus:outline-none
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border">
              <div className="flex items-center gap-2">
                {/* Learning mode selector */}
                <button
                  ref={modeButtonRef}
                  type="button"
                  onClick={() => setShowModeDropdown(!showModeDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm"
                >
                  <span>{getLearningModeConfig(activeMode).name}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {selectedMode && (
                  <div className="px-3 py-1.5 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                    Mode: <span className="text-foreground font-medium">{modes.find(m => m.type === selectedMode)?.label}</span>
                  </div>
                )}
              </div>

              {/* Send button */}
              <button
                onClick={handleSubmit}
                disabled={loading || (!input.trim() && !selectedMode)}
                className="
                  px-4 py-2 rounded-lg
                  bg-primary text-primary-foreground
                  hover:bg-primary/90
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                  flex items-center gap-2
                "
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Start Learning</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Paste a YouTube link for lectures, upload a ZIP for code projects, or just start typing
          </p>
        </div>
      </div>
    </div>
  );
};
