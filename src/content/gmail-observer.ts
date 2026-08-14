/**
 * Observes Gmail DOM mutations, hash changes, and theme modes.
 */

export function isGmailDarkMode(): boolean {
  // Gmail dark mode usually sets dark background on body or specific container
  const bg = window.getComputedStyle(document.body).backgroundColor;
  if (bg) {
    const rgb = bg.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const brightness = (parseInt(rgb[0], 10) * 299 + parseInt(rgb[1], 10) * 587 + parseInt(rgb[2], 10) * 114) / 1000;
      return brightness < 128;
    }
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function observeGmailHashChanges(callback: (newHash: string) => void): () => void {
  const handler = () => callback(window.location.hash);
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}
