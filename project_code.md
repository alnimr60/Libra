# File: .env.example
`$lang
# GEMINI_API_KEY: Required for Gemini AI API calls.
# AI Studio automatically injects this at runtime from user secrets.
# Users configure this via the Secrets panel in the AI Studio UI.
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# APP_URL: The URL where this applet is hosted.
# AI Studio automatically injects this at runtime with the Cloud Run service URL.
# Used for self-referential links, OAuth callbacks, and API endpoints.
APP_URL="MY_APP_URL"

``n
# File: index.html
`$lang
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>My Google AI Studio App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>


``n
# File: metadata.json
`$lang
{
  "name": "My Personal Library",
  "description": "A refined, editorial-style library with immersive PDF reading, dynamic status tracking, and minimalist progress analytics.",
  "requestFramePermissions": [],
  "majorCapabilities": []
}

``n
# File: package.json
`$lang
{
  "name": "react-example",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "idb-keyval": "^6.2.2",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "pdfjs-dist": "^5.7.284",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "tailwind-merge": "^3.5.0",
    "vite": "^6.2.3"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "tsx": "^4.21.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.3"
  }
}

``n
# File: README.md
`$lang
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/acfa9cc2-ad07-45f0-85ec-b1f014eef681

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

``n
# File: tsconfig.json
`$lang
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}

``n
# File: vite.config.ts
`$lang
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyأ¢آ€آ”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

``n
# File: src\App.tsx
`$lang
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { usePersistence } from './hooks/usePersistence';
import Dashboard from './components/Dashboard';
import Library from './components/Library';
import Settings from './components/Settings';
import AddBookModal from './components/AddBookModal';
import PDFReader from './components/PDFReader';
import { Home, Library as LibraryIcon, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useSafeArea } from './components/SafeAreaProvider';
import { Book } from './types';
import { translations } from './translations';

type ActiveTab = 'home' | 'library' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const { 
    books, settings, goals, readingLogs, 
    addBook, updateBook, deleteBook, setSettings,
    addGoal, updateGoal, deleteGoal, logReading 
  } = usePersistence();
  const insets = useSafeArea();

  const isRTL = settings.language === 'ar';
  const t = translations[settings.language];

  const activeBook = books.find(b => b.id === activeBookId);
  const currentBooks = books.filter(b => b.status === 'Currently Reading');

  const handleOpenBook = (book: Book) => {
    setActiveBookId(book.id);
  };

  return (
    <div 
      className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans transition-colors duration-200 overflow-hidden flex flex-col"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Dynamic Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-40 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-200/40 dark:bg-orange-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-200/40 dark:bg-zinc-900/40 blur-[120px]" />
      </div>

      <main className="flex-1 relative z-10 overflow-auto pb-24 no-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full"
            >
              <Dashboard 
                books={currentBooks} 
                updateBook={updateBook} 
                onOpenBook={handleOpenBook}
                goals={goals}
                readingLogs={readingLogs}
                dashboardStyle={settings.dashboardStyle}
                language={settings.language}
                onAddGoal={addGoal}
                onDeleteGoal={deleteGoal}
                logReading={logReading}
              />
            </motion.div>
          )}
          {activeTab === 'library' && (
            <motion.div
              key="library"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full"
            >
              <Library 
                allBooks={books} 
                updateBook={updateBook} 
                deleteBook={deleteBook}
                onOpenBook={handleOpenBook}
                onAddClick={() => setIsAddModalOpen(true)}
                settings={settings}
              />
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full"
            >
              <Settings settings={settings} setSettings={setSettings} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Action Button - Removed per user request */}
      
      {/* Bottom Navigation */}
      <nav 
        style={{ 
          paddingBottom: `${insets.bottom + 12}px`,
          transform: activeBookId ? 'translateY(100%)' : 'translateY(0%)',
          opacity: activeBookId ? 0 : 1,
          pointerEvents: activeBookId ? 'none' : 'auto'
        }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-200 dark:border-white/5 px-6 py-4 flex justify-around items-center rounded-t-3xl transition-all duration-300 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05)]"
      >
        <NavButton
          active={activeTab === 'home'}
          onClick={() => setActiveTab('home')}
          icon={<Home className="w-5 h-5 transition-transform duration-500 group-hover:scale-110" />}
          label={t.today}
        />
        <NavButton
          active={activeTab === 'library'}
          onClick={() => setActiveTab('library')}
          icon={<LibraryIcon className="w-5 h-5 transition-transform duration-500 group-hover:scale-110" />}
          label={t.dashboard}
        />
        <NavButton
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={<SettingsIcon className="w-5 h-5 transition-transform duration-500 group-hover:scale-110" />}
          label={t.settings}
        />
      </nav>

      {/* Global Reader Overlay */}
      <AnimatePresence>
        {activeBook && (
          <PDFReader 
            book={activeBook}
            initialPage={activeBook.currentPage}
            onPageChange={(page) => {
              if (activeBook) {
                const diff = page - activeBook.currentPage;
                if (diff > 0) {
                  logReading(diff);
                }
              }
              updateBook({
                ...activeBook!,
                currentPage: page,
                lastReadAt: new Date().toISOString(),
              });
            }}
            onUpdateBookmarks={(bookmarks) => {
              updateBook({
                ...activeBook,
                bookmarks,
              });
            }}
            onClose={() => setActiveBookId(null)}
          />
        )}
      </AnimatePresence>

      <AddBookModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addBook}
        language={settings.language}
      />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1.5 transition-all duration-300",
        active ? "text-orange-600" : "text-zinc-400"
      )}
    >
      <div className="relative">
        {icon}
        {active && (
          <motion.div
            layoutId="nav-dot"
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"
          />
        )}
      </div>
      <span className="text-[9px] font-mono uppercase tracking-[0.2em] font-medium">{label}</span>
    </button>
  );
}


``n
# File: src\index.css
`$lang
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@200;300;400;500;700;800;900&display=swap');
@import "tailwindcss";

@layer utilities {
  .scrollbar-hide::-webkit-scrollbar,
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-hide,
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}

@theme {
  --font-sans: "Tajawal", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Tajawal", ui-serif, "Georgia", serif;
  --font-mono: "Tajawal", ui-monospace, SFMono-Regular, monospace;
}

@variant dark (&:is(.dark, .dark *));

@layer base {
  :root {
    /* Standard Safe Area variables for browsers that support them */
    --sat: env(safe-area-inset-top, 0px);
    --sab: env(safe-area-inset-bottom, 0px);
    --sal: env(safe-area-inset-left, 0px);
    --sar: env(safe-area-inset-right, 0px);
  }

  /* Support for mobile overflow-scrolling */
  * {
    -webkit-overflow-scrolling: touch;
  }
}

@layer base {
  [dir="rtl"] *:not(.textLayer *), 
  [dir="rtl"]:not(.textLayer) {
    letter-spacing: 0 !important;
    word-spacing: 0.1em;
    font-feature-settings: "kern" 1, "liga" 1;
    line-height: 1.6;
  }

  [dir="rtl"] .font-bold {
    font-weight: 800 !important;
  }
}

@utility pt-safe {
  padding-top: var(--msp-top);
}

@utility pb-safe {
  padding-bottom: var(--msp-bottom);
}

@utility mt-safe {
  margin-top: var(--msp-top);
}

@utility mb-safe {
  margin-bottom: var(--msp-bottom);
}

body {
  @apply antialiased transition-colors duration-200;
}

/* PDF Text Layer Selection Styling */
.textLayer {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  opacity: 1.0;
  line-height: 1 !important;
  text-indent: 0;
  user-select: text !important;
  -webkit-user-select: text !important;
  -webkit-touch-callout: text !important;
  pointer-events: none !important;
}

.textLayer span {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  pointer-events: auto !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  line-height: 1 !important;
}

::selection {
  background: rgba(59, 130, 246, 0.3) !important;
}

.textLayer ::selection {
  background: rgba(59, 130, 246, 0.4) !important;
}

/* Custom scrollbar for desktop */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(155, 155, 155, 0.2);
  border-radius: 20px;
  border: 1px solid transparent;
  background-clip: padding-box;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(155, 155, 155, 0.4);
}

``n
# File: src\main.tsx
`$lang
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

``n
# File: src\translations.ts
`$lang
export const translations = {
  en: {
    dashboard: "Library",
    today: "Today",
    goals: "Reading Echoes",
    addGoal: "Add Echo",
    settings: "Settings",
    appearance: "Vibe",
    darkMode: "Dark Mode",
    system: "System",
    dashboardStyle: "Library Path",
    linear: "The Reader's Path",
    circular: "The Infinite Shelf",
    notifications: "Echoes",
    language: "Language",
    english: "English",
    arabic: "ط§ظ„ط¹ط±ط¨ظٹط©",
    units: "Pages",
    logReading: "Record Progress",
    bookProgress: "Journey Status",
    completed: "Finished",
    continue: "Continue Reading",
    quotes: [
      "Continuity is the secret to mastery.",
      "A book is a dream that you hold in your hand.",
      "Reading is a conversation. All books talk. But a good book listens as well.",
      "A room without books is like a body without a soul.",
      "The more that you read, the more things you will know."
    ]
  },
  ar: {
    dashboard: "ط§ظ„ظ…ظƒطھط¨ط©",
    today: "ط§ظ„ظٹظˆظ…",
    goals: "ط£طµط¯ط§ط، ط§ظ„ظ‚ط±ط§ط،ط©",
    addGoal: "ط¥ط¶ط§ظپط© طµط¯ظ‰",
    settings: "ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ",
    appearance: "ط§ظ„ط£ط¬ظˆط§ط،",
    darkMode: "ط§ظ„ظˆط¶ط¹ ط§ظ„ظ„ظٹظ„ظٹ",
    system: "طھظ„ظ‚ط§ط¦ظٹ",
    dashboardStyle: "ظ…ط³ط§ط± ط§ظ„ظ…ظƒطھط¨ط©",
    linear: "ط¯ط±ط¨ ط§ظ„ظ‚ط§ط±ط¦",
    circular: "ط§ظ„ط±ظپ ط§ظ„ظ„ط§ظ…طھظ†ط§ظ‡ظٹ",
    notifications: "ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ",
    language: "ط§ظ„ظ„ط؛ط©",
    english: "English",
    arabic: "ط§ظ„ط¹ط±ط¨ظٹط©",
    units: "طµظپط­ط©",
    logReading: "طھط³ط¬ظٹظ„ ط§ظ„طھظ‚ط¯ظ…",
    bookProgress: "ط­ط§ظ„ط© ط§ظ„ط±ط­ظ„ط©",
    completed: "ظ…ظƒطھظ…ظ„",
    continue: "ظˆط§طµظ„ ط§ظ„ظ‚ط±ط§ط،ط©",
    quotes: [
      "ط§ظ„ط§ط³طھظ…ط±ط§ط±ظٹط© ظ‡ظٹ ط³ط± ط§ظ„ط¥طھظ‚ط§ظ†.",
      "ط§ظ„ظƒطھط§ط¨ ظ‡ظˆ ط­ظ„ظ… طھظ…ط³ظƒظ‡ ط¨ظٹط¯ظٹظƒ.",
      "ط§ظ„ظ‚ط±ط§ط،ط© ط­ظˆط§ط±. ظƒظ„ ط§ظ„ظƒطھط¨ طھطھط­ط¯ط«طŒ ظ„ظƒظ† ط§ظ„ظƒطھط§ط¨ ط§ظ„ط¬ظٹط¯ ظٹطµط؛ظٹ ط£ظٹط¶ط§ظ‹.",
      "ط¨ظٹطھ ط¨ظ„ط§ ظƒطھط¨ ظƒط¬ط³ط¯ ط¨ظ„ط§ ط±ظˆط­.",
      "ظƒظ„ظ…ط§ ظ‚ط±ط£طھ ط£ظƒط«ط±طŒ ط¹ط±ظپطھ ط£ظƒط«ط±."
    ]
  }
};

``n
# File: src\types.ts
`$lang
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReadingStatus = 'Currently Reading' | 'To-Be-Read' | 'Finished';

export interface Bookmark {
  id: string;
  page: number;
  label?: string;
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  totalPages: number;
  currentPage: number;
  deadline?: string; // ISO date string
  status: ReadingStatus;
  tags: string[];
  readingDirection: 'ltr' | 'rtl';
  coverUrl?: string; // Data URL or external link
  fileDataId?: string; // ID for IndexedDB storage
  bookmarks?: Bookmark[];
  addedAt: string; // ISO date string
  lastReadAt?: string; // ISO date string
}

export interface ReadingLog {
  date: string; // YYYY-MM-DD
  pagesRead: number;
}

export type GoalFrequency = 'daily' | 'weekly';

export interface ReadingGoal {
  id: string;
  target: number; // number of pages
  frequency: GoalFrequency;
  createdAt: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  notificationFrequency: 'once' | 'twice' | 'custom';
  customNotificationTimes: string[]; // ['09:00', '18:00', ...]
  dashboardStyle: 'linear' | 'circular';
  language: 'en' | 'ar';
}

export interface AppData {
  books: Book[];
  settings: AppSettings;
  goals: ReadingGoal[];
  readingLogs: ReadingLog[];
}

