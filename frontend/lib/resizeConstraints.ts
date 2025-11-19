/**
 * Resize constraint definitions for the workspace panels
 */

import type { InstanceType } from './types';

// Panel width constraints in pixels
export interface PanelConstraints {
  min: number;
  max: number;
}

export interface ResizeConstraints {
  leftSidebar: PanelConstraints;
  mainPanel: PanelConstraints;
  rightSidebar: PanelConstraints;
}

// Default widths when panels are expanded
export const DEFAULT_LEFT_WIDTH = 256; // w-64
export const DEFAULT_RIGHT_WIDTH = 384; // w-96

// Collapsed widths
export const COLLAPSED_LEFT_WIDTH = 64; // w-16
export const COLLAPSED_RIGHT_WIDTH = 56; // w-14

// Collapse threshold - if dragged below this, snap to collapsed
export const COLLAPSE_THRESHOLD = 100;

// Base constraints for sidebars (do not change based on instance type)
export const LEFT_SIDEBAR_CONSTRAINTS: PanelConstraints = {
  min: 200,
  max: 400,
};

export const RIGHT_SIDEBAR_CONSTRAINTS: PanelConstraints = {
  min: 280,
  max: 600,
};

// Main panel minimum widths by instance type
const MAIN_PANEL_MIN_WIDTHS: Record<InstanceType, number> = {
  text: 400,
  code: 500,
  annotate: 600,
  pdf: 500,
  lecture: 600,
};

// Additional width needed when code instance has file tree open
const CODE_FILE_TREE_ADDITIONAL_WIDTH = 200;

/**
 * Get the minimum width for the main panel based on instance type and state
 */
export function getMainPanelMinWidth(
  instanceType: InstanceType | null,
  hasFileTree: boolean = false
): number {
  if (!instanceType) {
    return 400; // Default fallback
  }

  let minWidth = MAIN_PANEL_MIN_WIDTHS[instanceType];

  // Code instance with file tree open needs additional width
  if (instanceType === 'code' && hasFileTree) {
    minWidth += CODE_FILE_TREE_ADDITIONAL_WIDTH;
  }

  return minWidth;
}

/**
 * Get complete constraints based on current instance type and state
 */
export function getResizeConstraints(
  instanceType: InstanceType | null,
  hasFileTree: boolean = false
): ResizeConstraints {
  return {
    leftSidebar: LEFT_SIDEBAR_CONSTRAINTS,
    mainPanel: {
      min: getMainPanelMinWidth(instanceType, hasFileTree),
      max: Infinity,
    },
    rightSidebar: RIGHT_SIDEBAR_CONSTRAINTS,
  };
}

/**
 * Calculate valid panel widths ensuring constraints are respected
 * Uses the priority collapse protocol for edge cases
 */
