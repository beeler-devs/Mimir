'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { InstanceType } from '@/lib/types';
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  COLLAPSED_LEFT_WIDTH,
  COLLAPSED_RIGHT_WIDTH,
  COLLAPSE_THRESHOLD,
  getResizeConstraints,
  calculateValidWidths,
  calculateDragWidths,
  type ResizeConstraints,
} from '@/lib/resizeConstraints';

// Storage key for persisting layout
const STORAGE_KEY = 'mimir-panel-layout';

interface SavedLayout {
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  // Remember widths before collapse for restore
  leftExpandedWidth?: number;
  rightExpandedWidth?: number;
}

interface ResizeState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  isDragging: boolean;
  activeHandle: 'left' | 'right' | null;
  // Store width before collapse to restore later
  leftExpandedWidth: number;
  rightExpandedWidth: number;
  // Track if we've loaded from storage (for SSR hydration)
  isHydrated: boolean;
}

interface ResizeContextValue {
  // Current state
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  isDragging: boolean;

  // Constraint info (for components that need it)
  constraints: ResizeConstraints;

  // Actions
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleLeftCollapsed: () => void;
  toggleRightCollapsed: () => void;

  // Drag handlers
  startDrag: (handle: 'left' | 'right') => void;
  onDrag: (clientX: number) => void;
  endDrag: () => void;

  // Instance context
  setInstanceContext: (type: InstanceType | null, hasFileTree?: boolean) => void;
}

const ResizeContext = createContext<ResizeContextValue | null>(null);

export function useResize() {
  const context = useContext(ResizeContext);
  if (!context) {
    throw new Error('useResize must be used within a ResizeProvider');
  }
  return context;
}

interface ResizeProviderProps {
  children: React.ReactNode;
}