``n
# File: src\components\AddBookModal.tsx
`$lang
import React, { useState, useRef } from 'react';
import { Book, ReadingStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, CheckCircle, Loader2, Calendar as CalendarIcon, Tag, Book as BookIcon, Image as ImageIcon } from 'lucide-react';
import { extractPDFMetadata, extractPDFSampleText, detectDirectionFromText } from '../lib/pdf';
import { cn } from '../lib/utils';
import { set } from 'idb-keyval';

import { translations } from '../translations';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (book: Book) => void;
  language?: 'en' | 'ar';
}

export default function AddBookModal({ isOpen, onClose, onAdd, language = 'en' }: AddBookModalProps) {
  const isRTL = language === 'ar';
  const t = translations[language];
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Book>>({
    title: '',
    author: '',
    totalPages: 0,
    currentPage: 0,
    status: 'Currently Reading',
    tags: [],
    deadline: '',
    readingDirection: 'ltr',
  });
  const [tagInput, setTagInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
       alert('Please upload a PDF file.');
       return;
    }

    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const metadata = await extractPDFMetadata(file); 
      
      const fileId = `pdf_${crypto.randomUUID()}`;
      await set(fileId, arrayBuffer);

      // Auto-detect language via sampled text
      let sampleText = '';
      try {
        sampleText = await extractPDFSampleText(file);
      } catch (e) {
        console.warn("Failed to sample text for language detection", e);
      }
      const direction = detectDirectionFromText(sampleText);

      setFormData(prev => ({
        ...prev,
        title: prev.title || file.name.replace('.pdf', ''),
        totalPages: metadata.pageCount,
        coverUrl: metadata.coverUrl,
        fileDataId: fileId,
        readingDirection: direction
      }));
      setStep(2);
    } catch (error) {
      console.error('Failed to parse PDF:', error);
      alert('Error reading PDF. You can still enter details manually.');
      setStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, coverUrl: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddTag = () => {
    if (tagInput && !formData.tags?.includes(tagInput)) {
      setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput] }));
      setTagInput('');
    }
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.totalPages) {
      alert('Please enter at least Title and Total Pages.');
      return;
    }

    const newBook: Book = {
      id: crypto.randomUUID(),
      title: formData.title || 'Untitled',
      author: formData.author,
      totalPages: formData.totalPages || 0,
      currentPage: formData.currentPage || 0,
      status: formData.status || 'To-Be-Read',
      tags: formData.tags || [],
      readingDirection: formData.readingDirection || 'ltr',
      coverUrl: formData.coverUrl,
      fileDataId: formData.fileDataId,
      deadline: formData.deadline,
      addedAt: new Date().toISOString(),
    };

    onAdd(newBook);
    reset();
    onClose();
  };

  const reset = () => {
    setStep(1);
    setFormData({
      title: '',
      author: '',
      totalPages: 0,
      currentPage: 0,
      status: 'Currently Reading',
      tags: [],
      deadline: '',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-6 pt-[calc(1.5rem+var(--msp-top))] pb-[calc(1.5rem+var(--msp-bottom))]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-[#1A1614] w-full max-w-lg rounded-[32px] overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-8 py-6 flex justify-between items-center border-b border-black/5 dark:border-white/5" dir={isRTL ? "rtl" : "ltr"}>
          <h2 className={cn("text-xl font-serif", isRTL ? "font-bold" : "font-medium")}>
            {isRTL ? "ط¥ط¶ط§ظپط© ط¥ظ„ظ‰ ط§ظ„ظ…ظƒطھط¨ط©" : "Add to Library"}
          </h2>
          <button onClick={onClose} className={cn("p-2 opacity-50 hover:opacity-100", isRTL ? "-ml-2" : "-mr-2")}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1" dir={isRTL ? "rtl" : "ltr"}>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-8"
              >
                <div className="text-center space-y-2">
                  <p className={cn("text-sm opacity-60", isRTL && "font-bold")}>
                    {isRTL ? "ط§ط±ظپط¹ ظ…ظ„ظپ PDF ط£ظˆ ط£ط¯ط®ظ„ ط§ظ„ط¨ظٹط§ظ†ط§طھ ظٹط¯ظˆظٹط§ظ‹" : "Upload your PDF or manual details"}
                  </p>
                </div>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video border-2 border-dashed border-black/10 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileChange} />
                  {isLoading ? (
                    <Loader2 className="w-12 h-12 animate-spin opacity-40" />
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                        <Upload className="w-8 h-8" />
                      </div>
                      <span className={cn("text-sm font-medium", isRTL && "font-bold")}>
                        {isRTL ? "ط§ط³ط­ط¨ ط§ظ„ظ…ظ„ظپ ظ‡ظ†ط§ ط£ظˆ طھطµظپط­" : "Drop PDF here or Browse"}
                      </span>
                    </>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-black/5 dark:border-white/5"></div>
                  </div>
                  <div className={cn("relative flex justify-center text-xs uppercase tracking-widest opacity-30", isRTL && "tracking-normal")}>
                    <span className="bg-white dark:bg-[#1A1614] px-4">
                      {isRTL ? "ط£ظˆ ط§ط¨ط¯ط£ ظٹط¯ظˆظٹط§ظ‹" : "Or start manually"}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setStep(2)}
                  className={cn("w-full py-4 text-sm font-medium bg-black/5 dark:bg-white/5 rounded-2xl hover:bg-black/10 transition-colors", isRTL && "font-bold")}
                >
                  {isRTL ? "ط¥ط¯ط®ط§ظ„ ظٹط¯ظˆظٹ" : "Enter manual details"}
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Visual Preview */}
                <div className="flex gap-4 items-start">
                  <div 
                    onClick={() => coverInputRef.current?.click()}
                    className="group relative w-24 h-32 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden shadow-md flex-shrink-0 cursor-pointer"
                  >
                    <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={handleCoverChange} />
                    {formData.coverUrl ? (
                      <img src={formData.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center opacity-20">
                         <BookIcon className="w-10 h-10" />
                         <span className="text-[8px] mt-1 font-bold">ADD COVER</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ImageIcon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <InputGroup 
                      icon={<BookIcon className="w-4 h-4" />}
                      label={isRTL ? "ط¹ظ†ظˆط§ظ† ط§ظ„ظ…ط¬ظ„ط¯" : "Book Title"}
                      value={formData.title}
                      onChange={(val) => setFormData(p => ({ ...p, title: val }))}
                      placeholder={isRTL ? "ظ…ط«ط§ظ„: ظ…ظ‚ط¯ظ…ط© ط§ط¨ظ† ط®ظ„ط¯ظˆظ†" : "The Great Gatsby"}
                      isRTL={isRTL}
                    />
                    <InputGroup 
                      icon={<Tag className="w-4 h-4" />}
                      label={isRTL ? "ط§ظ„ظ…ط¤ظ„ظپ" : "Author"}
                      value={formData.author}
                      onChange={(val) => setFormData(p => ({ ...p, author: val }))}
                      placeholder={isRTL ? "ظ…ط«ط§ظ„: ط§ط¨ظ† ط®ظ„ط¯ظˆظ†" : "F. Scott Fitzgerald"}
                      isRTL={isRTL}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup 
                    label={isRTL ? "ط¹ط¯ط¯ ط§ظ„طµظپط­ط§طھ" : "Total Pages"}
                    type="number"
                    value={formData.totalPages}
                    onChange={(val) => setFormData(p => ({ ...p, totalPages: parseInt(val) || 0 }))}
                    isRTL={isRTL}
                  />
                  <div className="space-y-1.5 text-right">
                    <label className={cn("text-[10px] uppercase tracking-widest opacity-40 font-semibold", isRTL ? "mr-1" : "ml-1")}>
                      {isRTL ? "ط§ظ„ط­ط§ظ„ط©" : "Status"}
                    </label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData(p => ({ ...p, status: e.target.value as ReadingStatus }))}
                      className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 rounded-2xl text-sm focus:outline-none"
                    >
                      <option value="To-Be-Read">{isRTL ? 'ظ‚ط§ط¦ظ…ط© ط§ظ„ظ‚ط±ط§ط،ط©' : 'To-Be-Read'}</option>
                      <option value="Currently Reading">{isRTL ? 'ط£ظ‚ط±ط£ظ‡ ط§ظ„ط¢ظ†' : 'Reading'}</option>
                      <option value="Finished">{isRTL ? 'ظ…ظƒطھظ…ظ„' : 'Finished'}</option>
                    </select>
                  </div>
                </div>

                <InputGroup 
                  icon={<CalendarIcon className="w-4 h-4" />}
                  label={isRTL ? "ط§ظ„ظ…ظˆط¹ط¯ ط§ظ„ظ†ظ‡ط§ط¦ظٹ" : "Deadline"}
                  type="date"
                  value={formData.deadline}
                  onChange={(val) => setFormData(p => ({ ...p, deadline: val }))}
                  isRTL={isRTL}
                />

                <div className="space-y-1.5 text-right">
                  <label className={cn("text-[10px] uppercase tracking-widest opacity-40 font-semibold", isRTL ? "mr-1" : "ml-1")}>
                     {isRTL ? "ط§ظ„ظˆط³ظˆظ…" : "Tags"}
                  </label>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {formData.tags?.map(t => (
                      <span key={t} className="px-3 py-1 bg-black/5 dark:bg-white/5 rounded-lg text-xs flex items-center gap-1">
                        {t}
                        <button onClick={() => setFormData(p => ({ ...p, tags: p.tags?.filter(tag => tag !== t) }))}>
                          <X className="w-3 h-3 hover:text-red-400" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder={isRTL ? "ط£ط¶ظپ ظˆط³ظ… (ظ…ط«ط§ظ„: ط±ظˆط§ظٹط©)" : "Add tag (e.g. Fantasy)"}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      className={cn("flex-1 px-4 py-2 bg-black/5 dark:bg-white/5 rounded-xl text-sm focus:outline-none", isRTL && "text-right")}
                    />
                    <button onClick={handleAddTag} className="p-2 bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-xl">
                      <CheckCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setStep(1)}
                    className={cn("flex-1 py-4 text-sm font-medium border border-black/10 dark:border-white/10 rounded-2xl", isRTL && "font-bold")}
                  >
                    {isRTL ? "ط±ط¬ظˆط¹" : "Back"}
                  </button>
                  <button 
                    onClick={handleSubmit}
                    className={cn("flex-[2] py-4 text-sm font-medium bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-2xl shadow-xl hover:scale-[1.02] transition-transform", isRTL && "font-bold")}
                  >
                    {isRTL ? "ط¥طھظ…ط§ظ… ظˆط¥ط¶ط§ظپط© ط§ظ„ظƒطھط§ط¨" : "Finish & Add Book"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function InputGroup({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text', 
  icon,
  isRTL
}: { 
  label: string, 
  value: any, 
  onChange: (val: string) => void, 
  placeholder?: string, 
  type?: string,
  icon?: React.ReactNode,
  isRTL?: boolean
}) {
  return (
    <div className={cn("space-y-1.5 flex-1", isRTL ? "text-right" : "text-left")}>
      <label className={cn("text-[10px] uppercase tracking-widest opacity-40 font-semibold", isRTL ? "mr-1" : "ml-1")}>{label}</label>
      <div className="relative">
        {icon && <div className={cn("absolute top-1/2 -translate-y-1/2 opacity-30", isRTL ? "right-4" : "left-4")}>{icon}</div>}
        <input 
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full py-3 bg-black/5 dark:bg-white/5 rounded-2xl text-sm focus:outline-none",
            icon ? (isRTL ? "pr-11 pl-4 text-right" : "pl-11 pr-4") : "px-4",
            isRTL && !icon && "text-right"
          )}
        />
      </div>
    </div>
  );
}

``n
# File: src\components\BookCarousel.tsx
`$lang
import * as React from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, useMotionValue, useTransform, useSpring, animate, AnimatePresence } from 'motion/react';
import { Book } from '../types';
import { cn } from '../lib/utils';

interface BookCarouselProps {
  books: Book[];
  selectedIndex: number;
  onChange: (index: number) => void;
  onOpen?: (book: Book) => void;
  style?: 'linear' | 'circular';
  language?: 'en' | 'ar';
}

