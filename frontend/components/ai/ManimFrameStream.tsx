'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ManimFrameStreamProps {
  frames: Map<number, string>; // frame_number -> base64 data
  currentFrame: number;
  isStreaming: boolean;
  className?: string;
}

/**
 * ManimFrameStream component
 * Displays streaming Manim animation frames
 */
export const ManimFrameStream: React.FC<ManimFrameStreamProps> = ({
  frames,
  currentFrame,
  isStreaming,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log(`[ManimFrameStream] Rendering frame ${currentFrame}, total frames: ${frames.size}`);
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('[ManimFrameStream] No canvas ref');
      return;
    }

    const frameData = frames.get(currentFrame);
    if (!frameData) {
      console.log(`[ManimFrameStream] No frame data for frame ${currentFrame}`);
      setIsLoading(true);
      return;
    }

    console.log(`[ManimFrameStream] Loading frame ${currentFrame}, data length: ${frameData.length}`);

    // Create image from base64 data
    const img = new Image();
    img.onload = () => {
      console.log(`[ManimFrameStream] Frame ${currentFrame} image loaded successfully, size: ${img.width}x${img.height}`);
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw image on canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setIsLoading(false);
        console.log(`[ManimFrameStream] Frame ${currentFrame} rendered to canvas`);
      }
    };
    
    img.onerror = (e) => {
      console.error(`[ManimFrameStream] Error loading frame ${currentFrame} image:`, e);
      setIsLoading(false);
    };
    
    img.src = `data:image/jpeg;base64,${frameData}`;
    imgRef.current = img;
  }, [currentFrame, frames]);

  return (
    <div className={`relative w-full bg-black rounded-lg overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-auto max-h-[500px] object-contain"
        style={{ display: isLoading ? 'none' : 'block' }}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      )}
      {isStreaming && (
        <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          Streaming...
        </div>
      )}
    </div>
  );
};