export function calculateValidWidths(
  viewportWidth: number,
  leftWidth: number,
  rightWidth: number,
  constraints: ResizeConstraints,
  leftCollapsed: boolean,
  rightCollapsed: boolean
): {
  leftWidth: number;
  rightWidth: number;
  shouldCollapseLeft: boolean;
  shouldCollapseRight: boolean;
} {
  // Use collapsed widths if panels are collapsed
  const effectiveLeft = leftCollapsed ? COLLAPSED_LEFT_WIDTH : leftWidth;
  const effectiveRight = rightCollapsed ? COLLAPSED_RIGHT_WIDTH : rightWidth;

  // Calculate current main panel width
  const mainWidth = viewportWidth - effectiveLeft - effectiveRight;

  // Check if we need to adjust
  if (mainWidth >= constraints.mainPanel.min) {
    return {
      leftWidth: effectiveLeft,
      rightWidth: effectiveRight,
      shouldCollapseLeft: leftCollapsed,
      shouldCollapseRight: rightCollapsed,
    };
  }

  // Priority Collapse Protocol:
  // 1. Shrink Main (already at min)
  // 2. Shrink Sidebars to their min
  // 3. Force Collapse Right
  // 4. Force Collapse Left

  let newLeft = effectiveLeft;
  let newRight = effectiveRight;
  let shouldCollapseLeft = leftCollapsed;
  let shouldCollapseRight = rightCollapsed;

  // Calculate minimum total sidebar space needed
  const minTotalSpace = constraints.mainPanel.min +
    (leftCollapsed ? COLLAPSED_LEFT_WIDTH : constraints.leftSidebar.min) +
    (rightCollapsed ? COLLAPSED_RIGHT_WIDTH : constraints.rightSidebar.min);

  if (viewportWidth < minTotalSpace) {
    // Step 2: Shrink sidebars to min
    if (!leftCollapsed) {
      newLeft = Math.min(effectiveLeft, constraints.leftSidebar.min);
    }
    if (!rightCollapsed) {
      newRight = Math.min(effectiveRight, constraints.rightSidebar.min);
    }

    // Check if that's enough
    const afterShrink = viewportWidth - newLeft - newRight;

    if (afterShrink < constraints.mainPanel.min && !rightCollapsed) {
      // Step 3: Force collapse right
      shouldCollapseRight = true;
      newRight = COLLAPSED_RIGHT_WIDTH;

      const afterRightCollapse = viewportWidth - newLeft - newRight;

      if (afterRightCollapse < constraints.mainPanel.min && !leftCollapsed) {
        // Step 4: Force collapse left
        shouldCollapseLeft = true;
        newLeft = COLLAPSED_LEFT_WIDTH;
      }
    }
  } else {
    // Just shrink sidebars proportionally if expanded
    if (!leftCollapsed && effectiveLeft > constraints.leftSidebar.min) {
      newLeft = Math.max(constraints.leftSidebar.min,
        effectiveLeft - (constraints.mainPanel.min - mainWidth) / 2);
    }
    if (!rightCollapsed && effectiveRight > constraints.rightSidebar.min) {
      newRight = Math.max(constraints.rightSidebar.min,
        effectiveRight - (constraints.mainPanel.min - mainWidth) / 2);
    }
  }

  return {
    leftWidth: newLeft,
    rightWidth: newRight,
    shouldCollapseLeft,
    shouldCollapseRight,
  };
}

/**
 * Calculate new widths when dragging a resize handle
 */
export function calculateDragWidths(
  handle: 'left' | 'right',
  delta: number,
  viewportWidth: number,
  currentLeftWidth: number,
  currentRightWidth: number,
  constraints: ResizeConstraints
): { leftWidth: number; rightWidth: number } {
  if (handle === 'left') {
    // Dragging right = increase left sidebar
    let newLeft = currentLeftWidth + delta;

    // Clamp to left sidebar constraints
    newLeft = Math.max(constraints.leftSidebar.min, Math.min(newLeft, constraints.leftSidebar.max));

    // Check main panel crush
    const mainWidth = viewportWidth - newLeft - currentRightWidth;
    if (mainWidth < constraints.mainPanel.min) {
      // Cap left width to preserve main panel
      newLeft = viewportWidth - currentRightWidth - constraints.mainPanel.min;
      newLeft = Math.max(constraints.leftSidebar.min, newLeft);
    }

    return { leftWidth: newLeft, rightWidth: currentRightWidth };
  } else {
    // Dragging left = increase right sidebar (delta is negative when dragging left)
    let newRight = currentRightWidth - delta;

    // Clamp to right sidebar constraints
    newRight = Math.max(constraints.rightSidebar.min, Math.min(newRight, constraints.rightSidebar.max));

    // Check main panel crush
    const mainWidth = viewportWidth - currentLeftWidth - newRight;
    if (mainWidth < constraints.mainPanel.min) {
      // Cap right width to preserve main panel
      newRight = viewportWidth - currentLeftWidth - constraints.mainPanel.min;
      newRight = Math.max(constraints.rightSidebar.min, newRight);
    }

    return { leftWidth: currentLeftWidth, rightWidth: newRight };
  }
}
