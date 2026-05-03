import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SafeAreaProvider } from './components/SafeAreaProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  </StrictMode>,
);
