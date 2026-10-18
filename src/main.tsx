import './utils/fetchCompat';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { sanitizeAllBrowserStorage } from './utils/courierStorage';

// Sanitize any legacy credentials stored in browser storage immediately on application load
sanitizeAllBrowserStorage();

// Safely unregister any legacy/stale service workers to prevent cached preview/demo HTML
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch(() => {});
    }
  }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
