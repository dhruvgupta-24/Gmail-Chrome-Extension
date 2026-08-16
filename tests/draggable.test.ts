import { describe, it, expect } from 'vitest';
import {
  clampPosition,
  getDefaultPosition,
  POPUP_WIDTH,
  POPUP_HEIGHT,
  TRIGGER_WIDTH,
  TRIGGER_HEIGHT,
  VIEWPORT_PADDING
} from '../src/ui/hooks/useDraggablePosition';

describe('Draggable Positioning & Viewport Clamping System', () => {
  const VIEWPORT_W = 1920;
  const VIEWPORT_H = 1080;

  it('TEST 1 & 2: Allows custom position anywhere within the viewport', () => {
    // Center position
    const centerPos = clampPosition({ x: 755, y: 230 }, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(centerPos.x).toBe(755);
    expect(centerPos.y).toBe(230);

    // Top-left position
    const topLeft = clampPosition({ x: 20, y: 20 }, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(topLeft.x).toBe(20);
    expect(topLeft.y).toBe(20);

    // Bottom-left position
    const bottomLeft = clampPosition({ x: 20, y: 400 }, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(bottomLeft.x).toBe(20);
    expect(bottomLeft.y).toBe(400);
  });

  it('TEST 5: Clamps position when dragged outside left or top boundaries', () => {
    const outLeftTop = clampPosition({ x: -200, y: -500 }, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(outLeftTop.x).toBe(VIEWPORT_PADDING);
    expect(outLeftTop.y).toBe(VIEWPORT_PADDING);
  });

  it('TEST 5: Clamps position when dragged outside right or bottom boundaries', () => {
    const outRightBottom = clampPosition({ x: 3000, y: 4000 }, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    const expectedMaxX = VIEWPORT_W - POPUP_WIDTH - VIEWPORT_PADDING;
    const expectedMaxY = VIEWPORT_H - POPUP_HEIGHT - VIEWPORT_PADDING;

    expect(outRightBottom.x).toBe(expectedMaxX);
    expect(outRightBottom.y).toBe(expectedMaxY);
  });

  it('TEST 3: Calculates correct trigger position when minimized', () => {
    const triggerPos = clampPosition({ x: 50, y: 50 }, TRIGGER_WIDTH, TRIGGER_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(triggerPos.x).toBe(50);
    expect(triggerPos.y).toBe(50);

    const triggerOutBottom = clampPosition({ x: 1900, y: 1050 }, TRIGGER_WIDTH, TRIGGER_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(triggerOutBottom.x).toBe(VIEWPORT_W - TRIGGER_WIDTH - VIEWPORT_PADDING);
    expect(triggerOutBottom.y).toBe(VIEWPORT_H - TRIGGER_HEIGHT - VIEWPORT_PADDING);
  });

  it('TEST 6: Re-clamps position when browser window is resized to smaller dimensions', () => {
    // Position saved when window was 1920x1080 at bottom-right (x: 1494, y: 444)
    const savedPos = { x: 1494, y: 444 };

    // Resize window down to 1024x768
    const reclamped = clampPosition(savedPos, POPUP_WIDTH, POPUP_HEIGHT, 1024, 768);

    expect(reclamped.x).toBe(1024 - POPUP_WIDTH - VIEWPORT_PADDING);
    expect(reclamped.y).toBe(768 - POPUP_HEIGHT - VIEWPORT_PADDING);
  });

  it('calculates default position cleanly at bottom-right with margin', () => {
    const def = getDefaultPosition(POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(def.x).toBe(VIEWPORT_W - POPUP_WIDTH - 24);
    expect(def.y).toBe(VIEWPORT_H - POPUP_HEIGHT - 24);
  });
});