export function ResizeProvider({ children }: ResizeProviderProps) {
  // Instance context for dynamic constraints
  const [instanceType, setInstanceType] = useState<InstanceType | null>(null);
  const [hasFileTree, setHasFileTree] = useState(false);

  // Panel state - start with defaults for SSR consistency
  const [state, setState] = useState<ResizeState>({
    leftWidth: DEFAULT_LEFT_WIDTH,
    rightWidth: DEFAULT_RIGHT_WIDTH,
    leftCollapsed: false,
    rightCollapsed: false,
    isDragging: false,
    activeHandle: null,
    leftExpandedWidth: DEFAULT_LEFT_WIDTH,
    rightExpandedWidth: DEFAULT_RIGHT_WIDTH,
    isHydrated: false,
  });

  // Track drag start position
  const dragStartRef = useRef<{ x: number; leftWidth: number; rightWidth: number } | null>(null);

  // Get current constraints based on instance
  const constraints = getResizeConstraints(instanceType, hasFileTree);

  // Load from localStorage after mount (fixes SSR hydration)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: SavedLayout = JSON.parse(saved);
        setState(prev => ({
          ...prev,
          leftWidth: parsed.leftCollapsed ? COLLAPSED_LEFT_WIDTH : parsed.leftSidebarWidth,
          rightWidth: parsed.rightCollapsed ? COLLAPSED_RIGHT_WIDTH : parsed.rightSidebarWidth,
          leftCollapsed: parsed.leftCollapsed,
          rightCollapsed: parsed.rightCollapsed,
          leftExpandedWidth: parsed.leftExpandedWidth ?? parsed.leftSidebarWidth,
          rightExpandedWidth: parsed.rightExpandedWidth ?? parsed.rightSidebarWidth,
          isHydrated: true,
        }));
      } else {
        setState(prev => ({ ...prev, isHydrated: true }));
      }
    } catch {
      setState(prev => ({ ...prev, isHydrated: true }));
    }
  }, []);

  // Save to localStorage (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Don't save until hydrated
    if (!state.isHydrated) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const toSave: SavedLayout = {
        leftSidebarWidth: state.leftCollapsed ? state.leftExpandedWidth : state.leftWidth,
        rightSidebarWidth: state.rightCollapsed ? state.rightExpandedWidth : state.rightWidth,
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        leftExpandedWidth: state.leftExpandedWidth,
        rightExpandedWidth: state.rightExpandedWidth,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state.leftWidth, state.rightWidth, state.leftCollapsed, state.rightCollapsed, state.leftExpandedWidth, state.rightExpandedWidth, state.isHydrated]);

  // Handle window resize - use refs to avoid infinite loops
  const prevViewportRef = useRef<number>(0);

  useEffect(() => {
    const handleWindowResize = () => {
      const viewportWidth = window.innerWidth;

      // Skip if viewport hasn't actually changed
      if (viewportWidth === prevViewportRef.current) return;
      prevViewportRef.current = viewportWidth;

      setState(prev => {
        const { leftWidth, rightWidth, shouldCollapseLeft, shouldCollapseRight } =
          calculateValidWidths(
            viewportWidth,
            prev.leftCollapsed ? prev.leftExpandedWidth : prev.leftWidth,
            prev.rightCollapsed ? prev.rightExpandedWidth : prev.rightWidth,
            constraints,
            prev.leftCollapsed,
            prev.rightCollapsed
          );

        // Only update if something changed
        if (
          leftWidth === prev.leftWidth &&
          rightWidth === prev.rightWidth &&
          shouldCollapseLeft === prev.leftCollapsed &&
          shouldCollapseRight === prev.rightCollapsed
        ) {
          return prev;
        }

        return {
          ...prev,
          leftWidth,
          rightWidth,
          leftCollapsed: shouldCollapseLeft,
          rightCollapsed: shouldCollapseRight,
        };
      });
    };

    window.addEventListener('resize', handleWindowResize);
    // Run once on mount
    handleWindowResize();

    return () => window.removeEventListener('resize', handleWindowResize);
  }, [constraints]);

  // Validate widths when constraints change (e.g., instance type changes)
  useEffect(() => {
    if (!state.isHydrated) return;

    const viewportWidth = window.innerWidth;

    setState(prev => {
      const { leftWidth, rightWidth, shouldCollapseLeft, shouldCollapseRight } =
        calculateValidWidths(
          viewportWidth,
          prev.leftCollapsed ? prev.leftExpandedWidth : prev.leftWidth,
          prev.rightCollapsed ? prev.rightExpandedWidth : prev.rightWidth,
          constraints,
          prev.leftCollapsed,
          prev.rightCollapsed
        );

      if (
        leftWidth === prev.leftWidth &&
        rightWidth === prev.rightWidth &&
        shouldCollapseLeft === prev.leftCollapsed &&
        shouldCollapseRight === prev.rightCollapsed
      ) {
        return prev;
      }

      return {
        ...prev,
        leftWidth,
        rightWidth,
        leftCollapsed: shouldCollapseLeft,
        rightCollapsed: shouldCollapseRight,
      };
    });
  }, [constraints, state.isHydrated]);

  // Set instance context
  const setInstanceContext = useCallback((type: InstanceType | null, fileTree: boolean = false) => {
    setInstanceType(type);
    setHasFileTree(fileTree);
  }, []);

  // Width setters
  const setLeftWidth = useCallback((width: number) => {
    setState(prev => ({
      ...prev,
      leftWidth: width,
      leftExpandedWidth: width, // Update expanded width too
    }));
  }, []);

  const setRightWidth = useCallback((width: number) => {
    setState(prev => ({
      ...prev,
      rightWidth: width,
      rightExpandedWidth: width, // Update expanded width too
    }));
  }, []);

  // Collapse toggles with width memory
  const setLeftCollapsed = useCallback((collapsed: boolean) => {
    setState(prev => {
      if (collapsed) {
        return {
          ...prev,
          leftCollapsed: true,
          leftExpandedWidth: prev.leftWidth, // Remember current width
          leftWidth: COLLAPSED_LEFT_WIDTH,
        };
      } else {
        return {
          ...prev,
          leftCollapsed: false,
          leftWidth: prev.leftExpandedWidth, // Restore previous width
        };
      }
    });
  }, []);

  const setRightCollapsed = useCallback((collapsed: boolean) => {
    setState(prev => {
      if (collapsed) {
        return {
          ...prev,
          rightCollapsed: true,
          rightExpandedWidth: prev.rightWidth, // Remember current width
          rightWidth: COLLAPSED_RIGHT_WIDTH,
        };
      } else {
        return {
          ...prev,
          rightCollapsed: false,
          rightWidth: prev.rightExpandedWidth, // Restore previous width
        };
      }
    });
  }, []);

  const toggleLeftCollapsed = useCallback(() => {
    setState(prev => {
      if (prev.leftCollapsed) {
        // Expanding - restore previous width
        return {
          ...prev,
          leftCollapsed: false,
          leftWidth: prev.leftExpandedWidth,
        };
      } else {
        // Collapsing - save current width
        return {
          ...prev,
          leftCollapsed: true,
          leftExpandedWidth: prev.leftWidth,
          leftWidth: COLLAPSED_LEFT_WIDTH,
        };
      }
    });
  }, []);

  const toggleRightCollapsed = useCallback(() => {
    setState(prev => {
      if (prev.rightCollapsed) {
        // Expanding - restore previous width
        return {
          ...prev,
          rightCollapsed: false,
          rightWidth: prev.rightExpandedWidth,
        };
      } else {
        // Collapsing - save current width
        return {
          ...prev,
          rightCollapsed: true,
          rightExpandedWidth: prev.rightWidth,
          rightWidth: COLLAPSED_RIGHT_WIDTH,
        };
      }
    });
  }, []);

  // Drag handlers
  const startDrag = useCallback((handle: 'left' | 'right') => {
    setState(prev => {
      // Capture current widths at drag start
      dragStartRef.current = {
        x: 0, // Will be set on first move
        leftWidth: prev.leftWidth,
        rightWidth: prev.rightWidth,
      };

      return {
        ...prev,
        isDragging: true,
        activeHandle: handle,
      };
    });
  }, []);

  const onDrag = useCallback((clientX: number) => {
    if (!dragStartRef.current) return;

    setState(prev => {
      if (!prev.isDragging || !prev.activeHandle) return prev;

      // Initialize start X on first move
      if (dragStartRef.current!.x === 0) {
        dragStartRef.current!.x = clientX;
        return prev;
      }

      const delta = clientX - dragStartRef.current!.x;
      const viewportWidth = window.innerWidth;

      // Calculate new widths
      const { leftWidth, rightWidth } = calculateDragWidths(
        prev.activeHandle,
        delta,
        viewportWidth,
        dragStartRef.current!.leftWidth,
        dragStartRef.current!.rightWidth,
        constraints
      );

      // Check for snap-to-collapse
      let newLeftCollapsed = prev.leftCollapsed;
      let newRightCollapsed = prev.rightCollapsed;
      let finalLeftWidth = leftWidth;
      let finalRightWidth = rightWidth;
      let newLeftExpandedWidth = prev.leftExpandedWidth;
      let newRightExpandedWidth = prev.rightExpandedWidth;

      if (prev.activeHandle === 'left') {
        if (leftWidth < COLLAPSE_THRESHOLD) {
          newLeftCollapsed = true;
          finalLeftWidth = COLLAPSED_LEFT_WIDTH;
          // Don't update expanded width - keep the last good value
        } else {
          newLeftCollapsed = false;
          newLeftExpandedWidth = leftWidth; // Update expanded width
        }
      }

      if (prev.activeHandle === 'right') {
        if (rightWidth < COLLAPSE_THRESHOLD) {
          newRightCollapsed = true;
          finalRightWidth = COLLAPSED_RIGHT_WIDTH;
          // Don't update expanded width - keep the last good value
        } else {
          newRightCollapsed = false;
          newRightExpandedWidth = rightWidth; // Update expanded width
        }
      }

      return {
        ...prev,
        leftWidth: finalLeftWidth,
        rightWidth: finalRightWidth,
        leftCollapsed: newLeftCollapsed,
        rightCollapsed: newRightCollapsed,
        leftExpandedWidth: newLeftExpandedWidth,
        rightExpandedWidth: newRightExpandedWidth,
      };
    });
  }, [constraints]);

  const endDrag = useCallback(() => {
    dragStartRef.current = null;
    setState(prev => ({
      ...prev,
      isDragging: false,
      activeHandle: null,
    }));
  }, []);

  // Global pointer event handlers for drag
  useEffect(() => {
    if (!state.isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      requestAnimationFrame(() => {
        onDrag(e.clientX);
      });
    };

    const handlePointerUp = () => {
      endDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    // Also listen for cancel/leave to be safe
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [state.isDragging, onDrag, endDrag]);

  const value: ResizeContextValue = {
    leftWidth: state.leftWidth,
    rightWidth: state.rightWidth,
    leftCollapsed: state.leftCollapsed,
    rightCollapsed: state.rightCollapsed,
    isDragging: state.isDragging,
    constraints,
    setLeftWidth,
    setRightWidth,
    setLeftCollapsed,
    setRightCollapsed,
    toggleLeftCollapsed,
    toggleRightCollapsed,
    startDrag,
    onDrag,
    endDrag,
    setInstanceContext,
  };

  return (
    <ResizeContext.Provider value={value}>
      {children}
    </ResizeContext.Provider>
  );
}
