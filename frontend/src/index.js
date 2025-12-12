import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Suppress MetaMask and other browser extension errors
window.addEventListener('error', (event) => {
  // Suppress MetaMask connection errors
  if (
    event.message?.includes('MetaMask') ||
    event.message?.includes('Failed to connect') ||
    event.filename?.includes('chrome-extension://') ||
    event.filename?.includes('moz-extension://')
  ) {
    event.preventDefault();
    return true;
  }
});

// Suppress unhandled promise rejections from extensions
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason?.message?.includes('MetaMask') ||
    event.reason?.message?.includes('Failed to connect') ||
    String(event.reason).includes('MetaMask')
  ) {
    event.preventDefault();
    return true;
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

