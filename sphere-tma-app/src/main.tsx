import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './skins/base/components.css';
import './skins/aethel/aethel.css';
import './skins/cypher/cypher.css';
import './skins/obsidian/obsidian.css';
import { initTelegramApp } from './lib/telegram.ts';
import { SkinProvider } from './contexts/SkinProvider.tsx';

// Initialize Telegram Mini App
initTelegramApp();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SkinProvider>
      <App />
    </SkinProvider>
  </React.StrictMode>
);
