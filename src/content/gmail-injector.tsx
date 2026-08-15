import { createRoot } from 'react-dom/client';
import { App } from '../ui/App';
import './styles.css';

console.log('[Gmail AI] Content script loaded');

const HOST_ELEMENT_ID = 'gmail-ai-assistant-host';

function initAssistant(): boolean {
  if (!document.body) {
    return false;
  }

  // Prevent duplicate injection
  if (document.getElementById(HOST_ELEMENT_ID)) {
    return true;
  }

  console.log('[Gmail AI] Injector initialized');

  const host = document.createElement('div');
  host.id = HOST_ELEMENT_ID;
  host.style.position = 'relative';
  host.style.zIndex = '999999';

  document.body.appendChild(host);

  // Attach Shadow Root for complete style isolation
  const shadowRoot = host.attachShadow({ mode: 'open' });
  console.log('[Gmail AI] Shadow root mounted');

  // Inject content.css stylesheet into Shadow Root
  const cssUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('content.css')
    : null;

  if (cssUrl) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    shadowRoot.appendChild(link);
  }

  // Create mount container inside Shadow Root
  const reactContainer = document.createElement('div');
  reactContainer.id = 'gmail-ai-assistant-root';
  shadowRoot.appendChild(reactContainer);

  const root = createRoot(reactContainer);
  root.render(<App />);

  return true;
}

// Observe and inject when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!initAssistant()) {
      const interval = setInterval(() => {
        if (initAssistant()) clearInterval(interval);
      }, 250);
    }
  });
} else {
  if (!initAssistant()) {
    const interval = setInterval(() => {
      if (initAssistant()) clearInterval(interval);
    }, 250);
  }
}
