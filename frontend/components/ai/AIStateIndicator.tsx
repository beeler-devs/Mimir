'use client';

import React from 'react';

export type AIState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface AIStateIndicatorProps {
  state: AIState;
}

/**
 * Visual indicator showing the current state of the AI coach
 * - Idle: No activity
 * - Listening: User is speaking
 * - Thinking: Processing/API call in progress
 * - Speaking: AI is speaking
 */
export const AIStateIndicator: React.FC<AIStateIndicatorProps> = ({ state }) => {
  const getStateConfig = () => {
    switch (state) {
      case 'listening':
        return {
          icon: '🎤',
          label: 'Listening',
          color: 'bg-blue-500',
          textColor: 'text-blue-700',
          pulseColor: 'bg-blue-400',
        };
      case 'thinking':
        return {
          icon: '🤔',
          label: 'Thinking',
          color: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          pulseColor: 'bg-yellow-400',
        };
      case 'speaking':
        return {
          icon: '🗣️',
          label: 'Speaking',
          color: 'bg-green-500',
          textColor: 'text-green-700',
          pulseColor: 'bg-green-400',
        };
      case 'idle':
      default:
        return {
          icon: '⚪',
          label: 'Idle',
          color: 'bg-gray-300',
          textColor: 'text-gray-500',
          pulseColor: 'bg-gray-200',
        };
    }
  };

  const config = getStateConfig();
  const isActive = state !== 'idle';

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-300 shadow-sm">
      {/* Animated pulse indicator */}
      <div className="relative flex items-center justify-center w-6 h-6">
        {isActive && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.pulseColor} opacity-75 animate-ping`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-4 w-4 ${config.color}`}
        />
      </div>

      {/* State label */}
      <div className="flex items-center gap-1">
        <span className="text-lg leading-none">{config.icon}</span>
        <span className={`text-sm font-medium ${config.textColor}`}>
          {config.label}
        </span>
      </div>
    </div>
  );
};
