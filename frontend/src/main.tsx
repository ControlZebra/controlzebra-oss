import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PostHogProvider } from 'posthog-js/react';
import './index.css';
import 'react-photo-view/dist/react-photo-view.css';

// Register built-in viewers before app renders
// This must be imported early so viewers are available when components mount
import './lib/viewers-builtin';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: '2025-05-24',
        capture_exceptions: true, // This enables capturing exceptions using Error Tracking
        debug: import.meta.env.MODE === 'development',
      }}
    >
      <App />
    </PostHogProvider>
  </React.StrictMode>,
);