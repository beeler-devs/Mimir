'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface PointerPosition {
  x: number;
  y: number;
  style?: 'point' | 'circle' | 'highlight' | 'ripple';
  emphasis?: number; // 0-1
}

interface LaserPointerOverlayProps {
  position: PointerPosition | null;
  isActive: boolean;
  canvasRef?: React.RefObject<HTMLDivElement>;
}

/**
 * Laser pointer overlay that displays a red dot/pointer synced with voice AI
 * Sits on top of the Excalidraw canvas
 */
export const LaserPointerOverlay: React.FC<LaserPointerOverlayProps> = ({
  position,
  isActive,
  canvasRef,
}) => {
  const [transformedPosition, setTransformedPosition] = useState<{ x: number; y: number } | null>(null);

  // Transform Excalidraw canvas coordinates to viewport coordinates
  useEffect(() => {
    if (!position || !canvasRef?.current) {
      setTransformedPosition(null);
      return;
    }

    // Get canvas bounding rect
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // For now, assume 1:1 coordinate mapping
    // In production, you'd need to account for Excalidraw's zoom/pan transformations
    const viewportX = position.x;
    const viewportY = position.y;

    setTransformedPosition({ x: viewportX, y: viewportY });
  }, [position, canvasRef]);

  const style = position?.style || 'point';
  const emphasis = position?.emphasis || 0.7;

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <AnimatePresence>
        {isActive && transformedPosition && (
          <>
            {style === 'point' && (
              <motion.div
                key="laser-point"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: transformedPosition.x - 8,
                  top: transformedPosition.y - 8,
                }}
              >
                {/* Main laser dot */}
                <div
                  className="rounded-full"
                  style={{
                    width: 16,
                    height: 16,
                    backgroundColor: `rgba(239, 68, 68, ${emphasis})`,
                    boxShadow: `0 0 ${12 * emphasis}px rgba(239, 68, 68, 0.8)`,
                  }}
                />

                {/* Pulsing ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-red-500"
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.6, 0, 0.6],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </motion.div>
            )}

            {style === 'circle' && (
              <motion.div
                key="laser-circle"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  position: 'absolute',
                  left: transformedPosition.x - 30,
                  top: transformedPosition.y - 30,
                }}
              >
                {/* Circular highlight */}
                <motion.div
                  className="rounded-full border-4 border-red-500"
                  style={{
                    width: 60,
                    height: 60,
                    backgroundColor: `rgba(239, 68, 68, ${0.1 * emphasis})`,
                  }}
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </motion.div>
            )}

            {style === 'highlight' && (
              <motion.div
                key="laser-highlight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  position: 'absolute',
                  left: transformedPosition.x - 40,
                  top: transformedPosition.y - 40,
                }}
              >
                {/* Spotlight effect */}
                <div
                  className="rounded-full"
                  style={{
                    width: 80,
                    height: 80,
                    background: `radial-gradient(circle, rgba(239, 68, 68, ${0.3 * emphasis}) 0%, transparent 70%)`,
                  }}
                />
              </motion.div>
            )}

            {style === 'ripple' && (
              <div
                style={{
                  position: 'absolute',
                  left: transformedPosition.x,
                  top: transformedPosition.y,
                }}
              >
                {/* Multiple expanding ripples */}
                {[0, 0.3, 0.6].map((delay) => (
                  <motion.div
                    key={`ripple-${delay}`}
                    className="absolute rounded-full border-2 border-red-500"
                    style={{
                      left: -15,
                      top: -15,
                      width: 30,
                      height: 30,
                    }}
                    animate={{
                      scale: [1, 3],
                      opacity: [0.8 * emphasis, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
