'use client';

import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Loader2, Paperclip, FileText, Code2, PenTool, Folder as FolderIcon, ChevronDown, X, File, CornerDownRight } from 'lucide-react';
import { WorkspaceInstance, Folder, MentionableItem, LearningMode, PdfAttachment } from '@/lib/types';
import { findMentionableItems } from '@/lib/mentions';
import { useActiveLearningMode, getAllLearningModes, getLearningModeConfig } from '@/lib/learningMode';

interface ChatInputProps {
  onSend: (message: string, learningMode?: LearningMode, pdfAttachments?: PdfAttachment[], ensuredChatId?: string) => void;
  onCreateChat?: () => Promise<string>;
  disabled?: boolean;
  loading?: boolean;
  instances?: WorkspaceInstance[];
  folders?: Folder[];
  activeInstance?: WorkspaceInstance | null;
  onPdfsChange?: (pdfs: PdfAttachment[]) => void;
  contextText?: string | null;
  onContextRemoved?: () => void;
}

export interface ChatInputRef {
  setMessage: (message: string) => void;
  setContext: (context: string) => void;
  focus: () => void;
}

/**
 * Input component for sending chat messages
 * Redesigned with bottom action bar separated by a line
 * Supports @ mentions for instances and folders
 * Supports special lecture mentions: @transcript, @slides, @pdf
 * Auto-detects lecture keywords and converts to mentions in lecture context
 * Supports PDF attachments with text extraction
 */
