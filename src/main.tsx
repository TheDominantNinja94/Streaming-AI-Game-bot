import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { OBSOverlay } from './OBSOverlay.tsx';
import './index.css';

const path = window.location.pathname;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/obs' ? <OBSOverlay /> : <App />}
  </StrictMode>,
);
