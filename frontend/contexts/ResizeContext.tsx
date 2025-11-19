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
}

interface ResizeState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  isDragging: boolean;
  activeHandle: 'left' | 'right' | null;
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

  // Panel state
  const [state, setState] = useState<ResizeState>(() => {
    // Try to load from localStorage on client
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: SavedLayout = JSON.parse(saved);
          return {
            leftWidth: parsed.leftSidebarWidth,
            rightWidth: parsed.rightSidebarWidth,
            leftCollapsed: parsed.leftCollapsed,
            rightCollapsed: parsed.rightCollapsed,
            isDragging: false,
            activeHandle: null,
          };
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Default state
    return {
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftCollapsed: false,
      rightCollapsed: false,
      isDragging: false,
      activeHandle: null,
    };
  });

  // Track drag start position
  const dragStartRef = useRef<{ x: number; leftWidth: number; rightWidth: number } | null>(null);

  // Get current constraints based on instance
  const constraints = getResizeConstraints(instanceType, hasFileTree);

  // Save to localStorage (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        const toSave: SavedLayout = {
          leftSidebarWidth: state.leftWidth,
          rightSidebarWidth: state.rightWidth,
          leftCollapsed: state.leftCollapsed,
          rightCollapsed: state.rightCollapsed,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state.leftWidth, state.rightWidth, state.leftCollapsed, state.rightCollapsed]);

  // Handle window resize
  useEffect(() => {
    const handleWindowResize = () => {
      const viewportWidth = window.innerWidth;

      const { leftWidth, rightWidth, shouldCollapseLeft, shouldCollapseRight } =
        calculateValidWidths(
          viewportWidth,
          state.leftWidth,
          state.rightWidth,
          constraints,
          state.leftCollapsed,
          state.rightCollapsed
        );

      setState(prev => ({
        ...prev,
        leftWidth,
        rightWidth,
        leftCollapsed: shouldCollapseLeft,
        rightCollapsed: shouldCollapseRight,
      }));
    };

    window.addEventListener('resize', handleWindowResize);
    // Run once on mount
    handleWindowResize();

    return () => window.removeEventListener('resize', handleWindowResize);
  }, [constraints, state.leftCollapsed, state.rightCollapsed, state.leftWidth, state.rightWidth]);

  // Set instance context
  const setInstanceContext = useCallback((type: InstanceType | null, fileTree: boolean = false) => {
    setInstanceType(type);
    setHasFileTree(fileTree);
  }, []);

  // Width setters
  const setLeftWidth = useCallback((width: number) => {
    setState(prev => ({ ...prev, leftWidth: width }));
  }, []);

  const setRightWidth = useCallback((width: number) => {
    setState(prev => ({ ...prev, rightWidth: width }));
  }, []);

  // Collapse toggles
  const setLeftCollapsed = useCallback((collapsed: boolean) => {
    setState(prev => ({
      ...prev,
      leftCollapsed: collapsed,
      leftWidth: collapsed ? COLLAPSED_LEFT_WIDTH : DEFAULT_LEFT_WIDTH,
    }));
  }, []);

  const setRightCollapsed = useCallback((collapsed: boolean) => {
    setState(prev => ({
      ...prev,
      rightCollapsed: collapsed,
      rightWidth: collapsed ? COLLAPSED_RIGHT_WIDTH : DEFAULT_RIGHT_WIDTH,
    }));
  }, []);

  const toggleLeftCollapsed = useCallback(() => {
    setState(prev => {
      const newCollapsed = !prev.leftCollapsed;
      return {
        ...prev,
        leftCollapsed: newCollapsed,
        leftWidth: newCollapsed ? COLLAPSED_LEFT_WIDTH : DEFAULT_LEFT_WIDTH,
      };
    });
  }, []);

  const toggleRightCollapsed = useCallback(() => {
    setState(prev => {
      const newCollapsed = !prev.rightCollapsed;
      return {
        ...prev,
        rightCollapsed: newCollapsed,
        rightWidth: newCollapsed ? COLLAPSED_RIGHT_WIDTH : DEFAULT_RIGHT_WIDTH,
      };
    });
  }, []);

  // Drag handlers
  const startDrag = useCallback((handle: 'left' | 'right') => {
    dragStartRef.current = {
      x: 0, // Will be set on first move
      leftWidth: state.leftWidth,
      rightWidth: state.rightWidth,
    };

    setState(prev => ({
      ...prev,
      isDragging: true,
      activeHandle: handle,
    }));
  }, [state.leftWidth, state.rightWidth]);

  const onDrag = useCallback((clientX: number) => {
    if (!state.isDragging || !state.activeHandle || !dragStartRef.current) {
      return;
    }

    // Initialize start X on first move
    if (dragStartRef.current.x === 0) {
      dragStartRef.current.x = clientX;
      return;
    }

    const delta = clientX - dragStartRef.current.x;
    const viewportWidth = window.innerWidth;

    // Calculate new widths
    const { leftWidth, rightWidth } = calculateDragWidths(
      state.activeHandle,
      delta,
      viewportWidth,
      dragStartRef.current.leftWidth,
      dragStartRef.current.rightWidth,
      constraints
    );

    // Check for snap-to-collapse
    let newLeftCollapsed = state.leftCollapsed;
    let newRightCollapsed = state.rightCollapsed;
    let finalLeftWidth = leftWidth;
    let finalRightWidth = rightWidth;

    if (state.activeHandle === 'left' && leftWidth < COLLAPSE_THRESHOLD) {
      newLeftCollapsed = true;
      finalLeftWidth = COLLAPSED_LEFT_WIDTH;
    } else if (state.activeHandle === 'left') {
      newLeftCollapsed = false;
    }

    if (state.activeHandle === 'right' && rightWidth < COLLAPSE_THRESHOLD) {
      newRightCollapsed = true;
      finalRightWidth = COLLAPSED_RIGHT_WIDTH;
    } else if (state.activeHandle === 'right') {
      newRightCollapsed = false;
    }

    setState(prev => ({
      ...prev,
      leftWidth: finalLeftWidth,
      rightWidth: finalRightWidth,
      leftCollapsed: newLeftCollapsed,
      rightCollapsed: newRightCollapsed,
    }));
  }, [state.isDragging, state.activeHandle, state.leftCollapsed, state.rightCollapsed, constraints]);

  const endDrag = useCallback(() => {
    dragStartRef.current = null;
    setState(prev => ({
      ...prev,
      isDragging: false,
      activeHandle: null,
    }));
  }, []);

  // Global mouse event handlers for drag
  useEffect(() => {
    if (!state.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      requestAnimationFrame(() => {
        onDrag(e.clientX);
      });
    };

    const handleMouseUp = () => {
      endDrag();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
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
