import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { SngxaiApp } from '../pages/sngxai/SngxaiApp';

createRoot(document.getElementById('root')!).render(<SngxaiApp />);
