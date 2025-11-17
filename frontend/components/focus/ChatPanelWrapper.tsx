'use client';

import React, { useRef, useEffect } from 'react';
import { AISidePanel, AISidePanelRef } from '@/components/ai/AISidePanel';
import { useFocusViewEvent } from '@/lib/FocusViewContext';

/**
 * Wrapper component for AISidePanel that listens to Focus View events
 *
 * This component bridges the event bus with the chat panel, allowing
 * other components to send text to the chat via the ASK_MIMIR event.
 */
export const ChatPanelWrapper: React.FC = () => {
  const chatPanelRef = useRef<AISidePanelRef>(null);

  // Listen for ASK_MIMIR events
  useFocusViewEvent('ASK_MIMIR', (event) => {
    if (chatPanelRef.current && event.payload?.text) {
      chatPanelRef.current.addToChat(event.payload.text);
    }
  });

  return (
    <AISidePanel
      ref={chatPanelRef}
      instances={[]}
      folders={[]}
    />
  );
};
