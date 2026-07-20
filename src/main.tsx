import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root was not found');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
);
