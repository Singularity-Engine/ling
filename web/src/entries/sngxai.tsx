import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { initAnalytics } from '../lib/analytics';
import { SngxaiApp } from '../pages/sngxai/SngxaiApp';

initAnalytics();
createRoot(document.getElementById('root')!).render(<SngxaiApp />);