export const ChatInput = React.forwardRef<ChatInputRef, ChatInputProps>(({
  onSend,
  onCreateChat,
  disabled = false,
  loading = false,
  instances = [],
  folders = [],
  activeInstance = null,
  onPdfsChange,
  contextText: externalContextText,
  onContextRemoved,
}, ref) => {
  const [message, setMessage] = useState('');
  const [contextText, setContextText] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteItems, setAutocompleteItems] = useState<MentionableItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Learning mode state
  const [activeMode, overrideMode, setOverrideMode] = useActiveLearningMode();
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const allModes = getAllLearningModes();
  
  // PDF attachment state
  const [attachedPdfs, setAttachedPdfs] = useState<PdfAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    setMessage: (msg: string) => {
      setMessage(msg);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    setContext: (context: string) => {
      setContextText(context);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    focus: () => {
      textareaRef.current?.focus();
    },
  }));

  // Sync external context text
  useEffect(() => {
    if (externalContextText) {
      setContextText(externalContextText);
    }
  }, [externalContextText]);

  const adjustTextareaHeight = () => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(200, textarea.scrollHeight)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  // Update autocomplete when query changes
  useEffect(() => {
    if (autocompleteQuery && showAutocomplete) {
      const items = findMentionableItems(instances, folders, autocompleteQuery, activeInstance);
      setAutocompleteItems(items);
      setSelectedIndex(0);
    } else {
      setAutocompleteItems([]);
    }
  }, [autocompleteQuery, showAutocomplete, instances, folders, activeInstance]);

  const handleSend = async () => {
    if (message.trim() && !loading) {
      // If onCreateChat is provided, call it first (creates chat if none exists)
      let ensuredChatId: string | undefined;
      if (onCreateChat) {
        try {
          ensuredChatId = await onCreateChat();
        } catch (error) {
          console.error('Failed to ensure chat exists:', error);
          return;
        }
      }

      let messageToSend = message.trim();

      // Auto-detect lecture keywords and add mentions if in lecture context
      if (activeInstance?.type === 'lecture') {
        const hasAtTranscript = /@transcript\b/i.test(messageToSend);
        const hasAtSlides = /@(slides|pdf)\b/i.test(messageToSend);
        const hasTranscriptKeyword = /\btranscript\b/i.test(messageToSend);
        const hasSlidesKeyword = /\b(slides|pdf)\b/i.test(messageToSend);

        // Add @transcript if user mentioned transcript without @
        if (!hasAtTranscript && hasTranscriptKeyword) {
          messageToSend = messageToSend.replace(/\btranscript\b/i, '@transcript');
        }

        // Add @slides if user mentioned slides or pdf without @
        if (!hasAtSlides && hasSlidesKeyword) {
          messageToSend = messageToSend.replace(/\b(slides|pdf)\b/i, '@$1');
        }
      }

      const finalMessage = contextText
        ? `Context: ${contextText}\n\n${messageToSend}`
        : messageToSend;
      onSend(finalMessage, activeMode, attachedPdfs.length > 0 ? attachedPdfs : undefined, ensuredChatId);
      setMessage('');
      setContextText('');
      setShowAutocomplete(false);
      setMentionStart(null);
      setAttachedPdfs([]);
      setUploadError(null);
    }
  };
  
  const handleFileClick = () => {
    fileInputRef.current?.click();
  };
  
  const removePdf = (pdfId: string) => {
    const newPdfs = attachedPdfs.filter(pdf => pdf.id !== pdfId);
    setAttachedPdfs(newPdfs);
    if (onPdfsChange) {
      onPdfsChange(newPdfs);
    }
  };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadError(null);
    
    // Process each selected PDF
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setUploadError(`${file.name} is not a PDF file`);
        continue;
      }
      
      // Create a temporary PDF attachment with uploading status
      const tempId = `pdf-${Date.now()}-${i}`;
      const tempPdf: PdfAttachment = {
        type: 'pdf',
        id: tempId,
        filename: file.name,
        extractedText: '',
        status: 'uploading',
      };
      
      // Add to state immediately to show uploading UI
      setAttachedPdfs(prev => [...prev, tempPdf]);
      
      try {
        // Upload to backend for text extraction
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('http://localhost:8001/extract-pdf', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Check for extraction error
        if (data.error) {
          // Update status to error
          setAttachedPdfs(prev => 
            prev.map(pdf => 
              pdf.id === tempId 
                ? { ...pdf, status: 'error' as const }
                : pdf
            )
          );
          setUploadError(data.error);
        } else {
          // Update with extracted text
          setAttachedPdfs(prev => 
            prev.map(pdf => 
              pdf.id === tempId 
                ? { 
                    ...pdf, 
                    extractedText: data.extractedText,
                    status: 'ready' as const 
                  }
                : pdf
            )
          );
        }
      } catch (error) {
        console.error('Error uploading PDF:', error);
        // Update status to error
        setAttachedPdfs(prev => 
          prev.map(pdf => 
            pdf.id === tempId 
              ? { ...pdf, status: 'error' as const }
              : pdf
          )
        );
        setUploadError(`Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Reset file input
    e.target.value = '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setMessage(value);

    // Check for @ mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // Check if there's a space after @ (meaning mention ended)
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        // We're in a mention
        setMentionStart(lastAtIndex);
        const query = textAfterAt.toLowerCase();
        setAutocompleteQuery(query);
        setShowAutocomplete(true);
        return;
      }
    }
    
    // Not in a mention
    setShowAutocomplete(false);
    setMentionStart(null);
  };

  const insertMention = (item: MentionableItem) => {
    if (mentionStart === null || !textareaRef.current) return;

    const beforeMention = message.substring(0, mentionStart);
    const afterCursor = message.substring(textareaRef.current.selectionStart);
    const newMessage = `${beforeMention}@${item.name} ${afterCursor}`;
    
    setMessage(newMessage);
    setShowAutocomplete(false);
    setMentionStart(null);
    
    // Set cursor after the mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStart + item.name.length + 2; // +2 for @ and space
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Command+U: open file picker for attachments
    if (e.metaKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      handleFileClick();
      return;
    }

    if (showAutocomplete && autocompleteItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < autocompleteItems.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(autocompleteItems[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        setMentionStart(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !showAutocomplete) {
      e.preventDefault();
      handleSend();
    }
  };

  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'FileText':
        return <FileText className="h-4 w-4" />;
      case 'Code2':
        return <Code2 className="h-4 w-4" />;
      case 'PenTool':
        return <PenTool className="h-4 w-4" />;
      case 'Folder':
        return <FolderIcon className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

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

  return (
    <div className="p-4 bg-background relative">
      {/* Autocomplete dropdown */}


      {/* Context bubble - displayed above input */}
      {contextText && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg">
          <CornerDownRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 text-sm text-foreground line-clamp-2">
            {contextText}
          </div>
          <button
            type="button"
            onClick={() => {
              setContextText('');
              if (onContextRemoved) {
                onContextRemoved();
              }
            }}
            className="p-1 rounded-full hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Remove context"
          >
            <X className="h-4 w-4 text-foreground" />
          </button>
        </div>
      )}

      {/* PDF Chips - displayed above input */}
      {attachedPdfs.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachedPdfs.map((pdf) => (
            <div
              key={pdf.id}
              className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg"
            >
              <div className="p-1.5 rounded bg-red-500/20">
                <File className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{pdf.filename}</span>
                <span className="text-xs text-muted-foreground">PDF</span>
              </div>
              {pdf.status === 'uploading' && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {pdf.status === 'error' && (
                <span className="text-xs text-red-500">Error</span>
              )}
              <button
                type="button"
                onClick={() => removePdf(pdf.id)}
                className="ml-auto p-1 rounded-full hover:bg-red-500/20 transition-colors"
                aria-label="Remove PDF"
              >
                <X className="h-4 w-4 text-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Error message */}
      {uploadError && (
        <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
          {uploadError}
        </div>
      )}

      {/* Main input container with border */}
      <div className="relative border border-input rounded-lg overflow-visible bg-background">
        {/* Autocomplete dropdown */}
        {showAutocomplete && autocompleteItems.length > 0 && (
          <div
            ref={autocompleteRef}
            className="absolute bottom-full left-0 mb-2 w-64 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50"
          >
            {autocompleteItems.map((item, index) => (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                onClick={() => insertMention(item)}
                className={`
                  w-full px-3 py-2 text-left flex items-center gap-2 text-sm
                  hover:bg-muted transition-colors
                  ${index === selectedIndex ? 'bg-muted' : ''}
                `}
              >
                <span className="text-muted-foreground">
                  {getIcon(item.icon)}
                </span>
                <span className="font-medium">{item.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {item.type}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Learning mode dropdown - positioned inside input container */}
        {showModeDropdown && (
          <div
            ref={modeDropdownRef}
            className="absolute bottom-12 left-3 w-64 bg-background border border-border rounded-xl shadow-lg py-1 z-50"
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

        {/* Textarea area */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Learning starts now"
          disabled={disabled || loading}
          rows={1}
          className="
            w-full px-4 pt-2 pb-0.5 max-h-[200px]
            bg-transparent text-foreground text-sm
            resize-none border-0
            focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-background">
          <div className="flex items-center space-x-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {/* Upload button */}
            <button
              type="button"
              onClick={handleFileClick}
              disabled={disabled || loading}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Attach PDF"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Learning mode selector */}
            <button
              ref={modeButtonRef}
              type="button"
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm"
              aria-label="Select learning mode"
            >
              <span>{getLearningModeConfig(activeMode).name}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          
          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={disabled || loading || !message.trim()}
            className="
              p-2 rounded-lg
              bg-primary text-primary-foreground
              hover:bg-primary/90
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';
