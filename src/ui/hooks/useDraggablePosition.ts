import { useState, useEffect, useRef, useCallback } from 'react';

export interface Position {
  x: number;
  y: number;
}

export interface OffsetPosition {
  right: number;
  bottom: number;
}

export const POPUP_WIDTH = 410;
export const POPUP_HEIGHT = 620;
export const TRIGGER_WIDTH = 150;
export const TRIGGER_HEIGHT = 48;
export const VIEWPORT_PADDING = 16;
export const DRAG_THRESHOLD_PX = 6;
const STORAGE_KEY = 'gmail_assistant_offset';
const LEGACY_STORAGE_KEY = 'gmail_assistant_position';

const DEFAULT_OFFSET: OffsetPosition = {
  right: 24,
  bottom: 24
};

/**
 * Clamps coordinates to ensure the element stays inside the visible viewport.
 */
export function clampPosition(
  pos: Position,
  width: number,
  height: number,
  viewportWidth?: number,
  viewportHeight?: number
): Position {
  const innerW = viewportWidth ?? (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280);
  const innerH = viewportHeight ?? (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800);

  const minX = VIEWPORT_PADDING;
  const maxX = Math.max(minX, innerW - width - VIEWPORT_PADDING);
  const minY = VIEWPORT_PADDING;
  const maxY = Math.max(minY, innerH - height - VIEWPORT_PADDING);

  return {
    x: Math.min(Math.max(pos.x, minX), maxX),
    y: Math.min(Math.max(pos.y, minY), maxY)
  };
}

/**
 * Converts bottom-right offset into top-left screen coordinates for given element dimensions.
 */
export function offsetToPosition(
  offset: OffsetPosition,
  width: number,
  height: number,
  viewportWidth?: number,
  viewportHeight?: number
): Position {
  const innerW = viewportWidth ?? (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280);
  const innerH = viewportHeight ?? (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800);

  const rawX = innerW - width - offset.right;
  const rawY = innerH - height - offset.bottom;

  return clampPosition({ x: rawX, y: rawY }, width, height, innerW, innerH);
}

/**
 * Converts top-left screen coordinates into bottom-right offset for given element dimensions.
 */
export function positionToOffset(
  pos: Position,
  width: number,
  height: number,
  viewportWidth?: number,
  viewportHeight?: number
): OffsetPosition {
  const innerW = viewportWidth ?? (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280);
  const innerH = viewportHeight ?? (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800);

  const clamped = clampPosition(pos, width, height, innerW, innerH);

  return {
    right: innerW - width - clamped.x,
    bottom: innerH - height - clamped.y
  };
}

/**
 * Returns default position (bottom-right of viewport).
 */
export function getDefaultPosition(
  width: number = POPUP_WIDTH,
  height: number = POPUP_HEIGHT,
  viewportWidth?: number,
  viewportHeight?: number
): Position {
  return offsetToPosition(DEFAULT_OFFSET, width, height, viewportWidth, viewportHeight);
}

export function useDraggablePosition(isOpen: boolean, onOpenTrigger?: () => void) {
  const [offset, setOffset] = useState<OffsetPosition>(DEFAULT_OFFSET);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const hasMovedPastThresholdRef = useRef(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number }>({
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0
  });

  const width = isOpen ? POPUP_WIDTH : TRIGGER_WIDTH;
  const height = isOpen ? POPUP_HEIGHT : TRIGGER_HEIGHT;

  // 1. Load saved offset from chrome.storage.local on mount
  useEffect(() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY], (res) => {
          if (res && res[STORAGE_KEY]) {
            const saved = res[STORAGE_KEY] as OffsetPosition;
            if (typeof saved.right === 'number' && typeof saved.bottom === 'number' && !isNaN(saved.right) && !isNaN(saved.bottom)) {
              setOffset(saved);
            }
          }
        });
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.right === 'number' && typeof parsed.bottom === 'number' && !isNaN(parsed.right) && !isNaN(parsed.bottom)) {
            setOffset(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('[useDraggablePosition] Load position failed:', e);
    }
  }, []);

  // 2. Persist offset
  const saveOffset = useCallback((newOffset: OffsetPosition) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: newOffset });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newOffset));
      }
    } catch (e) {
      console.warn('[useDraggablePosition] Save position failed:', e);
    }
  }, []);

  // 3. Current computed positions
  const popupPosition = offsetToPosition(offset, POPUP_WIDTH, POPUP_HEIGHT);
  const triggerPosition = offsetToPosition(offset, TRIGGER_WIDTH, TRIGGER_HEIGHT);
  const currentPosition = isOpen ? popupPosition : triggerPosition;

  // 4. Pointer Drag Handler (for Header or Minimized Trigger)
  const createPointerDownHandler = useCallback(
    (isTrigger: boolean) => (e: React.PointerEvent) => {
      // Only initiate dragging on primary button (left-click)
      if (e.button !== 0) return;

      // Do NOT start dragging if user clicked an interactive child in header
      const target = e.target as HTMLElement;
      if (!isTrigger && (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea'))) {
        return;
      }

      e.preventDefault();
      isDraggingRef.current = false;
      hasMovedPastThresholdRef.current = false;

      const currentWidth = isTrigger ? TRIGGER_WIDTH : POPUP_WIDTH;
      const currentHeight = isTrigger ? TRIGGER_HEIGHT : POPUP_HEIGHT;
      const startPos = isTrigger ? triggerPosition : popupPosition;

      dragStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startX: startPos.x,
        startY: startPos.y
      };

      const handlePointerMove = (moveEvt: PointerEvent) => {
        const deltaX = moveEvt.clientX - dragStartRef.current.pointerX;
        const deltaY = moveEvt.clientY - dragStartRef.current.pointerY;
        const distance = Math.hypot(deltaX, deltaY);

        if (!hasMovedPastThresholdRef.current && distance >= DRAG_THRESHOLD_PX) {
          hasMovedPastThresholdRef.current = true;
          isDraggingRef.current = true;
          setIsDragging(true);
        }

        if (isDraggingRef.current) {
          const newPos = {
            x: dragStartRef.current.startX + deltaX,
            y: dragStartRef.current.startY + deltaY
          };

          const newOffset = positionToOffset(newPos, currentWidth, currentHeight);
          setOffset(newOffset);
        }
      };

      const handlePointerUp = (upEvt: PointerEvent) => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
          window.removeEventListener('pointercancel', handlePointerUp);
        }

        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          setIsDragging(false);

          const deltaX = upEvt.clientX - dragStartRef.current.pointerX;
          const deltaY = upEvt.clientY - dragStartRef.current.pointerY;

          const finalPos = {
            x: dragStartRef.current.startX + deltaX,
            y: dragStartRef.current.startY + deltaY
          };

          const finalOffset = positionToOffset(finalPos, currentWidth, currentHeight);
          setOffset(finalOffset);
          saveOffset(finalOffset);
        } else {
          // Movement remained below threshold: treat as a regular click!
          if (isTrigger && onOpenTrigger) {
            onOpenTrigger();
          }
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
      }
    },
    [triggerPosition, popupPosition, saveOffset, onOpenTrigger]
  );

  const handleHeaderPointerDown = createPointerDownHandler(false);
  const handleTriggerPointerDown = createPointerDownHandler(true);

  return {
    position: currentPosition,
    triggerPosition,
    isDragging,
    handleHeaderPointerDown,
    handleTriggerPointerDown,
    setPosition: (newPos: Position) => {
      const newOffset = positionToOffset(newPos, width, height);
      setOffset(newOffset);
      saveOffset(newOffset);
    }
  };
}
