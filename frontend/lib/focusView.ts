/**
 * Focus View Grid System
 *
 * A freeform grid layout system that allows users to place components
 * in various grid positions (thirds, quarters, halves, corners, etc.)
 */

export type GridPosition =
  // Full screen
  | 'full'
  // Halves
  | 'left-half'
  | 'right-half'
  | 'top-half'
  | 'bottom-half'
  // Thirds - Vertical
  | 'left-third'
  | 'center-third'
  | 'right-third'
  // Thirds - Horizontal
  | 'top-third'
  | 'middle-third'
  | 'bottom-third'
  // Quarters
  | 'top-left-quarter'
  | 'top-right-quarter'
  | 'bottom-left-quarter'
  | 'bottom-right-quarter'
  // Two-thirds combinations
  | 'left-two-thirds'
  | 'right-two-thirds'
  | 'top-two-thirds'
  | 'bottom-two-thirds'
  // Sixths (for more complex layouts)
  | 'top-left-sixth'
  | 'top-center-sixth'
  | 'top-right-sixth'
  | 'bottom-left-sixth'
  | 'bottom-center-sixth'
  | 'bottom-right-sixth';

export type ComponentType =
  | 'chat'
  | 'code-editor'
  | 'text-editor'
  | 'pdf-viewer'
  | 'voice-input'
  | 'annotate-canvas'
  | 'lecture-viewer'
  | 'flashcard'
  | 'calendar' // Future
  | 'pomodoro' // Future
  | 'terminal' // Future
  | 'whiteboard'; // Future

export interface ComponentSize {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;
  fixedSize?: boolean; // If true, component cannot be resized
}

export interface GridComponentMetadata {
  type: ComponentType;
  title: string;
  description?: string;
  icon?: string;
  defaultSize?: ComponentSize;
  allowedPositions?: GridPosition[]; // If undefined, all positions allowed
  requiresInstance?: boolean; // Whether component needs an instance to function
  supportsHighlightForAsk?: boolean; // Whether "Ask Mimir" on highlight is supported
}

export interface GridComponent {
  id: string;
  type: ComponentType;
  position: GridPosition;
  // Optional instance reference (for components that need data)
  instanceId?: string;
  // Component-specific configuration
  config?: {
    // For chat
    chatId?: string;
    enableHighlightForAsk?: boolean;
    // For code editor
    language?: string;
    // For PDF viewer
    pdfUrl?: string;
    // For text editor
    content?: string;
    // Future configurations
    [key: string]: any;
  };
  // Optional custom size (overrides default)
  customSize?: ComponentSize;
  // Z-index for overlapping components
  zIndex?: number;
}

