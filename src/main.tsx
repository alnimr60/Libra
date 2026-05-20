import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SafeAreaProvider } from './components/SafeAreaProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <SafeAreaProvider>
    <App />
  </SafeAreaProvider>,
);
