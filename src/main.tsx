// Suppress ResizeObserver loop limit exceeded error
const RESIZE_OBSERVER_ERROR_MESSAGE = 'ResizeObserver loop completed with undelivered notifications.';
const RESIZE_OBSERVER_ERROR_MESSAGE_ALT = 'ResizeObserver loop limit exceeded';

window.addEventListener('error', (e) => {
  if (e.message === RESIZE_OBSERVER_ERROR_MESSAGE || e.message === RESIZE_OBSERVER_ERROR_MESSAGE_ALT) {
    e.stopImmediatePropagation();
    if (e.preventDefault) e.preventDefault();
  }
}, true);

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SafeAreaProvider } from './components/SafeAreaProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <SafeAreaProvider>
    <App />
  </SafeAreaProvider>,
);