export default function BookCarousel({ books, selectedIndex, onChange, onOpen, style = 'linear', language = 'en' }: BookCarouselProps) {
  const isRTL = language === 'ar';
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const swipeDirection = useRef<'horizontal' | 'vertical' | null>(null);
  const lastVelocity = useRef(0);
  const baseIndex = useRef(selectedIndex);
  
  // The "source of truth" for the current position in the carousel
  const virtualIndex = useMotionValue(selectedIndex);
  // A spring to make the snapping motion smooth
  const smoothIndex = useSpring(virtualIndex, {
    stiffness: 260,
    damping: 32,
    mass: 0.5
  });

  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.offsetWidth);
    }
    
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cappedWidth = Math.min(1200, entry.contentRect.width);
        setWidth(cappedWidth);
      }
    });
    
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Helper for circular modulo that always returns a positive value
  const mod = (n: number, m: number) => ((n % m) + m) % m;

  // Helper to find the best distance to a target index on a circle, 
  // optionally respecting the direction of velocity to avoid "snap-back"
  const wrapShortest = (current: number, target: number, total: number, velocity: number = 0) => {
    const normCurrent = mod(current, total);
    const diff = (target - normCurrent) % total;
    let shortest = ((diff + total / 2) % total + total) % total - total / 2;
    
    // If we have significant velocity and it's pointing away from our "shortest" path,
    // we should go the long way around to preserve the feeling of momentum.
    // This prevents the carousel from reversing direction when we flick it hard.
    const VELOCITY_THRESHOLD = 0.5; 
    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      const vDir = velocity > 0 ? 1 : -1;
      const sDir = shortest > 0 ? 1 : -1;
      
      if (vDir !== sDir && Math.abs(shortest) > 0.1) {
        shortest += vDir * total;
      }
    }
    
    return shortest;
  };

  // Sync virtualIndex with prop changes (when user clicks dots or external buttons)
  useEffect(() => {
    if (!isDragging) {
      const currentV = virtualIndex.get();
      let target = selectedIndex;
      
      if (style === 'circular') {
        const delta = wrapShortest(currentV, selectedIndex, books.length, lastVelocity.current);
        target = currentV + delta;
      }

      // Only animate if we aren't already very close to the target
      if (Math.abs(currentV - target) > 0.001 || lastVelocity.current !== 0) {
        animate(virtualIndex, target, {
          type: 'spring',
          stiffness: 260,
          damping: 32,
          mass: 0.5,
          velocity: lastVelocity.current
        });
        // Reset velocity after handoff
        lastVelocity.current = 0;
      }
    }
  }, [selectedIndex, isDragging, virtualIndex, style, books.length]);

  const handlePanStart = () => {
    setIsDragging(true);
    isDraggingRef.current = true;
    swipeDirection.current = null;
    lastVelocity.current = 0;
    baseIndex.current = virtualIndex.get();
  };

  const handlePanEnd = (_: any, info: any) => {
    if (swipeDirection.current === 'vertical') {
      setIsDragging(false);
      isDraggingRef.current = false;
      swipeDirection.current = null;
      return;
    }

    const spacing = width * 0.35 || 100;
    const velocity = isRTL ? -info.velocity.x : info.velocity.x;
    
    // Project velocity into indices/s and invert (dragging right decreases index)
    // Capping results in more predictable behavior at extreme flick speeds
    const cappedVelocity = Math.max(-3000, Math.min(3000, velocity));
    const velocityInIndices = -cappedVelocity / spacing;
    
    // Calculate final index based on position and momentum projection
    const currentVal = virtualIndex.get();
    const projectionPower = 0.3; // Project 0.3 seconds ahead for snappier feel
    const predictedStop = currentVal + (velocityInIndices * projectionPower);
    
    // Snap to the nearest integer index
    let nextIndex = Math.round(predictedStop);
    
    // Directional bias: if we have a strong velocity but rounding would take us backward,
    // push it forward to avoid an awkward "snap back" against the flick direction.
    const vMag = Math.abs(velocityInIndices);
    if (vMag > 0.5) {
      const vDir = velocityInIndices > 0 ? 1 : -1;
      const roundingError = nextIndex - predictedStop; // if positive, we rounded UP
      const rDir = roundingError > 0 ? 1 : -1;
      
      if (vDir !== rDir && Math.abs(roundingError) > 0.2) {
        // e.g. velocity is positive (flick LEFT), but we rounded DOWN to nextIndex.
        // We should probably have rounded UP.
        nextIndex += vDir;
      }
    }

    if (style === 'linear') {
      nextIndex = Math.max(0, Math.min(books.length - 1, nextIndex));
    } else {
      // Circular: just ensure it's a valid integer (mod handled by onChange)
      nextIndex = Math.round(nextIndex);
    }
    
    setIsDragging(false);
    lastVelocity.current = velocityInIndices;

    // Keep ref true for a short duration to prevent accidental onTap triggers
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 150);

    // If index changed, notify parent
    const finalBookIndex = style === 'linear' ? nextIndex : mod(nextIndex, books.length);
    if (finalBookIndex !== selectedIndex) {
      onChange(finalBookIndex);
    } else {
      // If we didn't change the active book (or we are in circular and landed a full rotation away),
      // we still need to settle correctly from where we are.
      let target = nextIndex;
      if (style === 'circular') {
        target = currentVal + wrapShortest(currentVal, mod(nextIndex, books.length), books.length, velocityInIndices);
      }

      animate(virtualIndex, target, {
        type: 'spring',
        stiffness: 260,
        damping: 32,
        mass: 0.5,
        velocity: velocityInIndices
      });
      lastVelocity.current = 0;
    }
  };

  const handlePan = (_: any, info: any) => {
    if (!swipeDirection.current) {
      if (Math.abs(info.offset.y) > Math.abs(info.offset.x) + 10) {
        swipeDirection.current = 'vertical';
        return;
      } else if (Math.abs(info.offset.x) > 10) {
        swipeDirection.current = 'horizontal';
      }
    }

    if (swipeDirection.current === 'vertical') return;
    
    const spacing = width * 0.35 || 100;
    const dragProgress = (isRTL ? -info.offset.x : info.offset.x) / spacing;
    virtualIndex.set(baseIndex.current - dragProgress);
  };

  return (
    <div 
      ref={containerRef}
      dir="ltr"
      className="relative w-full h-full flex items-center justify-center overflow-visible perspective-[2000px] touch-pan-y"
    >
      {/* Interaction Layer */}
      <motion.div 
        className={cn(
          "absolute inset-0 z-50 cursor-grab active:cursor-grabbing touch-pan-y",
          isDragging && "cursor-grabbing"
        )}
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        onTap={(_, info) => {
          // If we just finished a drag/swipe, ignore this tap
          if (isDraggingRef.current) return;
          
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const clickX = info.point.x - rect.left;
          const center = rect.width / 2;
          const bookWidth = 100;
          
          const isLeftClick = clickX < center - bookWidth;
          const isRightClick = clickX > center + bookWidth;

          if (isRTL ? isRightClick : isLeftClick) {
            const prev = (selectedIndex - 1 + books.length) % books.length;
            if (style === 'linear') {
              if (selectedIndex > 0) onChange(selectedIndex - 1);
            } else {
              onChange(prev);
            }
          } else if (isRTL ? isLeftClick : isRightClick) {
            const next = (selectedIndex + 1) % books.length;
            if (style === 'linear') {
              if (selectedIndex < books.length - 1) onChange(selectedIndex + 1);
            } else {
              onChange(next);
            }
          } else {
            // Clicked active book
            if (onOpen && books[selectedIndex]) {
              onOpen(books[selectedIndex]);
            }
          }
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center preserve-3d pointer-events-none">
        {books.map((book, index) => (
          <CarouselBook 
            key={book.id} 
            book={book} 
            index={index} 
            virtualIndex={smoothIndex} 
            width={width}
            isActive={index === selectedIndex}
            isCircular={style === 'circular'}
            totalBooks={books.length}
            isRTL={isRTL}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselBook({ book, index, virtualIndex, width, isActive, isCircular, totalBooks, isRTL }: { 
  book: Book, 
  index: number, 
  virtualIndex: any, 
  width: number,
  isActive: boolean,
  isCircular: boolean,
  totalBooks: number,
  isRTL: boolean,
  key?: React.Key
}) {
  // Compute distance from current virtual focus
  const distance = useTransform(virtualIndex, (v: number) => {
    if (!isCircular) return index - v;
    
    // Shortest path on a circle (using mod helper logic)
    const diff = (index - v) % totalBooks;
    const wrapped = ((diff + totalBooks / 2) % totalBooks + totalBooks) % totalBooks - totalBooks / 2;
    return wrapped;
  });
  
  // Transform distance into visual properties
  const x = useTransform(distance, (d: number) => {
    const factor = isRTL ? -1 : 1;
    return d * (width * 0.35) * factor;
  });

  const z = useTransform(distance, (d: number) => -Math.abs(d) * 400 - (Math.abs(d) < 0.1 ? 0 : 60));

  const rotateY = useTransform(distance, (d: number) => {
    const factor = isRTL ? -1 : 1;
    return d * -22 * factor;
  });

  const opacity = useTransform(distance, (d: number) => {
    const absD = Math.abs(d);
    // Show up to 4 books on each side for a fuller dashboard feel
    if (absD > 4) return 0;
    if (absD > 3) return 0.3 * (4 - absD);
    if (absD > 2) return 0.5 * (3 - absD) + 0.3 * (absD - 2);
    if (absD > 1) return 0.8 * (2 - absD) + 0.5 * (absD - 1);
    return 1 * (1 - absD) + 0.8 * absD;
  });

  const scale = useTransform(distance, (d: number) => 1 - Math.abs(d) * 0.12);
  const zIndex = useTransform(distance, (d: number) => Math.round(100 - Math.abs(d) * 10));

  return (
    <motion.div
      style={{
        x,
        z,
        rotateY,
        opacity,
        scale,
        zIndex,
      }}
      className={cn(
        "absolute w-44 md:w-52 h-64 md:h-72 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] dark:shadow-[0_20px_50px_rgba(255,255,255,0.05)] overflow-hidden preserve-3d pointer-events-none transition-[filter,brightness,ring,box-shadow] duration-500",
        isActive ? "ring-1 ring-white/40" : "grayscale-[0.2] brightness-90"
      )}
    >
      {book.coverUrl ? (
        <img 
          src={book.coverUrl} 
          alt={book.title} 
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center p-6 text-center">
          <span className="text-white font-serif text-lg leading-tight uppercase tracking-widest">{book.title}</span>
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-black/20 pointer-events-none" />
    </motion.div>
  );
}


``n
# File: src\components\Dashboard.tsx
`$lang
import React, { useState, useMemo } from 'react';
import { Book, ReadingGoal, ReadingLog, GoalFrequency } from '../types';
import BookCarousel from './BookCarousel';
import { motion, AnimatePresence } from 'motion/react';
import { calculatePagesPerDay, getDaysRemaining, cn, getPagesReadToday, getPagesReadThisWeek } from '../lib/utils';
import { BookOpen, Calendar, Clock, Target, Plus, Trash2, Quote } from 'lucide-react';
import { useSafeArea } from './SafeAreaProvider';
import { translations } from '../translations';

interface DashboardProps {
  books: Book[];
  updateBook: (book: Book) => void;
  onOpenBook: (book: Book) => void;
  goals: ReadingGoal[];
  readingLogs: ReadingLog[];
  dashboardStyle: 'linear' | 'circular';
  language: 'en' | 'ar';
  onAddGoal: (goal: ReadingGoal) => void;
  onDeleteGoal: (id: string) => void;
  logReading: (pages: number) => void;
}

export default function Dashboard({ 
  books, 
  updateBook, 
  onOpenBook,
  goals,
  readingLogs,
  dashboardStyle,
  language = 'en',
  onAddGoal,
  onDeleteGoal,
  logReading
}: DashboardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [tempPage, setTempPage] = useState(0);
  const [isAddGoalModalOpen, setIsAddGoalModalOpen] = useState(false);
  const insets = useSafeArea();

  const isRTL = language === 'ar';
  const t = translations[language];

  // Pick a random quote on each "open/mount" of the dashboard
  const randomQuote = useMemo(() => {
    const q = t.quotes;
    return q[Math.floor(Math.random() * q.length)];
  }, [t.quotes]);

  const currentBook = books[currentIndex];

  const handleCarouselChange = (index: number) => {
    setCurrentIndex(index);
  };

  const handleUpdateProgress = (newPage: number) => {
    if (!currentBook) return;
    const diff = newPage - currentBook.currentPage;
    if (diff > 0) {
      logReading(diff);
    }
    updateBook({
      ...currentBook,
      currentPage: newPage,
      lastReadAt: new Date().toISOString(),
    });
    setIsUpdateModalOpen(false);
  };

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-10 text-center gap-6" dir={isRTL ? "rtl" : "ltr"}>
        <div className="w-24 h-24 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center animate-pulse">
           <BookOpen className="w-10 h-10 text-zinc-400 dark:text-zinc-600" />
        </div>
        <div>
          <h2 className={cn("text-2xl font-serif mb-3", isRTL ? "font-bold" : "font-medium")}>
            {isRTL ? "ظ…ظƒطھط¨طھظƒ ظپظٹ ط§ظ†طھط¸ط§ط±ظƒ" : "Your library is waiting"}
          </h2>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
            {isRTL ? "ط£ط¶ظپ ظƒطھط§ط¨ط§ظ‹ ظ„ط¨ط¯ط، ط§ظ„ظ…طھط§ط¨ط¹ط©" : "Add a book to start tracking"}
          </p>
        </div>
      </div>
    );
  }

  const ppd = currentBook ? calculatePagesPerDay(currentBook.totalPages, currentBook.currentPage, currentBook.deadline) : 0;
  const daysLeft = currentBook ? getDaysRemaining(currentBook.deadline) : 0;
  const progress = currentBook && currentBook.totalPages > 0 ? (currentBook.currentPage / currentBook.totalPages) * 100 : 0;

  return (
    <div 
      style={{ paddingTop: `${insets.top + 32}px` }}
      className="flex flex-col h-full overflow-hidden transition-colors duration-200"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="px-6 mb-8 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Quote className="w-4 h-4 text-orange-500 opacity-50" />
          <h1 className={cn("text-4xl font-serif tracking-tight", isRTL ? "font-bold" : "font-medium")}>{t.today}</h1>
        </div>
        <motion.p 
          key={randomQuote}
          initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-[11px] font-serif italic text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-[80%]"
        >
          "{randomQuote}"
        </motion.p>
      </div>

      <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar pb-10">
        {/* The Carousel */}
        <div className="h-[42vh] relative mb-4 flex-shrink-0">
          <BookCarousel 
            books={books} 
            selectedIndex={currentIndex} 
            onChange={handleCarouselChange} 
            onOpen={onOpenBook}
            style={dashboardStyle}
            language={language}
          />
        </div>

        {/* Book Info Panel */}
        <AnimatePresence>
          {currentBook && (
            <motion.div
              key={currentBook.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-6 space-y-8"
            >
              <div className="text-center max-w-sm mx-auto">
                <h2 className={cn("text-2xl font-serif leading-tight mb-1", isRTL ? "font-bold" : "font-medium")}>{currentBook.title}</h2>
                {currentBook.author && (
                  <p className={cn("text-xs font-mono uppercase tracking-widest text-zinc-400", isRTL && "font-bold")}>{currentBook.author}</p>
                )}
              </div>

              {/* Progress Summary */}
              <div className="flex flex-col items-center">
                <div className={cn("text-5xl font-serif tracking-tighter mb-2", isRTL ? "font-bold" : "font-medium")}>
                  {Math.round(progress)}%
                </div>
                <div className="w-48 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className={cn(
                      "absolute top-0 bottom-0 bg-orange-500 rounded-full",
                      isRTL ? "right-0" : "left-0"
                    )}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                <StatCard 
                  label={t.dashboard} 
                  value={`${ppd} ${t.units}/${isRTL ? "ظٹظˆظ…" : "day"}`} 
                  icon={<Clock className="w-3 h-3" />} 
                />
                <StatCard 
                  label={isRTL ? "ظ…طھط¨ظ‚ظ‰" : "Left"} 
                  value={`${daysLeft} ${isRTL ? "ط£ظٹط§ظ…" : "days"}`} 
                  icon={<Calendar className="w-3 h-3" />} 
                />
              </div>

              <div className="flex justify-center max-w-sm mx-auto w-full">
                <button
                  onClick={() => {
                    setTempPage(currentBook.currentPage);
                    setIsUpdateModalOpen(true);
                  }}
                  className="w-full py-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors active:scale-95"
                >
                  {t.logReading}
                </button>
              </div>

              {/* Goals Section */}
              <div className="pt-8 space-y-6 max-w-sm mx-auto">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400">{t.goals}</h3>
                  <button 
                    onClick={() => setIsAddGoalModalOpen(true)}
                    className="p-2 bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 rounded-full hover:scale-110 transition-transform active:scale-95"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  {(!goals || goals.length === 0) ? (
                    <div className="p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        {isRTL ? "ظ„ط§ طھظˆط¬ط¯ ط£ظ‡ط¯ط§ظپ ظ†ط´ط·ط©" : "No active goals"}
                      </p>
                    </div>
                  ) : (
                    goals.map(goal => (
                      <GoalCard 
                        key={goal.id} 
                        goal={goal} 
                        readingLogs={readingLogs || []} 
                        onDelete={() => onDeleteGoal(goal.id)}
                        language={language}
                      />
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Goal Modal */}
      <AddGoalModal 
        isOpen={isAddGoalModalOpen}
        onClose={() => setIsAddGoalModalOpen(false)}
        onAdd={onAddGoal}
        language={language}
      />

      {/* Progress Update Modal */}
      <AnimatePresence>
        {isUpdateModalOpen && currentBook && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUpdateModalOpen(false)}
              className="fixed inset-0 z-[500] bg-zinc-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[510] w-full bg-white dark:bg-zinc-900 rounded-t-[2.5rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
              style={{ paddingBottom: `${Math.max(insets.bottom, 16) + 32}px` }}
              dir={isRTL ? "rtl" : "ltr"}
            >
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-10" />
              
               <div className="mb-10 space-y-4">
                <div className="flex justify-between items-baseline mb-2">
                   <h3 className="text-2xl font-serif font-medium">
                    {isRTL ? "طھط­ط¯ظٹط« ط§ظ„ظ‚ط±ط§ط،ط©" : "Update Reading"}
                   </h3>
                   <span className="text-4xl font-serif text-orange-500">{tempPage}</span>
                </div>
                
                <div className="py-8">
                  <input 
                    type="range"
                    min="0"
                    max={currentBook.totalPages}
                    value={tempPage}
                    onChange={(e) => setTempPage(parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none accent-zinc-900 dark:accent-zinc-50 cursor-pointer"
                  />
                  <div className="flex justify-between mt-4 text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-400">
                    <span>{isRTL ? "ط§ظ„ط¨ط¯ط§ظٹط©" : "Start"}</span>
                    <span>{isRTL ? "ط§ظ„ظ†ظ‡ط§ظٹط©" : "End"} ({currentBook.totalPages})</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setTempPage(Math.min(currentBook.currentPage + ppd, currentBook.totalPages))}
                  className="py-5 px-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono uppercase tracking-widest active:scale-95 transition-transform"
                >
                  {isRTL ? "ط§ظ„ظ‡ط¯ظپ" : "Goal"} (+{ppd})
                </button>
                <button 
                  onClick={() => handleUpdateProgress(tempPage)}
                  className="py-5 px-4 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-[10px] font-mono uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                >
                  {isRTL ? "ط¥طھظ…ط§ظ…" : "Complete"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-[#141414]/5 dark:border-white/5">
      <div className="flex items-center gap-2 mb-1 opacity-40">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

interface GoalCardProps {
  goal: ReadingGoal;
  readingLogs: ReadingLog[];
  onDelete: () => void;
  language: 'en' | 'ar';
  key?: React.Key;
}

function GoalCard({ goal, readingLogs, onDelete, language }: GoalCardProps) {
  const isRTL = language === 'ar';
  const progress = goal.frequency === 'daily' 
    ? getPagesReadToday(readingLogs) 
    : getPagesReadThisWeek(readingLogs);
  
  const percentage = Math.min((progress / goal.target) * 100, 100);

  return (
    <div className="relative overflow-hidden bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md rounded-3xl p-5 border border-zinc-200 dark:border-white/5 group">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-3 h-3 text-orange-500" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              {isRTL 
                ? (goal.frequency === 'daily' ? "ظ‡ط¯ظپ ظٹظˆظ…ظٹ" : "ظ‡ط¯ظپ ط£ط³ط¨ظˆط¹ظٹ") 
                : `${goal.frequency} goal`}
            </span>
          </div>
          <div className="text-xl font-serif font-medium">{goal.target} {isRTL ? "طµظپط­ط©" : "Pages"}</div>
        </div>
        <button 
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-red-500 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-baseline text-[10px] font-mono uppercase tracking-widest">
          <span className="text-zinc-400">{isRTL ? "ط§ظ„طھظ‚ط¯ظ…" : "Progress"}</span>
          <span className="text-zinc-900 dark:text-zinc-50 font-bold">{progress} / {goal.target}</span>
        </div>
        <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className={cn(
              "absolute top-0 bottom-0 rounded-full transition-colors duration-500",
              isRTL ? "right-0" : "left-0",
              percentage === 100 ? "bg-green-500" : "bg-orange-500"
            )}
          />
        </div>
      </div>
    </div>
  );
}

function AddGoalModal({ isOpen, onClose, onAdd, language }: { isOpen: boolean, onClose: () => void, onAdd: (goal: ReadingGoal) => void, language: 'en' | 'ar' }) {
  const [target, setTarget] = useState(10);
  const [frequency, setFrequency] = useState<GoalFrequency>('daily');
  const isRTL = language === 'ar';

  const handleSubmit = () => {
    onAdd({
      id: Math.random().toString(36).substring(7),
      target,
      frequency,
      createdAt: new Date().toISOString()
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[600] bg-zinc-950/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="fixed inset-0 m-auto z-[610] w-[90%] max-w-sm h-fit bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl border border-zinc-200 dark:border-white/5"
            dir={isRTL ? "rtl" : "ltr"}
          >
            <h3 className={cn("text-2xl font-serif mb-8", isRTL ? "font-bold" : "font-medium")}>
              {isRTL ? "ظ‡ط¯ظپ ط¬ط¯ظٹط¯" : "New Goal"}
            </h3>
            
            <div className="space-y-8 mb-10">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-4 block">
                  {isRTL ? "ط¹ط¯ط¯ ط§ظ„طµظپط­ط§طھ ط§ظ„ظ…ط³طھظ‡ط¯ظپ" : "Target Pages"}
                </label>
                <div className="flex items-center justify-center gap-6">
                  <button 
                    onClick={() => setTarget(t => Math.max(1, t - 5))}
                    className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >-</button>
                  <span className="text-4xl font-serif">{target}</span>
                  <button 
                    onClick={() => setTarget(t => t + 5)}
                    className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >+</button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-4 block">
                  {isRTL ? "ط§ظ„طھظƒط±ط§ط±" : "Frequency"}
                </label>
                <div className="flex gap-2">
                  {(['daily', 'weekly'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFrequency(f)}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest border transition-all",
                        frequency === f 
                          ? "bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 border-transparent shadow-lg scale-105" 
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-400"
                      )}
                    >
                      {isRTL ? (f === 'daily' ? "ظٹظˆظ…ظٹ" : "ط£ط³ط¨ظˆط¹ظٹ") : f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="flex-1 py-4 text-[10px] font-mono uppercase tracking-widest text-zinc-400"
              >
                {isRTL ? "ط¥ظ„ط؛ط§ط،" : "Cancel"}
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-[2] py-4 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-[10px] font-mono uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
              >
                {isRTL ? "ط­ظپط¸ ط§ظ„ظ‡ط¯ظپ" : "Set Goal"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

``n
# File: src\components\Library.tsx
`$lang
import React, { useState, useMemo } from 'react';
import { Book, ReadingStatus, AppSettings } from '../types';
import { Search, Grid, List as ListIcon, Trash2, BookOpen, Clock, CheckCircle2, ChevronRight, X, Plus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useSafeArea } from './SafeAreaProvider';
import { translations } from '../translations';

interface LibraryProps {
  allBooks: Book[];
  updateBook: (book: Book) => void;
  deleteBook: (id: string) => void;
  onOpenBook: (book: Book) => void;
  onAddClick: () => void;
  settings: AppSettings;
}

export default function Library({ allBooks, updateBook, deleteBook, onOpenBook, onAddClick, settings }: LibraryProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReadingStatus | 'All'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', author: '', coverUrl: '', currentPage: 0, totalPages: 0 });
  const insets = useSafeArea();
  const t = translations[settings.language];
  const isRTL = settings.language === 'ar';

  const filteredBooks = useMemo(() => {
    return allBooks.filter(book => {
      const matchesSearch = 
        book.title.toLowerCase().includes(search.toLowerCase()) ||
        (book.author?.toLowerCase().includes(search.toLowerCase())) ||
        book.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
      
      const matchesStatus = filterStatus === 'All' || book.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });
  }, [allBooks, search, filterStatus]);

  const selectedBook = useMemo(() => 
    allBooks.find(b => b.id === selectedBookId), 
    [allBooks, selectedBookId]
  );

  const startEditing = () => {
    if (selectedBook) {
      setEditForm({
        title: selectedBook.title,
        author: selectedBook.author || '',
        coverUrl: selectedBook.coverUrl || '',
        currentPage: selectedBook.currentPage || 0,
        totalPages: selectedBook.totalPages || 0,
      });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (selectedBook) {
      updateBook({
        ...selectedBook,
        title: editForm.title || selectedBook.title,
        author: editForm.author,
        coverUrl: editForm.coverUrl,
        currentPage: Number(editForm.currentPage) || 0,
        totalPages: Number(editForm.totalPages) || 0,
      });
      setIsEditing(false);
    }
  };

  return (
    <div 
      style={{ paddingTop: `${insets.top + 32}px` }}
      className="px-6 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 transition-colors duration-200 overflow-hidden"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Header Section */}
      <header className="mb-10 space-y-6 flex-shrink-0">
        <div className="flex items-end justify-between">
          <div>
            <h1 className={cn("text-4xl font-serif tracking-tight text-zinc-900 dark:text-zinc-50", isRTL ? "font-bold" : "font-medium")}>{t.dashboard}</h1>
            <p className={cn("text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] mt-2", isRTL && "font-bold")}>
              {allBooks.length} {isRTL ? "ظ…ط¬ظ„ط¯ ظ…ط¬ظ…ظ‘ط¹" : "VOLUMES COLLECTED"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onAddClick}
              className="p-3 bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all outline-none"
            >
              <Plus className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1 bg-zinc-200/50 dark:bg-zinc-900/50 rounded-full p-1 border border-zinc-200 dark:border-zinc-800">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-full transition-all duration-300", 
                viewMode === 'grid' ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-full transition-all duration-300", 
                viewMode === 'list' ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

        {/* Minimal Search */}
        <div className="relative group">
          <Search className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-orange-500 transition-colors", isRTL ? "right-0" : "left-0")} />
          <input 
            type="text"
            placeholder={isRTL ? "ط§ط¨ط­ط« ظپظٹ ظ…ظƒطھط¨طھظƒ..." : "Search your collection..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn("w-full py-2 bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-orange-500 focus:outline-none text-sm transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700", isRTL ? "pr-7 pl-4 text-right" : "pl-7 pr-4 text-left")}
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-6 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
          {(['All', 'Currently Reading', 'To-Be-Read', 'Finished'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                "text-[10px] font-mono uppercase tracking-[0.2em] whitespace-nowrap transition-all relative pb-2",
                filterStatus === status 
                  ? "text-zinc-900 dark:text-zinc-100 font-bold" 
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
                isRTL && "font-bold tracking-normal"
              )}
            >
              {isRTL ? {
                'All': 'ط§ظ„ظƒظ„',
                'Currently Reading': 'ط£ظ‚ط±ط£ظ‡ ط§ظ„ط¢ظ†',
                'To-Be-Read': 'ظ‚ط§ط¦ظ…ط© ط§ظ„ظ‚ط±ط§ط،ط©',
                'Finished': 'ظ…ظƒطھظ…ظ„'
              }[status] : status}
              {filterStatus === status && (
                <motion.div 
                  layoutId="activeFilter"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500"
                />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Book Grid */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredBooks.length > 0 ? (
            <motion.div 
              layout
              className={cn(
                "grid gap-x-6 gap-y-10",
                viewMode === 'grid' ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-1"
              )}
            >
              {filteredBooks.map((book, idx) => (
                <BookLibraryItem 
                  key={book.id} 
                  book={book} 
                  viewMode={viewMode}
                  index={idx}
                  onClick={() => setSelectedBookId(book.id)}
                  isRTL={isRTL}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-12 h-12 rounded-full border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-zinc-300 dark:text-zinc-700" />
              </div>
              <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                {isRTL ? "ظ„ط§ طھظˆط¬ط¯ ظ†طھط§ط¦ط¬ ظ…ط·ط§ط¨ظ‚ط©" : "No volumes match your query"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Book Detail Sheet */}
      <AnimatePresence>
        {selectedBook && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedBookId(null);
                setIsEditing(false);
                setIsConfirmingDelete(false);
              }}
              className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[500]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-[2.5rem] z-[510] border-t border-zinc-200 dark:border-zinc-800 p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
              style={{ paddingBottom: `${Math.max(insets.bottom, 16) + 32}px` }}
              dir={isRTL ? "rtl" : "ltr"}
            >
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-8" />
              
              <div className="flex gap-8 mb-8">
                <div 
                  onClick={() => {
                    if (!isEditing) {
                      onOpenBook(selectedBook);
                      setSelectedBookId(null);
                    }
                  }}
                  className={cn(
                    "w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-xl border border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-100 dark:bg-zinc-800",
                    !isEditing && "cursor-pointer hover:scale-105 active:scale-95 transition-all"
                  )}
                >
                  {(isEditing ? editForm.coverUrl : selectedBook.coverUrl) ? (
                    <img src={isEditing ? editForm.coverUrl : selectedBook.coverUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2 text-center">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{isRTL ? "ظ„ط§ ظٹظˆط¬ط¯ ط؛ظ„ط§ظپ" : "No Cover"}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input 
                        type="text"
                        placeholder={isRTL ? "ط¹ظ†ظˆط§ظ† ط§ظ„ظ…ط¬ظ„ط¯" : "Volume Title"}
                        value={editForm.title}
                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-xl text-sm font-serif focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <input 
                        type="text"
                        placeholder={isRTL ? "ط§ظ„ظ…ط¤ظ„ظپ" : "Author"}
                        value={editForm.author}
                        onChange={(e) => setEditForm(prev => ({ ...prev, author: e.target.value }))}
                        className={cn("w-full bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500", isRTL && "text-right")}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder={isRTL ? "ط§ظ„طµظپط­ط© ط§ظ„ط­ط§ظ„ظٹط©" : "Current Page"}
                          value={editForm.currentPage || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, currentPage: parseInt(e.target.value) || 0 }))}
                          className={cn("w-full bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500", isRTL && "text-right")}
                        />
                        <span className="text-zinc-400 font-mono text-xs">/</span>
                        <input
                          type="number"
                          placeholder={isRTL ? "ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„طµظپط­ط§طھ" : "Total Pages"}
                          value={editForm.totalPages || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, totalPages: parseInt(e.target.value) || 0 }))}
                          className={cn("w-full bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500", isRTL && "text-right")}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className={cn("text-2xl font-serif text-zinc-900 dark:text-zinc-50 leading-tight mb-1", isRTL ? "font-bold" : "font-medium")}>{selectedBook.title}</h2>
                      <p className={cn("text-sm text-zinc-500 dark:text-zinc-400 mb-4", isRTL && "font-bold")}>{selectedBook.author || (isRTL ? "ظ…ط¤ظ„ظپ ظ…ط¬ظ‡ظˆظ„" : 'Unknown Author')}</p>
                    </>
                  )}
                  
                  <div className="flex items-center gap-3 mt-4">
                    {isEditing ? (
                      <>
                        <button 
                          onClick={handleSaveEdit}
                          className="flex-1 bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 py-3.5 px-6 rounded-2xl text-[10px] font-mono uppercase tracking-[0.2em] active:scale-95 transition-transform shadow-lg"
                        >
                          {isRTL ? "ط­ظپط¸" : "Save"}
                        </button>
                        <button 
                          onClick={() => setIsEditing(false)}
                          className="px-6 py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 active:scale-95 transition-all"
                        >
                          {isRTL ? "ط¥ظ„ط؛ط§ط،" : "Discard"}
                        </button>
                      </>
                    ) : (
                      <>
                    {isConfirmingDelete ? (
                      <div className="flex bg-red-600 rounded-2xl overflow-hidden flex-1 shadow-lg h-[52px]">
                        <button 
                          onClick={() => {
                            deleteBook(selectedBook.id);
                            setSelectedBookId(null);
                            setIsConfirmingDelete(false);
                          }}
                          className="flex-1 py-3 text-white text-[10px] font-mono uppercase tracking-[0.2em] font-bold hover:bg-red-700 transition-colors"
                        >
                          {isRTL ? "طھط£ظƒظٹط¯ ط§ظ„ط­ط°ظپ" : "Confirm Delete"}
                        </button>
                        <button 
                          onClick={() => setIsConfirmingDelete(false)}
                          className="px-6 py-3 bg-red-700 text-white hover:bg-red-800 transition-colors border-l border-red-500/30"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button 
                          onClick={startEditing}
                          className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 py-3.5 px-6 rounded-2xl text-[10px] font-mono uppercase tracking-[0.2em] active:scale-95 transition-transform"
                        >
                          {isRTL ? "طھط¹ط¯ظٹظ„" : "Edit"}
                        </button>
                        <button 
                          onClick={() => setIsConfirmingDelete(true)}
                          className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-red-500 active:scale-90 transition-transform"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-4">{isRTL ? "ط­ط§ظ„ط© ط§ظ„ظ‚ط±ط§ط،ط©" : "Reading Status"}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'To-Be-Read', icon: Clock, label: isRTL ? 'ط§ظ†طھط¸ط§ط±' : 'Queue' },
                      { id: 'Currently Reading', icon: BookOpen, label: isRTL ? 'ظ‚ط±ط§ط،ط©' : 'Reading' },
                      { id: 'Finished', icon: CheckCircle2, label: isRTL ? 'ظ…ظƒطھظ…ظ„' : 'Done' }
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          updateBook({ ...selectedBook, status: s.id as ReadingStatus });
                        }}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active:scale-95",
                          selectedBook.status === s.id 
                            ? "bg-orange-500/10 border-orange-500/20 text-orange-500" 
                            : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 text-zinc-400"
                        )}
                      >
                        <s.icon className="w-5 h-5" />
                        <span className="text-[10px] font-mono uppercase tracking-widest">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedBook.status === 'Currently Reading' && (
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                    <div className="flex justify-between items-baseline mb-2">
                      <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{isRTL ? "ط§ظ„طھظ‚ط¯ظ…" : "Progress"}</p>
                      <p className="text-sm font-serif">
                        {selectedBook.totalPages > 0 ? Math.round((selectedBook.currentPage / selectedBook.totalPages) * 100) : 0}%
                      </p>
                    </div>
                    <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden relative">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedBook.totalPages > 0 ? (selectedBook.currentPage / selectedBook.totalPages) * 100 : 0}%` }}
                        className={cn("absolute top-0 bottom-0 bg-orange-500", isRTL ? "right-0" : "left-0")}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function BookLibraryItem({ 
  book, 
  viewMode, 
  index,
  onClick,
  isRTL
}: { 
  book: Book, 
  viewMode: 'grid' | 'list',
  index: number,
  onClick: () => void,
  isRTL: boolean,
  key?: React.Key
}) {
  const progress = book.totalPages > 0 ? (book.currentPage / book.totalPages) * 100 : 0;

  if (viewMode === 'grid') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ delay: index * 0.05 }}
        className="group cursor-pointer"
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div 
          onClick={onClick}
          className="aspect-[2/3] rounded-2xl overflow-hidden shadow-sm border border-zinc-200/50 dark:border-white/5 mb-4 relative transition-transform duration-500 group-hover:-translate-y-2 group-hover:shadow-xl dark:shadow-none bg-zinc-100 dark:bg-zinc-900"
        >
          {book.coverUrl ? (
            <img 
              src={book.coverUrl} 
              draggable={false} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <span className="text-[8px] font-serif text-center uppercase tracking-[0.3em] opacity-30">{book.title}</span>
            </div>
          )}
          
          {progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5 dark:bg-white/5 relative">
              <div className={cn("h-full bg-orange-500 absolute top-0 bottom-0", isRTL ? "right-0" : "left-0")} style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />
        </div>
        
        <div className="space-y-1" onClick={onClick}>
          <h3 className={cn("text-sm font-serif leading-snug line-clamp-2 text-zinc-900 dark:text-zinc-50 group-hover:text-orange-600 transition-colors", isRTL ? "font-bold" : "font-medium")}>
            {book.title}
          </h3>
          <p className={cn("text-[11px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono truncate", isRTL && "font-bold")}>
            {book.author || (isRTL ? 'ظ…ط¤ظ„ظپ ظ…ط¬ظ‡ظˆظ„' : 'ANONYMOUS')}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group flex items-center gap-6 py-4 border-b border-zinc-100 dark:border-zinc-900 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="w-12 h-16 rounded-lg overflow-hidden shadow-sm flex-shrink-0 border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900" onClick={onClick}>
        {book.coverUrl ? (
          <img src={book.coverUrl} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-1">
             <span className="text-[4px] font-serif uppercase tracking-[0.1em] opacity-30 text-center">{book.title}</span>
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0" onClick={onClick}>
        <h3 className={cn("text-sm font-serif text-zinc-900 dark:text-zinc-50 truncate group-hover:text-orange-600 transition-colors", isRTL ? "text-right font-bold" : "text-left font-medium")}>{book.title}</h3>
        <p className={cn("text-[10px] text-zinc-400 dark:text-zinc-500 font-mono uppercase tracking-widest truncate", isRTL ? "text-right font-bold" : "text-left")}>{book.author || (isRTL ? 'ظ…ط¤ظ„ظپ ظ…ط¬ظ‡ظˆظ„' : 'ANONYMOUS')}</p>
      </div>

      <div className="flex items-center gap-8">
        {book.status === 'Currently Reading' && (
          <div className="hidden sm:flex flex-col items-end gap-1.5 min-w-[100px]" onClick={onClick}>
             <div className="w-24 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden relative">
               <div className={cn("h-full bg-orange-500 absolute top-0 bottom-0", isRTL ? "right-0" : "left-0")} style={{ width: `${progress}%` }} />
             </div>
             <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest">{Math.round(progress)}% {isRTL ? "ظ…ظƒطھظ…ظ„" : "COMPLETE"}</span>
          </div>
        )}
        <ChevronRight className={cn("w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-all", isRTL ? "rotate-180 group-hover:-translate-x-1" : "group-hover:translate-x-1")} onClick={onClick} />
      </div>
    </motion.div>
  );
}

``n
# File: src\components\PDFReader.tsx
`$lang
import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Maximize2, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2 } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';

interface PDFReaderProps {
  book: Book;
  initialPage: number;
  onPageChange: (page: number) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

export default function PDFReader({ book, initialPage, onPageChange, onUpdateBookmarks, onClose }: PDFReaderProps) {
  const fileDataId = book.fileDataId;
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const visualScale = useMotionValue(1.0);
  const smoothScale = useSpring(visualScale, {
    stiffness: 400,
    damping: 40,
    mass: 0.5
  });

  const [isLoading, setIsLoading] = useState(true);
  // Synchronize visualScale with scale state for control updates
  useEffect(() => {
    visualScale.set(scale);
  }, [scale]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(book.readingDirection || 'ltr');
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');
  const [pageIndex, setPageIndex] = useState(0); // 0-based for internal math
  const [isTemporal, setIsTemporal] = useState(false);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [navigatorTab, setNavigatorTab] = useState<'pages' | 'bookmarks'>('pages');

  const bookmarks = book.bookmarks || [];
  const currentPageNumber = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const isCurrentlyBookmarked = bookmarks.some(bm => bm.page === currentPageNumber);

  const toggleBookmark = () => {
    if (isCurrentlyBookmarked) {
      onUpdateBookmarks(bookmarks.filter(bm => bm.page !== currentPageNumber));
    } else {
      const newBookmark: Bookmark = {
        id: Math.random().toString(36).substr(2, 9),
        page: currentPageNumber,
        createdAt: new Date().toISOString()
      };
      onUpdateBookmarks([...bookmarks, newBookmark]);
    }
  };
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [renderScale, setRenderScale] = useState(scale);
  const [retryKey, setRetryKey] = useState(0);
  const isSelectingText = useRef(false);
  
  const handleReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const arrayBuffer = await file.arrayBuffer();
      // Use the existing fileDataId or generate a new one if somehow missing
      const fileId = fileDataId || `pdf_${crypto.randomUUID()}`;
      await set(fileId, arrayBuffer);
      
      if (!fileDataId) {
         // this is slightly tricky since it updates the book, we shouldn't really hit this
      }
      
      setRetryKey(k => k + 1);
    } catch (err: any) {
      console.error('Failed to save to local storage', err);
      alert('Could not save PDF. Please check your browser storage.');
      setIsLoading(false);
    }
  };
  
  // Double tap to zoom handler
  const lastTap = useRef<number>(0);
  const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    // Only handle double tap on the main viewport area, not on controls or text
    if ((e.target as HTMLElement).closest('button, input, .textLayer')) return;

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Toggle zoom
      const nextScale = scale > 1.2 ? 1.0 : 2.5;
      setScale(nextScale);
      // Also hide controls when zooming in to focus
      if (nextScale > 1.2) setShowControls(false);
    }
    lastTap.current = now;
  };
  
  const virtualPage = useMotionValue(pageIndex);
  const smoothPage = useSpring(virtualPage, {
    stiffness: 450,
    damping: 45,
    mass: 0.8
  });

  // Toggle direction manually
  const toggleDirection = () => {
    setDirection(prev => prev === 'ltr' ? 'rtl' : 'ltr');
  };

  // Keep virtualPage in sync with state
  useEffect(() => {
    if (!isDragging) {
      animate(virtualPage, pageIndex, {
        type: 'spring',
        stiffness: 450,
        damping: 45
      });
    }
  }, [pageIndex, isDragging, virtualPage]);

  const handlePanStart = (e: any) => {
    // Check if the user is clicking on text
    const target = e.target as HTMLElement;
    const isText = target.tagName.toLowerCase() === 'span' || target.closest('.textLayer');
    
    if (isText) {
      setIsDragging(false);
      return;
    }
    
    setIsDragging(true);
  };

  const handlePanMove = (_: any, info: any) => {
    if (!isDragging) return;

    // If zoomed in, we only allow swiping if it's a clear horizontal intent
    const currentScale = visualScale.get();
    if (currentScale > 1.3) {
      const isHorizontal = Math.abs(info.velocity.x) > Math.abs(info.velocity.y) * 2;
      const isFlick = Math.abs(info.velocity.x) > 600;
      if (!isHorizontal || !isFlick) return;
    }

    const scrollWidth = window.innerWidth;
    const progress = info.offset.x / scrollWidth;
    
    if (direction === 'rtl') {
      virtualPage.set(pageIndex + progress);
    } else {
      virtualPage.set(pageIndex - progress);
    }
  };

  const handlePanEnd = (_: any, info: any) => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    
    const currentScale = visualScale.get();
    // Adaptive thresholds based on scale
    const threshold = currentScale > 1.3 ? 100 : 50;
    const velocityThreshold = currentScale > 1.3 ? 800 : 500;
    
    let nextIndex = pageIndex;
    
    if (direction === 'rtl') {
      if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex + 1;
      else if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex - 1;
    } else {
      if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex + 1;
      else if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex - 1;
    }
    
    handlePageChange(Math.max(0, Math.min(nextIndex, totalSheets - 1)));
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setRenderScale(scale);
    }, 250); // Faster resolution settle
    return () => clearTimeout(timer);
  }, [scale]);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 600);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    if (isLandscape) {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowControls(true);
    }
  }, [isLandscape, pageIndex]);

  useEffect(() => {
    async function loadPDF() {
      try {
        setIsLoading(true);
        setError(null);
        if (!fileDataId) {
          throw new Error('No PDF file attached to this book. You can manually track your progress from the Library tab by editing the book details.');
        }
        
        const data = await get(fileDataId);
        
        if (!data) throw new Error('This book\'s PDF file could not be found in local storage. Try re-adding the book.');
        
    const loadingTask = pdfjs.getDocument({ 
      data: new Uint8Array(data),
      stopAtErrors: false,
      enableXfa: true,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
      disableRange: true,
      disableStream: true
    });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setDirection(book.readingDirection || 'ltr');

        // Set initial page index
        if (initialPage) {
          const mode = window.innerWidth > 1024 ? 'double' : 'single';
          setPageIndex(mode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1);
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error('PDFReader: Error loading PDF:', err);
        setError(err.message || 'Failed to load PDF');
        setIsLoading(false);
      }
    }
    loadPDF();
  }, [fileDataId, retryKey]);

  // Adjust viewMode based on screen size
  useEffect(() => {
    const handleResize = () => {
      setViewMode(window.innerWidth > 1024 ? 'double' : 'single');
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;
  
  const handlePageChange = (newIndex: number, isJump: boolean = false) => {
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    if (safeIndex === pageIndex) return;
    
    setPageIndex(safeIndex);
    
    if (typeof window !== 'undefined' && 'vibrate' in navigator && !isJump) {
      navigator.vibrate(10);
    }
    
    if (isJump) {
      setIsTemporal(true);
    } else if (!isTemporal) {
      // Auto update progress if not in temporal mode
      const displayPage = viewMode === 'double' ? (safeIndex * 2) + 1 : safeIndex + 1;
      onPageChange(Math.min(displayPage, numPages));
    }
  };

  const handleSyncProgress = () => {
    const displayPage = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
    onPageChange(Math.min(displayPage, numPages));
    setIsTemporal(false);
  };

  const currentDisplayPage = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const showSyncButton = isTemporal && Math.min(currentDisplayPage, numPages) !== book.currentPage;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handlePageChange(direction === 'ltr' ? pageIndex + 1 : pageIndex - 1);
      if (e.key === 'ArrowLeft') handlePageChange(direction === 'ltr' ? pageIndex - 1 : pageIndex + 1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pageIndex, totalSheets, direction, viewMode]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const touchStateRef = useRef({ initialDist: 0, initialScale: 1 });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-[300] bg-zinc-950 flex flex-col overflow-hidden transition-all duration-500",
        direction === 'rtl' ? "rtl" : "ltr"
      )}
    >
      <AnimatePresence>
        {isNavigatorOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-zinc-950/90 backdrop-blur-3xl flex items-center justify-center p-6 select-none"
            onClick={() => setIsNavigatorOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="w-full max-w-sm flex flex-col items-center gap-8 px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex bg-white/5 p-1 rounded-2xl w-full">
                <button 
                  onClick={() => setNavigatorTab('pages')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                    navigatorTab === 'pages' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                  )}
                >
                  Pages
                </button>
                <button 
                  onClick={() => setNavigatorTab('bookmarks')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                    navigatorTab === 'bookmarks' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                  )}
                >
                  Bookmarks
                  {bookmarks.length > 0 && (
                    <span className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center text-[8px]",
                      navigatorTab === 'bookmarks' ? "bg-black text-white" : "bg-white/20 text-white"
                    )}>
                      {bookmarks.length}
                    </span>
                  )}
                </button>
              </div>

              {navigatorTab === 'pages' ? (
                <div className="w-full flex flex-col items-center gap-12 py-4">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.6em] select-none">Navigation</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-9xl font-serif text-white tracking-tighter leading-none select-none">
                        {pageIndex + 1}
                      </span>
                      <span className="text-xl font-serif text-white/10 select-none">/ {totalSheets}</span>
                    </div>
                  </div>
                  
                  <div className="w-full space-y-6">
                    <input 
                      type="range"
                      min={0}
                      max={totalSheets - 1}
                      value={pageIndex}
                      onChange={(e) => handlePageChange(parseInt(e.target.value, 10), true)}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer hover:accent-orange-500 transition-colors"
                      dir={direction === 'rtl' ? 'rtl' : 'ltr'}
                    />
                    <div className="flex justify-between text-[8px] font-mono text-white/10 uppercase tracking-widest px-1">
                      <span>Start</span>
                      <span>End</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-h-[40vh] overflow-y-auto no-scrollbar py-2 space-y-2">
                  {bookmarks.length === 0 ? (
                    <div className="py-12 text-center">
                      <BookmarkIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                      <p className="text-xs text-white/20 font-mono uppercase tracking-widest leading-relaxed">
                        No bookmarks found<br/>in this volume.
                      </p>
                    </div>
                  ) : (
                    bookmarks
                      .sort((a, b) => a.page - b.page)
                      .map((bm) => (
                      <div 
                        key={bm.id}
                        className="group flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all"
                      >
                        <button 
                          onClick={() => {
                            const newIndex = viewMode === 'double' ? Math.floor((bm.page - 1) / 2) : bm.page - 1;
                            handlePageChange(newIndex, true);
                            setIsNavigatorOpen(false);
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-baseline gap-3">
                            <span className="text-3xl font-serif text-white tracking-tighter">P{bm.page}</span>
                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">
                              {new Date(bm.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </button>
                        <button 
                          onClick={() => onUpdateBookmarks(bookmarks.filter(b => b.id !== bm.id))}
                          className="p-2 text-white/10 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <button 
                onClick={() => setIsNavigatorOpen(false)}
                className="group p-8 rounded-full bg-white/5 border border-white/10 hover:bg-white hover:text-black transition-all active:scale-95 flex items-center justify-center shadow-2xl mt-4"
              >
                <Check className="w-8 h-8" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reader Controls Top */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -120 }}
            animate={{ y: 0 }}
            exit={{ y: -120 }}
            style={{ paddingTop: `${insets.top + (isLandscape ? 8 : 16)}px` }}
            className={cn(
              "fixed top-0 left-0 right-0 flex items-center justify-between gap-4 text-white/70 border-b border-white/5 bg-zinc-950/90 backdrop-blur-2xl z-[310] transition-all select-none",
              isLandscape ? "p-2 px-6 pb-2" : "p-4 pb-4"
            )}
          >
            <div className="flex items-center gap-2 md:gap-4 font-mono">
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-75">
                <X className={cn(isLandscape ? "w-5 h-5" : "w-6 h-6")} />
              </button>
              
              <button 
                onClick={toggleDirection}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all active:scale-95",
                  direction === 'rtl' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/5"
                )}
              >
                <Languages className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">{direction}</span>
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); setIsNavigatorOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 transition-all active:scale-95 group"
              >
                <div className="text-[10px] md:text-sm tracking-tighter font-mono">
                  <span className="text-white font-bold">
                    {viewMode === 'double' ? `${(pageIndex * 2) + 1}${ (pageIndex * 2) + 2 <= numPages ? '-' + ((pageIndex * 2) + 2) : '' }` : pageIndex + 1}
                  </span> 
                  <span className="opacity-20 mx-2">/</span> 
                  <span className="opacity-40">{numPages}</span>
                </div>
                <Navigation className="w-3 h-3 text-orange-500 opacity-40 group-hover:opacity-100 transition-opacity" />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); toggleBookmark(); }}
                className={cn(
                  "p-2.5 rounded-full border transition-all active:scale-75 shadow-lg",
                  isCurrentlyBookmarked 
                    ? "bg-orange-500 text-white border-orange-400" 
                    : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                )}
              >
                <BookmarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className={cn(
                "flex items-center gap-1 bg-white/5 rounded-full border border-white/10 shadow-lg pointer-events-auto",
                isLandscape ? "px-1 py-0.5" : "px-2 py-1"
              )}>
                <button 
                  onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.2, s - 0.2)); }} 
                  className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75 text-white/80"
                >
                  <Minus className={cn(isLandscape ? "w-3 h-3" : "w-4 h-4")} />
                </button>
                <div className="flex flex-col items-center min-w-[36px]">
                  <span className="text-[10px] font-mono font-bold leading-none text-center select-none text-white">{Math.round(scale * 100)}%</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.2)); }} 
                  className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75 text-white/80"
                >
                  <Plus className={cn(isLandscape ? "w-3 h-3" : "w-4 h-4")} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Viewport */}
      <div 
        ref={viewportRef}
        onClick={(e) => {
          // If text is selected, do not trigger page turn or click actions
          if (window.getSelection()?.toString().trim().length) {
            return;
          }

          if ((e.target as HTMLElement).closest('.textLayer')) return;

          handleDoubleTap(e);
          // If controls are shown, clicking hides them. If hidden, clicking might show them OR turn page.
          if (!showControls) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const width = rect.width;
            if (x < width * 0.25) {
              // Clicked left quarter
              handlePageChange(direction === 'ltr' ? pageIndex - 1 : pageIndex + 1);
              return;
            } else if (x > width * 0.75) {
              // Clicked right quarter
              handlePageChange(direction === 'ltr' ? pageIndex + 1 : pageIndex - 1);
              return;
            }
          }
          if (showControls) {
            setShowControls(false);
          } else {
            setShowControls(true);
          }
        }}
        className="flex-1 relative flex items-center justify-center bg-zinc-950/40 overflow-hidden"
        onTouchStart={(e) => {
          // TEMPORARILY DISABLED
        }}
        onTouchMove={(e) => {
          // TEMPORARILY DISABLED
        }}
        onTouchEnd={() => {
          // TEMPORARILY DISABLED
        }}
        style={{ touchAction: 'auto' }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 text-white/40">
            <Loader2 className="w-12 h-12 animate-spin" />
            <p className="text-sm font-mono uppercase tracking-widest">Optimizing View...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-6 py-20 text-center px-10">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
               <X className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <p className="text-white font-medium">Error Loading PDF</p>
              <p className="text-white/40 text-sm max-w-xs">{error}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="cursor-pointer px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-white text-sm transition-colors flex items-center justify-center">
                <span>Select PDF again</span>
                <input 
                  type="file" 
                  accept="application/pdf"
                  className="hidden" 
                  onChange={handleReupload}
                />
              </label>
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm transition-colors"
              >
                Close Reader
              </button>
            </div>
          </div>
        ) : (
          <motion.div 
            className="relative w-full h-full"
          onPanStart={handlePanStart}
          onPan={handlePanMove}
          onPanEnd={handlePanEnd}
          style={{ touchAction: 'auto' }}
        >
            {/* Windowed view of pages */}
            {Array.from({ length: 3 }, (_, i) => pageIndex - 1 + i).map(sheetIndex => {
              if (sheetIndex < 0 || sheetIndex >= totalSheets) return null;
              
              return (
                <ReaderSheet 
                  key={sheetIndex}
                  index={sheetIndex}
                  pdf={pdf!}
                  numPages={numPages}
                  viewMode={viewMode}
                  direction={direction}
                  virtualPage={smoothPage}
                  scale={smoothScale}
                  renderScale={renderScale}
                  isLandscape={isLandscape}
                  constraintsRef={viewportRef}
                  isSelectingText={isSelectingText}
                />
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Progress Footer */}
      <AnimatePresence>
        {showControls && !isLoading && !error && (
          <motion.div 
            initial={{ y: 120 }}
            animate={{ y: 0 }}
            exit={{ y: 120 }}
            style={{ paddingBottom: `${insets.bottom + (isLandscape ? 8 : 16)}px` }}
            className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-zinc-950/90 backdrop-blur-2xl shadow-2xl border-t border-white/5 z-[310] select-none"
          >
            <div className="max-w-2xl mx-auto flex items-center gap-6">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full relative overflow-hidden">
                <motion.div 
                  className="absolute inset-y-0 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                  animate={{ 
                    left: direction === 'rtl' ? "auto" : 0,
                    right: direction === 'rtl' ? 0 : "auto",
                    width: `${((pageIndex + 1) / totalSheets) * 100}%` 
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>

              <AnimatePresence>
                {showSyncButton && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: 20 }}
                    onClick={(e) => { e.stopPropagation(); handleSyncProgress(); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Sync to Page {currentDisplayPage}</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ReaderSheet({ 
  index, 
  pdf, 
  numPages, 
  viewMode, 
  direction, 
  virtualPage, 
  scale, 
  renderScale, 
  isLandscape,
  constraintsRef,
  isSelectingText
}: { 
  index: number, 
  pdf: pdfjs.PDFDocumentProxy, 
  numPages: number, 
  viewMode: 'single' | 'double',
  direction: 'ltr' | 'rtl',
  virtualPage: any,
  scale: any, // MotionValue
  renderScale: number,
  isLandscape: boolean,
  constraintsRef: React.RefObject<HTMLDivElement>,
  isSelectingText: React.RefObject<boolean>,
  key?: React.Key
}) {
  const distance = useTransform(virtualPage, (v: number) => index - v);
  
  // Calculate display width in pixels to pass to sub-components
  const [displayWidth, setDisplayWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      const vh = window.innerHeight / 100;
      const vw = window.innerWidth / 100;
      let w = 0;
      if (viewMode === 'double') {
        w = isLandscape ? (renderScale * 50) * 0.707 * vh : 45 * renderScale * vw;
      } else {
        w = isLandscape ? (renderScale * 100) * 0.707 * vh : 85 * renderScale * vw;
      }
      setDisplayWidth(w);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [renderScale, viewMode, isLandscape]);
  
  // Transform distance into horizontal position
  const x = useTransform(distance, (d: number) => {
    const multiplier = direction === 'rtl' ? -100 : 100;
    return `${d * multiplier}%`;
  });
  
  const zIndex = useTransform(distance, (d: number) => 10 - Math.abs(Math.round(d)));

  const rotateY = useTransform(distance, (d: number) => {
    const multiplier = direction === 'rtl' ? -10 : 10;
    return `${d * multiplier}deg`;
  });

  const scaleTransform = useTransform(distance, (d: number) => {
    return 1 - (Math.abs(d) * 0.05);
  });
  
  // Fast fade for non-visible sheets to save render cycles
  const opacity = useTransform(distance, [-1.5, -0.5, 0, 0.5, 1.5], [0, 0.5, 1, 0.5, 0]);
  const visibility = useTransform(distance, (d: number) => Math.abs(d) > 1.5 ? 'hidden' : 'visible');

  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  // Reset panning when zooming out
  useEffect(() => {
    if (renderScale <= 1.1) {
      panX.set(0);
      panY.set(0);
    }
  }, [renderScale, panX, panY]);

  return (
    <motion.div
      style={{ x, y: 0, opacity, visibility, zIndex, rotateY, scale: scaleTransform }}
      className={cn(
        "absolute inset-0 flex p-4 md:p-8 overflow-hidden",
        viewMode === 'double' ? "flex-row" : "flex-col",
        "items-center justify-center transform-gpu perspective-[1500px]"
      )}
    >
      <motion.div 
        style={{ scale, x: panX, y: panY }}
        drag={renderScale > 1.1}
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragMomentum={true}
        className={cn(
          "flex flex-shrink-0 gap-0 lg:gap-4 my-auto origin-center select-text",
          viewMode === 'double' ? "flex-row" : "flex-col",
          "mx-auto"
        )}
      >
        {viewMode === 'double' ? (
          <>
            {direction === 'rtl' ? (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} side="left" isLandscape={isLandscape} isSelectingText={isSelectingText} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} side="right" isLandscape={isLandscape} isSelectingText={isSelectingText} />
              </>
            ) : (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} side="left" isLandscape={isLandscape} isSelectingText={isSelectingText} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} side="right" isLandscape={isLandscape} isSelectingText={isSelectingText} />
              </>
            )}
          </>
        ) : (
          <div 
            className="flex-shrink-0 h-auto relative select-text"
            style={{ 
              width: displayWidth || 'auto',
              maxHeight: '90vh',
              transition: 'width 0.1s ease-out'
            }}
          >
            <PDFPage pageNumber={index + 1} pdf={pdf} targetWidth={displayWidth} isSelectingText={isSelectingText} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function SpreadPage({ pdf, pageNumber, numPages, width, side, isLandscape, isSelectingText }: { pdf: pdfjs.PDFDocumentProxy, pageNumber: number, numPages: number, width: number, side: 'left' | 'right', isLandscape?: boolean, isSelectingText: React.RefObject<boolean> }) {
  if (pageNumber > numPages) return <div className="flex-shrink-0 bg-white" style={{ width: width || 'auto', height: '100%', opacity: 0.1 }} />;
  
  return (
    <div 
      className={cn(
        "flex-shrink-0 h-auto relative flex items-center justify-center select-text",
        side === 'left' ? "rounded-l-sm" : "rounded-r-sm"
      )}
      style={{ 
        width: width || 'auto',
        transition: 'width 0.1s ease-out'
      }}
    >
      {/* Decorative center seam shadow */}
      <div className={cn(
        "absolute inset-y-0 w-8 z-10 pointer-events-none opacity-20",
        side === 'left' ? "right-0 bg-gradient-to-l from-black via-black/20 to-transparent" : "left-0 bg-gradient-to-r from-black via-black/20 to-transparent"
      )} />
      <PDFPage pageNumber={pageNumber} pdf={pdf} targetWidth={width} isSelectingText={isSelectingText} />
    </div>
  );
}

interface PDFPageProps {
  pageNumber: number;
  pdf: pdfjs.PDFDocumentProxy;
  targetWidth: number;
  isSelectingText: React.RefObject<boolean>;
}

const PDFPage: React.FC<PDFPageProps> = ({ pageNumber, pdf, targetWidth, isSelectingText }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerDivRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsRendering(true);
    setRenderError(false);

    const render = async () => {
      if (!canvasRef.current || !textLayerDivRef.current) return;

      try {
        const page = await pdf.getPage(pageNumber);
        if (!isMounted || !canvasRef.current) return;

        // 1. Use the explicitly passed target width or fallback safely
        const displayWidth = targetWidth || canvasRef.current.parentElement?.clientWidth || 500;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const displayScale = displayWidth / unscaledViewport.width;

        // 2. Canvas Rendering Viewport (High DPI for sharpness)
        const dpr = window.devicePixelRatio || 1;
        const canvasScale = displayScale * dpr;
        const canvasViewport = page.getViewport({ scale: canvasScale });

        // 3. Text Layer Viewport (1:1 with display size)
        const textViewport = page.getViewport({ scale: displayScale });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
          canvas.height = canvasViewport.height;
          canvas.width = canvasViewport.width;
          
          // CSS size ensures it fits the container
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${textViewport.height}px`;

          // Clear with white background explicitly
          context.fillStyle = 'white';
          context.fillRect(0, 0, canvas.width, canvas.height);

          if (textLayerDivRef.current) {
            textLayerDivRef.current.innerHTML = '';
            // Match the text layer container exactly to the display size
            textLayerDivRef.current.style.width = `${textViewport.width}px`;
            textLayerDivRef.current.style.height = `${textViewport.height}px`;
            // Remove any previous transforms
            textLayerDivRef.current.style.transform = 'none';
          }

          if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
          }

          renderTaskRef.current = page.render({
            canvasContext: context,
            viewport: canvasViewport,
            intent: 'display'
          } as any);
          
          await renderTaskRef.current.promise;

          try {
            if (textLayerDivRef.current && isMounted) {
              const textContent = await page.getTextContent();
              
              const textLayer = new pdfjs.TextLayer({
                textContentSource: textContent,
                container: textLayerDivRef.current,
                viewport: textViewport // Rendered at exact screen size
              });
              await textLayer.render();
            }
          } catch (textLayerErr) {
            console.warn("Text layer failed to render", textLayerErr);
          }

          // Force a micro-sync of the container size after render
          if (textLayerDivRef.current) {
            textLayerDivRef.current.style.width = `${textViewport.width}px`;
            textLayerDivRef.current.style.height = `${textViewport.height}px`;
          }

          if (isMounted) setIsRendering(false);
        }
      } catch (error: any) {
        if (error.name === 'RenderingCancelledException') return;
        console.error(`Error rendering page ${pageNumber}:`, error);
        if (isMounted) {
          setRenderError(true);
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdf, pageNumber, targetWidth]);

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden relative bg-white/5 select-text">
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/10 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-white/20" />
        </div>
      )}
      {renderError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500/50 p-4 text-center z-10">
          <X className="w-8 h-8 mb-2" />
          <p className="text-[10px] uppercase tracking-widest font-mono">Render Failed</p>
        </div>
      )}
      <div className="relative inline-block overflow-hidden mx-auto shadow-2xl bg-white">
        <canvas 
          ref={canvasRef} 
          className={cn(
            "block transition-opacity duration-300 pointer-events-none",
            isRendering ? "opacity-0" : "opacity-100"
          )}
          style={{ 
            WebkitTouchCallout: 'none' 
          }}
        />
        <div 
          ref={textLayerDivRef} 
          onPointerDown={(e) => {
            // Stop propagation to prevent motion from thinking this is a drag/pan
            e.stopPropagation();
            if (isSelectingText) (isSelectingText as any).current = true;
          }}
          onMouseDown={(e) => {
            // Backup for standard mouse events
            e.stopPropagation();
          }}
          onPointerUp={() => {
            if (isSelectingText) (isSelectingText as any).current = false;
          }}
          className={cn(
            "textLayer transition-opacity duration-300 pointer-events-auto absolute top-0 left-0",
            isRendering ? "opacity-0" : "opacity-100"
          )} 
          style={{ 
            zIndex: 100,
            WebkitUserSelect: 'text',
            userSelect: 'text',
            touchAction: 'auto',
          } as React.CSSProperties}
        />
      </div>
    </div>
  );
};

``n
# File: src\components\SafeAreaProvider.tsx
`$lang
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const SafeAreaContext = createContext<Insets>({ top: 0, bottom: 0, left: 0, right: 0 });

export const useSafeArea = () => useContext(SafeAreaContext);

export const SafeAreaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [insets, setInsets] = useState<Insets>({ top: 0, bottom: 0, left: 0, right: 0 });

  useEffect(() => {
    // Create a hidden element to measure safe area insets
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '0';
    div.style.left = '0';
    div.style.visibility = 'hidden';
    div.style.pointerEvents = 'none';
    div.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    div.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    div.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
    div.style.paddingRight = 'env(safe-area-inset-right, 0px)';
    document.body.appendChild(div);

    const updateInsets = () => {
      const style = window.getComputedStyle(div);
      const top = parseInt(style.paddingTop, 10) || 0;
      const bottom = parseInt(style.paddingBottom, 10) || 0;
      const left = parseInt(style.paddingLeft, 10) || 0;
      const right = parseInt(style.paddingRight, 10) || 0;

      // Smart Detection & Fallbacks
      // If we are on mobile and insets are reported as 0, we apply standard device fallbacks
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
      
      // Standard iPhone Notch height is ~44px. Android Status bar is ~24px.
      const fallbackTop = isMobile ? (top > 0 ? top : 44) : 0;
      const fallbackBottom = isMobile ? (bottom > 0 ? bottom : 20) : 0;

      setInsets({
        top: fallbackTop,
        bottom: fallbackBottom,
        left: left,
        right: right,
      });
    };

    updateInsets();
    window.addEventListener('resize', updateInsets);
    window.addEventListener('orientationchange', updateInsets);

    return () => {
      window.removeEventListener('resize', updateInsets);
      window.removeEventListener('orientationchange', updateInsets);
      document.body.removeChild(div);
    };
  }, []);

  return (
    <SafeAreaContext.Provider value={insets}>
      {children}
    </SafeAreaContext.Provider>
  );
};

``n
# File: src\components\Settings.tsx
`$lang
import React from 'react';
import { AppSettings } from '../types';
import { motion } from 'motion/react';
import { Moon, Sun, Bell, Clock, Info, ChevronRight, Monitor, Layout, RotateCw, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSafeArea } from './SafeAreaProvider';
import { translations } from '../translations';

interface SettingsProps {
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;
}

export default function Settings({ settings, setSettings }: SettingsProps) {
  const insets = useSafeArea();
  const t = translations[settings.language];
  const isRTL = settings.language === 'ar';

  return (
    <div 
      style={{ paddingTop: `${insets.top + 32}px` }}
      className="px-6 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 transition-colors duration-200"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="mb-10">
        <h1 className={cn("text-4xl font-serif tracking-tight", isRTL ? "font-bold" : "font-medium")}>{t.settings}</h1>
        <p className={cn("text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] mt-2", isRTL && "font-bold")}>
          {isRTL ? "طھط®طµظٹطµ ط¹ط§ظ„ظ…ظƒ" : "CONFIGURE YOUR UNIVERSE"}
        </p>
      </div>

      <div className="flex-1 space-y-10 overflow-y-auto no-scrollbar pb-10">
        {/* Language Section */}
        <section className="space-y-6">
          <SectionHeader title={t.language} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
            <SettingRow 
              icon={<Globe className="w-4 h-4" />}
              label="English"
              isActive={settings.language === 'en'}
              onClick={() => setSettings({ language: 'en' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<Globe className="w-4 h-4" />}
              label="ط§ظ„ط¹ط±ط¨ظٹط©"
              isActive={settings.language === 'ar'}
              onClick={() => setSettings({ language: 'ar' })}
              isRTL={isRTL}
            />
          </div>
        </section>

        {/* Appearance Section */}
        <section className="space-y-6">
          <SectionHeader title={t.appearance} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
            <SettingRow 
              icon={<Sun className="w-4 h-4" />}
              label={settings.language === 'ar' ? "ظ†ظ‡ط§ط±ظٹ" : "Solar"}
              isActive={settings.theme === 'light'}
              onClick={() => setSettings({ theme: 'light' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<Moon className="w-4 h-4" />}
              label={settings.language === 'ar' ? "ظ„ظٹظ„ظٹ" : "Lunar"}
              isActive={settings.theme === 'dark'}
              onClick={() => setSettings({ theme: 'dark' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<Monitor className="w-4 h-4" />}
              label={t.system}
              isActive={settings.theme === 'system'}
              onClick={() => setSettings({ theme: 'system' })}
              isRTL={isRTL}
            />
          </div>
        </section>

        {/* Dashboard Style Section */}
        <section className="space-y-6">
          <SectionHeader title={t.dashboardStyle} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
            <SettingRow 
              icon={<Layout className="w-4 h-4" />}
              label={t.linear}
              isActive={settings.dashboardStyle === 'linear'}
              onClick={() => setSettings({ dashboardStyle: 'linear' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<RotateCw className="w-4 h-4" />}
              label={t.circular}
              isActive={settings.dashboardStyle === 'circular'}
              onClick={() => setSettings({ dashboardStyle: 'circular' })}
              isRTL={isRTL}
            />
          </div>
        </section>

        {/* Notifications Section */}
        <section className="space-y-6">
          <SectionHeader title={t.notifications} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200 dark:border-zinc-800 space-y-8 shadow-sm">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-600">
                      <Bell className="w-5 h-5" />
                   </div>
                   <div>
                      <h4 className={cn("text-sm font-serif", isRTL ? "font-bold" : "font-medium")}>{isRTL ? "ط£ظ…ظ†ظٹط§طھ ظٹظˆظ…ظٹط©" : "Daily Nudges"}</h4>
                      <p className={cn("text-[10px] font-mono text-zinc-400 uppercase tracking-widest leading-loose", isRTL && "font-bold tracking-normal")}>
                        {isRTL ? "طھط°ظƒظٹط± ط¨ط§ظ„ط§ط³طھظ…ط±ط§ط±ظٹط©" : "Continuity reminders"}
                      </p>
                   </div>
                </div>
                <button 
                  onClick={() => setSettings({ notificationsEnabled: !settings.notificationsEnabled })}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-all duration-300",
                    settings.notificationsEnabled ? "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]" : "bg-zinc-200 dark:bg-zinc-800"
                  )}
                >
                  <motion.div 
                    animate={{ x: settings.notificationsEnabled ? (isRTL ? -26 : 26) : 2 }}
                    className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
             </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="space-y-6">
          <SectionHeader title={isRTL ? "ظ…ط¹ظ„ظˆظ…ط§طھ" : "Archive"} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
             <InfoRow icon={<Info className="w-4 h-4" />} label={isRTL ? "ط§ظ„ط¥طµط¯ط§ط±" : "Volume Version"} value="2.1.0-editorial" isRTL={isRTL} />
          </div>
        </section>

        <footer className="text-center space-y-2 opacity-20 pb-10">
          <p className="text-[8px] font-mono uppercase tracking-[0.4em]">
            {isRTL ? "طµظ…ظ… ط¨ط¹ظ†ط§ظٹط©" : "Designed with Intention"}
          </p>
        </footer>
      </div>
    </div>
  );
}

function SectionHeader({ title, isRTL }: { title: string, isRTL?: boolean }) {
  return (
    <h3 className={cn("text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-400", isRTL ? "mr-4" : "ml-4", isRTL && "font-bold tracking-normal")}>{title}</h3>
  );
}

function SettingRow({ icon, label, isActive, onClick, isRTL }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isRTL?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between p-4 rounded-[1.5rem] transition-all duration-300 group",
        isActive ? "bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 shadow-xl" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <div className={cn("flex items-center gap-4", isRTL ? "flex-row-reverse" : "flex-row")}>
        <div className={cn("transition-transform duration-500", isActive ? "scale-110" : "group-hover:rotate-12")}>
          {icon}
        </div>
        <span className={cn("text-sm font-serif", isRTL ? "font-bold" : "font-medium")}>{label}</span>
      </div>
      {isActive && (
        <motion.div layoutId="setting-active" className="w-1 h-1 bg-orange-500 rounded-full" />
      )}
    </button>
  );
}

function InfoRow({ icon, label, value, isRTL }: { icon: React.ReactNode, label: string, value?: string, isRTL?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between p-3", isRTL ? "flex-row-reverse" : "flex-row")}>
      <div className={cn("flex items-center gap-3", isRTL ? "flex-row-reverse" : "flex-row")}>
        <div className="p-2 bg-black/5 dark:bg-white/5 rounded-xl">
          {icon}
        </div>
        <span className={cn("text-sm", isRTL ? "font-bold" : "font-medium")}>{label}</span>
      </div>
      {value ? (
        <span className="text-xs opacity-50 font-mono tracking-normal">{value}</span>
      ) : (
        <ChevronRight className={cn("w-4 h-4 opacity-20", isRTL && "rotate-180")} />
      )}
    </div>
  );
}

``n
# File: src\hooks\usePersistence.ts
`$lang
import { useState, useEffect } from 'react';
import { Book, AppSettings, ReadingGoal, ReadingLog, AppData } from '../types';
import { del } from 'idb-keyval';

const STORAGE_KEY = 'my_personal_library_data';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  notificationsEnabled: true,
  notificationFrequency: 'once',
  customNotificationTimes: ['09:00'],
  dashboardStyle: 'linear',
  language: 'en',
};

export function usePersistence() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          books: (parsed.books || []).map((b: any) => ({
            ...b,
            readingDirection: b.readingDirection || 'ltr'
          })),
          goals: parsed.goals || [],
          readingLogs: parsed.readingLogs || [],
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        };
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
    return {
      books: [],
      settings: DEFAULT_SETTINGS,
      goals: [],
      readingLogs: [],
    };
  });

  // Apply theme whenever data.settings.theme changes
  useEffect(() => {
    const applyTheme = () => {
      const theme = data.settings.theme;
      const isDark = theme === 'dark' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (data.settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [data.settings.theme]);

  // Persist data whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const addBook = (book: Book) => {
    setData(prev => ({
      ...prev,
      books: [book, ...prev.books],
    }));
  };

  const updateBook = (updatedBook: Book) => {
    setData(prev => ({
      ...prev,
      books: prev.books.map(b => b.id === updatedBook.id ? updatedBook : b),
    }));
  };

  const deleteBook = (id: string) => {
    const bookToDelete = data.books.find(b => b.id === id);
    if (bookToDelete?.fileDataId) {
      del(bookToDelete.fileDataId).catch(console.error);
    }
    setData(prev => ({
      ...prev,
      books: prev.books.filter(b => b.id !== id),
    }));
  };

  const setSettings = (settings: Partial<AppSettings>) => {
    setData(prev => ({
      ...prev,
      settings: { ...prev.settings, ...settings },
    }));
  };

  const addGoal = (goal: ReadingGoal) => {
    setData(prev => ({
      ...prev,
      goals: [goal, ...prev.goals],
    }));
  };

  const updateGoal = (updatedGoal: ReadingGoal) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === updatedGoal.id ? updatedGoal : g),
    }));
  };

  const deleteGoal = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id),
    }));
  };

  const logReading = (pages: number) => {
    if (pages <= 0) return;
    const today = new Date().toISOString().split('T')[0];
    setData(prev => {
      const existingLogIndex = prev.readingLogs.findIndex(l => l.date === today);
      const newLogs = [...prev.readingLogs];
      if (existingLogIndex >= 0) {
        newLogs[existingLogIndex] = {
          ...newLogs[existingLogIndex],
          pagesRead: newLogs[existingLogIndex].pagesRead + pages,
        };
      } else {
        newLogs.push({ date: today, pagesRead: pages });
      }
      return { ...prev, readingLogs: newLogs };
    });
  };

  return {
    books: data.books,
    settings: data.settings,
    goals: data.goals,
    readingLogs: data.readingLogs,
    addBook,
    updateBook,
    deleteBook,
    setSettings,
    addGoal,
    updateGoal,
    deleteGoal,
    logReading,
  };
}

``n
# File: src\lib\pdf.ts
`$lang
import * as pdfjs from 'pdfjs-dist';

// Use Vite's URL import for the worker to ensure version matching and local serving
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// For PDF.js 5+, we must use matching versions for the main lib and the worker.
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export { pdfjs };
export interface PDFMetadata {
  pageCount: number;
  coverUrl?: string;
}

const version = pdfjs.version;

export async function extractPDFMetadata(file: File): Promise<PDFMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ 
    data: arrayBuffer,
    stopAtErrors: false,
    enableXfa: true,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${version}/cmaps/`,
    cMapPacked: true,
    disableRange: true,
    disableStream: true
  });
  const pdf = await loadingTask.promise;

  const metadata: PDFMetadata = {
    pageCount: pdf.numPages,
  };

  try {
    // Attempt to extract the first page as a cover
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (context) {
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
        // @ts-ignore
        canvas: canvas, 
      }).promise;

      metadata.coverUrl = canvas.toDataURL('image/jpeg', 0.8);
    }
  } catch (error) {
    console.error('Failed to extract PDF cover:', error);
  }

  return metadata;
}

export function detectDirectionFromText(text: string): 'ltr' | 'rtl' {
  if (!text) return 'ltr';
  // Strip out spaces, digits, and common punctuation for accurate character counting
  const cleanedText = text.replace(/[\s\d.,!?'"()[\]{}:;\-*_+=&^%$#@~`\\/|<>\u200e\u200f\u202a-\u202e]/g, '');
  if (cleanedText.length === 0) return 'ltr';

  // Arabic, Hebrew, Persian, Urdu unicode ranges
  const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  
  const rtlMatch = cleanedText.match(rtlRegex);
  const rtlCharsCount = rtlMatch ? rtlMatch.length : 0;
  
  // If more than 20% of the significant characters are RTL, classify it as RTL
  return (rtlCharsCount / cleanedText.length) > 0.2 ? 'rtl' : 'ltr';
}

export async function extractPDFSampleText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let sampleText = '';

  const pagesToSample = [1, Math.floor(pdf.numPages / 2), pdf.numPages];
  for (const pageNum of pagesToSample) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .substring(0, 500); // 500 chars per page
      sampleText += text + '\n';
    } catch (e) {
      console.warn(`Failed specifically to sample text from page ${pageNum}`);
    }
  }

  return sampleText.trim();
}

``n
# File: src\lib\utils.ts
`$lang
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ReadingLog } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculatePagesPerDay(totalPages: number, currentPage: number, deadlineStr?: string): number {
  if (!deadlineStr) return 0;
  
  const deadline = new Date(deadlineStr);
  const now = new Date();
  
  // Calculate difference in days
  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return totalPages - currentPage;
  
  const remainingPages = totalPages - currentPage;
  return Math.ceil(remainingPages / diffDays);
}

export function getDaysRemaining(deadlineStr?: string): number {
  if (!deadlineStr) return 0;
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function getPagesReadToday(logs: ReadingLog[]): number {
  const today = new Date().toISOString().split('T')[0];
  return logs.find(l => l.date === today)?.pagesRead || 0;
}

export function getPagesReadThisWeek(logs: ReadingLog[]): number {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  return logs.reduce((acc, log) => {
    const logDate = new Date(log.date);
    if (logDate >= startOfWeek) {
      return acc + log.pagesRead;
    }
    return acc;
  }, 0);
}

``n