export interface FocusViewConfiguration {
  id: string;
  name: string;
  description?: string;
  components: GridComponent[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Grid position CSS class mappings
 */
export const GRID_POSITION_CLASSES: Record<GridPosition, string> = {
  // Full
  'full': 'col-span-12 row-span-12',

  // Halves
  'left-half': 'col-span-6 row-span-12 col-start-1 row-start-1',
  'right-half': 'col-span-6 row-span-12 col-start-7 row-start-1',
  'top-half': 'col-span-12 row-span-6 col-start-1 row-start-1',
  'bottom-half': 'col-span-12 row-span-6 col-start-1 row-start-7',

  // Thirds - Vertical
  'left-third': 'col-span-4 row-span-12 col-start-1 row-start-1',
  'center-third': 'col-span-4 row-span-12 col-start-5 row-start-1',
  'right-third': 'col-span-4 row-span-12 col-start-9 row-start-1',

  // Thirds - Horizontal
  'top-third': 'col-span-12 row-span-4 col-start-1 row-start-1',
  'middle-third': 'col-span-12 row-span-4 col-start-1 row-start-5',
  'bottom-third': 'col-span-12 row-span-4 col-start-1 row-start-9',

  // Quarters
  'top-left-quarter': 'col-span-6 row-span-6 col-start-1 row-start-1',
  'top-right-quarter': 'col-span-6 row-span-6 col-start-7 row-start-1',
  'bottom-left-quarter': 'col-span-6 row-span-6 col-start-1 row-start-7',
  'bottom-right-quarter': 'col-span-6 row-span-6 col-start-7 row-start-7',

  // Two-thirds
  'left-two-thirds': 'col-span-8 row-span-12 col-start-1 row-start-1',
  'right-two-thirds': 'col-span-8 row-span-12 col-start-5 row-start-1',
  'top-two-thirds': 'col-span-12 row-span-8 col-start-1 row-start-1',
  'bottom-two-thirds': 'col-span-12 row-span-8 col-start-1 row-start-5',

  // Sixths
  'top-left-sixth': 'col-span-4 row-span-6 col-start-1 row-start-1',
  'top-center-sixth': 'col-span-4 row-span-6 col-start-5 row-start-1',
  'top-right-sixth': 'col-span-4 row-span-6 col-start-9 row-start-1',
  'bottom-left-sixth': 'col-span-4 row-span-6 col-start-1 row-start-7',
  'bottom-center-sixth': 'col-span-4 row-span-6 col-start-5 row-start-7',
  'bottom-right-sixth': 'col-span-4 row-span-6 col-start-9 row-start-7',
};

/**
 * Component registry with metadata
 */
export const COMPONENT_REGISTRY: Record<ComponentType, GridComponentMetadata> = {
  'chat': {
    type: 'chat',
    title: 'Chat',
    description: 'AI chat interface',
    icon: 'MessageSquare',
    supportsHighlightForAsk: false,
  },
  'code-editor': {
    type: 'code-editor',
    title: 'Code Editor',
    description: 'Multi-file code editor with execution',
    icon: 'Code',
    supportsHighlightForAsk: true,
    requiresInstance: false,
  },
  'text-editor': {
    type: 'text-editor',
    title: 'Text Editor',
    description: 'Rich text editor for notes',
    icon: 'FileText',
    supportsHighlightForAsk: true,
    requiresInstance: false,
  },
  'pdf-viewer': {
    type: 'pdf-viewer',
    title: 'PDF Viewer',
    description: 'View and annotate PDFs',
    icon: 'FileImage',
    supportsHighlightForAsk: true,
    requiresInstance: false,
  },
  'voice-input': {
    type: 'voice-input',
    title: 'Voice Input',
    description: 'Voice-based interaction',
    icon: 'Mic',
    defaultSize: {
      width: 300,
      height: 200,
      fixedSize: true,
    },
    allowedPositions: ['top-right-quarter', 'top-left-quarter', 'bottom-right-quarter', 'bottom-left-quarter'],
  },
  'annotate-canvas': {
    type: 'annotate-canvas',
    title: 'Annotation Canvas',
    description: 'Draw and annotate',
    icon: 'PenTool',
    supportsHighlightForAsk: false,
    requiresInstance: false,
  },
  'lecture-viewer': {
    type: 'lecture-viewer',
    title: 'Lecture Viewer',
    description: 'View lectures with transcripts',
    icon: 'Video',
    supportsHighlightForAsk: true,
    requiresInstance: true,
  },
  'flashcard': {
    type: 'flashcard',
    title: 'Flashcards',
    description: 'Study with flashcards',
    icon: 'Layers',
    requiresInstance: true,
  },
  'calendar': {
    type: 'calendar',
    title: 'Calendar',
    description: 'Schedule and deadlines',
    icon: 'Calendar',
    defaultSize: {
      width: 400,
      height: 500,
      minWidth: 300,
      minHeight: 400,
    },
  },
  'pomodoro': {
    type: 'pomodoro',
    title: 'Pomodoro Timer',
    description: 'Focus timer',
    icon: 'Timer',
    defaultSize: {
      width: 250,
      height: 250,
      fixedSize: true,
    },
    allowedPositions: ['top-right-quarter', 'top-left-quarter', 'bottom-right-quarter', 'bottom-left-quarter'],
  },
  'terminal': {
    type: 'terminal',
    title: 'Terminal',
    description: 'Command line interface',
    icon: 'Terminal',
    supportsHighlightForAsk: true,
  },
  'whiteboard': {
    type: 'whiteboard',
    title: 'Whiteboard',
    description: 'Freeform drawing and brainstorming',
    icon: 'Paintbrush',
    supportsHighlightForAsk: false,
  },
};

/**
 * Get available grid positions for a component type
 */
export function getAvailablePositions(componentType: ComponentType): GridPosition[] {
  const metadata = COMPONENT_REGISTRY[componentType];
  if (metadata.allowedPositions) {
    return metadata.allowedPositions;
  }
  // Return all positions if not restricted
  return Object.keys(GRID_POSITION_CLASSES) as GridPosition[];
}

/**
 * Check if a grid position is occupied in the current configuration
 */
export function isPositionOccupied(
  position: GridPosition,
  components: GridComponent[]
): boolean {
  return components.some(c => c.position === position);
}

/**
 * Get suggested positions for a new component (positions not yet occupied)
 */
export function getSuggestedPositions(
  componentType: ComponentType,
  components: GridComponent[]
): GridPosition[] {
  const available = getAvailablePositions(componentType);
  return available.filter(pos => !isPositionOccupied(pos, components));
}

/**
 * Default focus view configurations (templates)
 */
export const DEFAULT_CONFIGURATIONS: Omit<FocusViewConfiguration, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Code & Chat',
    description: 'Code editor with AI assistant',
    components: [
      {
        id: 'code-1',
        type: 'code-editor',
        position: 'left-two-thirds',
      },
      {
        id: 'chat-1',
        type: 'chat',
        position: 'right-third',
        config: {
          enableHighlightForAsk: true,
        },
      },
    ],
  },
  {
    name: 'Study Session',
    description: 'PDF viewer, notes, and chat',
    components: [
      {
        id: 'pdf-1',
        type: 'pdf-viewer',
        position: 'left-half',
      },
      {
        id: 'text-1',
        type: 'text-editor',
        position: 'top-right-quarter',
      },
      {
        id: 'chat-1',
        type: 'chat',
        position: 'bottom-right-quarter',
        config: {
          enableHighlightForAsk: true,
        },
      },
    ],
  },
  {
    name: 'Full Workspace',
    description: 'Complete study environment',
    components: [
      {
        id: 'pdf-1',
        type: 'pdf-viewer',
        position: 'left-third',
      },
      {
        id: 'code-1',
        type: 'code-editor',
        position: 'center-third',
      },
      {
        id: 'chat-1',
        type: 'chat',
        position: 'right-third',
        config: {
          enableHighlightForAsk: true,
        },
      },
    ],
  },
];

/**
 * LocalStorage key for focus view settings
 */
export const FOCUS_VIEW_ENABLED_KEY = 'mimir.focusView.enabled';
export const FOCUS_VIEW_ACTIVE_CONFIG_KEY = 'mimir.focusView.activeConfig';
export const FOCUS_VIEW_CONFIGS_KEY = 'mimir.focusView.configurations';
