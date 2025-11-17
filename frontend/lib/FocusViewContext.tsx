'use client';

import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';

/**
 * Event types for the Focus View event bus
 */
export type FocusViewEventType =
  | 'ASK_MIMIR'
  | 'FILE_UPLOADED'
  | 'COMPONENT_MOUNTED'
  | 'COMPONENT_UNMOUNTED';

export interface FocusViewEvent {
  type: FocusViewEventType;
  payload: any;
  timestamp: number;
}

type EventListener = (event: FocusViewEvent) => void;

interface FocusViewContextValue {
  dispatch: (eventType: FocusViewEventType, payload?: any) => void;
  subscribe: (eventType: FocusViewEventType, listener: EventListener) => () => void;
}

const FocusViewContext = createContext<FocusViewContextValue | null>(null);

/**
 * Provider for the Focus View event bus
 *
 * This enables decoupled cross-component communication without prop drilling or refs.
 * Components can dispatch events and subscribe to events they care about.
 *
 * Example:
 * ```tsx
 * const { dispatch } = useFocusViewContext();
 * dispatch('ASK_MIMIR', { text: selectedText });
 * ```
 *
 * ```tsx
 * useFocusViewEvent('ASK_MIMIR', (event) => {
 *   addToChat(event.payload.text);
 * });
 * ```
 */
export const FocusViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use ref to store listeners to avoid re-renders
  const listenersRef = useRef<Map<FocusViewEventType, Set<EventListener>>>(new Map());

  const dispatch = useCallback((eventType: FocusViewEventType, payload?: any) => {
    const event: FocusViewEvent = {
      type: eventType,
      payload,
      timestamp: Date.now(),
    };

    // Get all listeners for this event type
    const listeners = listenersRef.current.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }
  }, []);

  const subscribe = useCallback((eventType: FocusViewEventType, listener: EventListener) => {
    // Get or create the set of listeners for this event type
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }

    const listeners = listenersRef.current.get(eventType)!;
    listeners.add(listener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        listenersRef.current.delete(eventType);
      }
    };
  }, []);

  const value: FocusViewContextValue = {
    dispatch,
    subscribe,
  };

  return (
    <FocusViewContext.Provider value={value}>
      {children}
    </FocusViewContext.Provider>
  );
};

/**
 * Hook to access the Focus View context
 */
export const useFocusViewContext = (): FocusViewContextValue => {
  const context = useContext(FocusViewContext);
  if (!context) {
    throw new Error('useFocusViewContext must be used within FocusViewProvider');
  }
  return context;
};

/**
 * Hook to subscribe to a specific event type
 *
 * Automatically handles subscription/unsubscription on mount/unmount
 *
 * @param eventType - The event type to listen for
 * @param handler - The callback to execute when the event is dispatched
 * @param deps - Dependencies for the handler (similar to useEffect)
 */
export const useFocusViewEvent = (
  eventType: FocusViewEventType,
  handler: (event: FocusViewEvent) => void,
  deps: React.DependencyList = []
) => {
  const { subscribe } = useFocusViewContext();

  useEffect(() => {
    const unsubscribe = subscribe(eventType, handler);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, subscribe, ...deps]);
};
