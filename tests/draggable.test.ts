import { describe, it, expect } from 'vitest';
import {
  clampPosition,
  getDefaultPosition,
  offsetToPosition,
  positionToOffset,
  POPUP_WIDTH,
  POPUP_HEIGHT,
  TRIGGER_WIDTH,
  TRIGGER_HEIGHT,
  VIEWPORT_PADDING,
  DRAG_THRESHOLD_PX
} from '../src/ui/hooks/useDraggablePosition';

describe('Draggable Positioning & Viewport Clamping System', () => {
  const VIEWPORT_W = 1920;
  const VIEWPORT_H = 1080;

  it('INITIAL LAUNCHER POSITION: Minimized trigger initializes at bottom-right corner', () => {
    const triggerPos = offsetToPosition({ right: 24, bottom: 24 }, TRIGGER_WIDTH, TRIGGER_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(triggerPos.x).toBe(VIEWPORT_W - TRIGGER_WIDTH - 24);
    expect(triggerPos.y).toBe(VIEWPORT_H - TRIGGER_HEIGHT - 24);

    // On 800px window height, trigger must be at y=728px (bottom), NEVER at y=156px (middle/top)
    const smallScreenTrigger = offsetToPosition({ right: 24, bottom: 24 }, TRIGGER_WIDTH, TRIGGER_HEIGHT, 1280, 800);
    expect(smallScreenTrigger.x).toBe(1280 - TRIGGER_WIDTH - 24);
    expect(smallScreenTrigger.y).toBe(800 - TRIGGER_HEIGHT - 24);
    expect(smallScreenTrigger.y).toBe(728);

    // Roundtrip conversion
    const backToOffset = positionToOffset(smallScreenTrigger, TRIGGER_WIDTH, TRIGGER_HEIGHT, 1280, 800);
    expect(backToOffset.right).toBe(24);
    expect(backToOffset.bottom).toBe(24);
  });

  it('EXPANDED POPUP POSITION: Popup initializes at bottom-right corner', () => {
    const popupPos = offsetToPosition({ right: 24, bottom: 24 }, POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(popupPos.x).toBe(VIEWPORT_W - POPUP_WIDTH - 24);
    expect(popupPos.y).toBe(VIEWPORT_H - POPUP_HEIGHT - 24);
  });

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

  it('TEST 6: Re-clamps position when browser window is resized to smaller dimensions', () => {
    const savedPos = { x: 1494, y: 444 };
    const reclamped = clampPosition(savedPos, POPUP_WIDTH, POPUP_HEIGHT, 1024, 768);

    expect(reclamped.x).toBe(1024 - POPUP_WIDTH - VIEWPORT_PADDING);
    expect(reclamped.y).toBe(768 - POPUP_HEIGHT - VIEWPORT_PADDING);
  });

  it('calculates default position cleanly at bottom-right with margin', () => {
    const def = getDefaultPosition(POPUP_WIDTH, POPUP_HEIGHT, VIEWPORT_W, VIEWPORT_H);
    expect(def.x).toBe(VIEWPORT_W - POPUP_WIDTH - 24);
    expect(def.y).toBe(VIEWPORT_H - POPUP_HEIGHT - 24);
  });

  it('defines drag threshold for click vs drag separation', () => {
    expect(DRAG_THRESHOLD_PX).toBe(6);
    const smallMovement = Math.hypot(2, 3); // 3.6px < 6px (click)
    expect(smallMovement < DRAG_THRESHOLD_PX).toBe(true);

    const dragMovement = Math.hypot(10, 15); // 18px >= 6px (drag)
    expect(dragMovement >= DRAG_THRESHOLD_PX).toBe(true);
  });
});
