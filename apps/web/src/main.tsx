import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
import './content-calendar.css';
import './responsive.css';
import './enhancements.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
