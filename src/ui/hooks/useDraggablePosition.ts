import { useState, useEffect, useRef, useCallback } from 'react';

export interface Position {
  x: number;
  y: number;
}

export const POPUP_WIDTH = 410;
export const POPUP_HEIGHT = 620;
export const TRIGGER_WIDTH = 150;
export const TRIGGER_HEIGHT = 48;
export const VIEWPORT_PADDING = 16;
const STORAGE_KEY = 'gmail_assistant_position';

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
 * Returns default position (bottom-right of viewport).
 */
export function getDefaultPosition(
  width: number = POPUP_WIDTH,
  height: number = POPUP_HEIGHT,
  viewportWidth?: number,
  viewportHeight?: number
): Position {
  const innerW = viewportWidth ?? (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280);
  const innerH = viewportHeight ?? (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800);

  return clampPosition(
    {
      x: innerW - width - 24,
      y: innerH - height - 24
    },
    width,
    height,
    innerW,
    innerH
  );
}

export function useDraggablePosition(isOpen: boolean) {
  const [position, setPosition] = useState<Position>(() => getDefaultPosition(POPUP_WIDTH, POPUP_HEIGHT));
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number }>({
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0
  });

  const width = isOpen ? POPUP_WIDTH : TRIGGER_WIDTH;
  const height = isOpen ? POPUP_HEIGHT : TRIGGER_HEIGHT;

  // 1. Load saved position from chrome.storage.local on mount
  useEffect(() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          if (res && res[STORAGE_KEY]) {
            const saved = res[STORAGE_KEY] as Position;
            if (typeof saved.x === 'number' && typeof saved.y === 'number') {
              setPosition(clampPosition(saved, POPUP_WIDTH, POPUP_HEIGHT));
            }
          }
        });
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            setPosition(clampPosition(parsed, POPUP_WIDTH, POPUP_HEIGHT));
          }
        }
      }
    } catch (e) {
      console.warn('[useDraggablePosition] Load position failed:', e);
    }
  }, []);

  // 2. Persist position to chrome.storage.local
  const savePosition = useCallback((newPos: Position) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: newPos });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPos));
      }
    } catch (e) {
      console.warn('[useDraggablePosition] Save position failed:', e);
    }
  }, []);

  // 3. Handle browser resize and clamp back inside viewport
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => {
        const clamped = clampPosition(prev, width, height);
        if (clamped.x !== prev.x || clamped.y !== prev.y) {
          savePosition(clamped);
        }
        return clamped;
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [width, height, savePosition]);

  // 4. Pointer Drag Handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only initiate dragging on primary button (left-click)
      if (e.button !== 0) return;

      // Do NOT start dragging if user clicked an interactive child (e.g. button, input, link)
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea')) {
        return;
      }

      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);

      dragStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startX: position.x,
        startY: position.y
      };

      const handlePointerMove = (moveEvt: PointerEvent) => {
        if (!isDraggingRef.current) return;
        const deltaX = moveEvt.clientX - dragStartRef.current.pointerX;
        const deltaY = moveEvt.clientY - dragStartRef.current.pointerY;

        const newPos = {
          x: dragStartRef.current.startX + deltaX,
          y: dragStartRef.current.startY + deltaY
        };

        const clamped = clampPosition(newPos, width, height);
        setPosition(clamped);
      };

      const handlePointerUp = (upEvt: PointerEvent) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        setIsDragging(false);

        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
          window.removeEventListener('pointercancel', handlePointerUp);
        }

        const deltaX = upEvt.clientX - dragStartRef.current.pointerX;
        const deltaY = upEvt.clientY - dragStartRef.current.pointerY;

        const finalPos = clampPosition(
          {
            x: dragStartRef.current.startX + deltaX,
            y: dragStartRef.current.startY + deltaY
          },
          width,
          height
        );

        setPosition(finalPos);
        savePosition(finalPos);
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
      }
    },
    [position, width, height, savePosition]
  );

  // Trigger position when minimized is clamped to trigger dimensions
  const triggerPosition = clampPosition(position, TRIGGER_WIDTH, TRIGGER_HEIGHT);

  return {
    position,
    triggerPosition,
    isDragging,
    handlePointerDown,
    setPosition: (newPos: Position) => {
      const clamped = clampPosition(newPos, width, height);
      setPosition(clamped);
      savePosition(clamped);
    }
  };
}
