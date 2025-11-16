'use client';

import { useState, useEffect } from 'react';
import { LearningMode, LearningModeConfig } from './types';

const STORAGE_KEY = 'mimir_default_learning_mode';
const DEFAULT_MODE: LearningMode = 'guided';

/**
 * Learning mode configurations with system prompts
 */
const LEARNING_MODE_CONFIGS: LearningModeConfig[] = [
  {
    id: 'socratic',
    name: 'Socratic',
    description: 'Learn through guided questions and discovery',
    systemPrompt: `You are an AI professor using the Socratic method. Your goal is to help students discover answers through carefully crafted questions rather than providing direct answers. Guide them to think critically, question assumptions, and arrive at insights on their own. Ask probing questions that lead to deeper understanding. Never give away the answer directly - instead, help them reason through it step by step.`,
  },
  {
    id: 'direct',
    name: 'Direct Answers',
    description: 'Get concise, straight-to-the-point solutions',
    systemPrompt: `You are an AI professor providing direct, concise answers. Be efficient and get straight to the point. Provide clear solutions with minimal elaboration unless specifically asked for more detail. Focus on accuracy and brevity. Give the answer first, then a brief explanation if necessary.`,
  },
  {
    id: 'guided',
    name: 'Guided Learning',
    description: 'Step-by-step explanations with comprehension checks',
    systemPrompt: `You are an AI professor using guided learning principles. Break down complex topics into manageable steps. Provide clear, step-by-step explanations. Check for understanding at key points. Build from fundamentals to advanced concepts. Use examples and analogies to clarify difficult ideas. Ensure each step is understood before moving to the next.`,
  },
  {
    id: 'exploratory',
    name: 'Exploratory',
    description: 'Encourage experimentation with hints and resources',
    systemPrompt: `You are an AI professor encouraging exploratory learning. Foster curiosity and experimentation. Provide hints and suggestions rather than complete solutions. Encourage students to try different approaches and learn from mistakes. Share relevant resources and prompt them to investigate further. Help them develop problem-solving skills through exploration.`,
  },
  {
    id: 'conceptual',
    name: 'Conceptual Deep-Dive',
    description: 'Focus on theory and underlying principles',
    systemPrompt: `You are an AI professor focused on deep conceptual understanding. Emphasize underlying theory, mathematical rigor, and fundamental principles. Connect concepts to broader frameworks and foundations. Explore the "why" behind the "how". Discuss theoretical implications and formal definitions. Help build a strong conceptual foundation with rigorous explanations.`,
  },
];

/**
 * Get all learning mode configurations
 */
export function getAllLearningModes(): LearningModeConfig[] {
  return LEARNING_MODE_CONFIGS;
}

/**
 * Get a specific learning mode configuration
 */
export function getLearningModeConfig(mode: LearningMode): LearningModeConfig {
  const config = LEARNING_MODE_CONFIGS.find((m) => m.id === mode);
  if (!config) {
    console.warn(`Unknown learning mode: ${mode}, falling back to default`);
    return LEARNING_MODE_CONFIGS.find((m) => m.id === DEFAULT_MODE)!;
  }
  return config;
}

/**
 * Save default learning mode to localStorage
 */
export function saveDefaultLearningMode(mode: LearningMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode);
  }
}

/**
 * Load default learning mode from localStorage
 * Returns 'guided' if nothing is stored
 */
export function loadDefaultLearningMode(): LearningMode {
  if (typeof window === 'undefined') {
    return DEFAULT_MODE;
  }
  
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isValidLearningMode(stored)) {
    return stored as LearningMode;
  }
  
  return DEFAULT_MODE;
}

/**
 * Type guard to check if a string is a valid learning mode
 */
function isValidLearningMode(value: string): boolean {
  return ['socratic', 'direct', 'guided', 'exploratory', 'conceptual'].includes(value);
}

/**
 * Hook to manage the default learning mode (persisted in localStorage)
 * Returns [currentMode, setMode]
 */
export function useDefaultLearningMode(): [LearningMode, (mode: LearningMode) => void] {
  const [mode, setMode] = useState<LearningMode>(DEFAULT_MODE);

  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadDefaultLearningMode();
    setMode(loaded);
  }, []);

  // Update both state and localStorage
  const updateMode = (newMode: LearningMode) => {
    setMode(newMode);
    saveDefaultLearningMode(newMode);
  };

  return [mode, updateMode];
}

/**
 * Hook to manage active learning mode with temporary overrides
 * Returns [activeMode, overrideMode, setOverrideMode]
 * 
 * activeMode = overrideMode ?? defaultMode
 * Set overrideMode to null to clear the override
 */
export function useActiveLearningMode(): [
  LearningMode,                      // Active mode (override ?? default)
  LearningMode | null,               // Current override (null if none)
  (mode: LearningMode | null) => void // Set override function
] {
  const [defaultMode] = useDefaultLearningMode();
  const [overrideMode, setOverrideMode] = useState<LearningMode | null>(null);

  const activeMode = overrideMode ?? defaultMode;

  return [activeMode, overrideMode, setOverrideMode];
}

