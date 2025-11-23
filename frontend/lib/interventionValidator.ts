/**
 * Runtime validation for AI intervention responses
 *
 * Protects against malformed Claude responses without crashing the UI.
 * Falls back gracefully when data is invalid.
 */

export interface AIIntervention {
  type: 'voice' | 'annotation' | 'both';
  voiceText?: string;
  laserPosition?: {
    x: number;
    y: number;
    style?: 'point' | 'circle' | 'highlight' | 'ripple';
  };
  annotation?: {
    text: string;
    position: { x: number; y: number };
    type: 'hint' | 'explanation' | 'correction';
  };
}

export interface ValidationResult {
  isValid: boolean;
  intervention?: AIIntervention;
  errors: string[];
  warnings: string[];
}

/**
 * Validate and sanitize an AI intervention response
 *
 * @param data - Raw data from Claude API (untrusted)
 * @returns Validation result with sanitized intervention or errors
 */
export function validateIntervention(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Type guard: must be an object
  if (typeof data !== 'object' || data === null) {
    return {
      isValid: false,
      errors: ['Intervention is not an object'],
      warnings,
    };
  }

  const raw = data as Record<string, unknown>;

  // Validate type field (required)
  if (!raw.type || typeof raw.type !== 'string') {
    errors.push('Missing or invalid "type" field');
  } else if (!['voice', 'annotation', 'both'].includes(raw.type)) {
    errors.push(`Invalid type: "${raw.type}". Must be "voice", "annotation", or "both"`);
  }

  const type = raw.type as AIIntervention['type'];

  // Validate voiceText (required for voice/both types)
  let voiceText: string | undefined;
  if (type === 'voice' || type === 'both') {
    if (!raw.voiceText || typeof raw.voiceText !== 'string') {
      errors.push('Missing or invalid "voiceText" for voice intervention');
    } else if (raw.voiceText.trim().length === 0) {
      errors.push('voiceText cannot be empty');
    } else {
      voiceText = raw.voiceText.trim();
    }
  }

  // Validate laserPosition (optional)
  let laserPosition: AIIntervention['laserPosition'];
  if (raw.laserPosition) {
    const laser = raw.laserPosition as Record<string, unknown>;

    if (typeof laser !== 'object' || laser === null) {
      warnings.push('laserPosition is not an object, ignoring');
    } else {
      // Validate x and y coordinates
      if (typeof laser.x !== 'number' || !isFinite(laser.x)) {
        warnings.push('laserPosition.x is not a valid number, ignoring laser');
      } else if (typeof laser.y !== 'number' || !isFinite(laser.y)) {
        warnings.push('laserPosition.y is not a valid number, ignoring laser');
      } else {
        // Validate style
        const style = laser.style as string | undefined;
        if (style && !['point', 'circle', 'highlight', 'ripple'].includes(style)) {
          warnings.push(`Invalid laser style "${style}", defaulting to "point"`);
        }

        laserPosition = {
          x: laser.x,
          y: laser.y,
          style: (style as AIIntervention['laserPosition']['style']) || 'point',
        };
      }
    }
  }

  // Validate annotation (required for annotation/both types)
  let annotation: AIIntervention['annotation'];
  if (type === 'annotation' || type === 'both') {
    if (!raw.annotation) {
      errors.push('Missing "annotation" for annotation intervention');
    } else {
      const ann = raw.annotation as Record<string, unknown>;

      if (typeof ann !== 'object' || ann === null) {
        errors.push('annotation is not an object');
      } else {
        // Validate annotation.text
        if (!ann.text || typeof ann.text !== 'string') {
          errors.push('annotation.text is missing or invalid');
        } else if (ann.text.trim().length === 0) {
          errors.push('annotation.text cannot be empty');
        }

        // Validate annotation.position
        if (!ann.position || typeof ann.position !== 'object') {
          errors.push('annotation.position is missing or invalid');
        } else {
          const pos = ann.position as Record<string, unknown>;
          if (typeof pos.x !== 'number' || !isFinite(pos.x)) {
            errors.push('annotation.position.x is not a valid number');
          }
          if (typeof pos.y !== 'number' || !isFinite(pos.y)) {
            errors.push('annotation.position.y is not a valid number');
          }
        }

        // Validate annotation.type
        const annType = ann.type as string | undefined;
        if (!annType || !['hint', 'explanation', 'correction'].includes(annType)) {
          warnings.push(`Invalid annotation type "${annType}", defaulting to "hint"`);
        }

        // Build sanitized annotation if no errors
        if (
          ann.text &&
          typeof ann.text === 'string' &&
          ann.position &&
          typeof ann.position === 'object'
        ) {
          const pos = ann.position as Record<string, unknown>;
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            annotation = {
              text: (ann.text as string).trim(),
              position: { x: pos.x, y: pos.y },
              type: (annType as AIIntervention['annotation']['type']) || 'hint',
            };
          }
        }
      }
    }
  }

  // If we have errors, validation failed
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings,
    };
  }

  // Build valid intervention
  const intervention: AIIntervention = {
    type,
    voiceText,
    laserPosition,
    annotation,
  };

  return {
    isValid: true,
    intervention,
    errors: [],
    warnings,
  };
}

/**
 * Create a fallback intervention when validation fails
 *
 * Returns a simple voice-only intervention to avoid breaking UX.
 */
export function createFallbackIntervention(reason: string): AIIntervention {
  return {
    type: 'voice',
    voiceText: `I'm having trouble providing help right now. ${reason}`,
  };
}

/**
 * Safe intervention parser that never throws
 *
 * @param data - Raw data from API
 * @param options - Parsing options
 * @returns Valid intervention or fallback
 */
export function safeParseIntervention(
  data: unknown,
  options?: {
    allowFallback?: boolean;
    onWarning?: (warning: string) => void;
    onError?: (error: string) => void;
  }
): AIIntervention {
  const { allowFallback = true, onWarning, onError } = options || {};

  const result = validateIntervention(data);

  // Log warnings
  result.warnings.forEach((warning) => {
    console.warn('⚠️ Intervention validation warning:', warning);
    onWarning?.(warning);
  });

  // Log errors
  result.errors.forEach((error) => {
    console.error('❌ Intervention validation error:', error);
    onError?.(error);
  });

  // Return validated intervention or fallback
  if (result.isValid && result.intervention) {
    return result.intervention;
  }

  if (allowFallback) {
    const fallback = createFallbackIntervention('Please try asking again.');
    console.warn('🔄 Using fallback intervention:', fallback);
    return fallback;
  }

  // Should never reach here if allowFallback is true
  throw new Error(`Invalid intervention: ${result.errors.join(', ')}`);
}
