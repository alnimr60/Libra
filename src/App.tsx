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
import { Home, Library as LibraryIcon, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useSafeArea } from './components/SafeAreaProvider';
import { Book } from './types';
import { translations } from './translations';

// Global error registry for debugging
const getDebugContext = () => {
  try {
    return {
      href: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      sessionTime: performance.now()
    };
  } catch (e) {
    return {};
  }
};

window.addEventListener('error', (event) => {
  console.error('[GlobalError]', {
    message: event.message,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error?.stack || event.error,
    context: getDebugContext()
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[GlobalPromiseRejection]', {
    reason: event.reason?.stack || event.reason,
    context: getDebugContext()
  });
});

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class PDFReaderErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ReactErrorBoundary] CRASH DETECTED', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      context: getDebugContext()
    });
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[1000] bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-serif text-white mb-2">Application Error</h2>
          <p className="text-zinc-500 text-sm font-mono max-w-md mb-8">
            An unexpected error occurred in the PDF reader. We've logged the technical details for analysis.
          </p>
          <div className="bg-zinc-900/50 p-4 rounded-xl border border-white/5 w-full max-w-lg mb-8 overflow-auto max-h-48 text-left">
            <pre className="text-[10px] font-mono text-orange-400 whitespace-pre-wrap">
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-white text-black rounded-full font-mono text-[10px] uppercase tracking-widest"
          >
            Refresh Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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

  // Prevent browser viewport pinch zoom and gestures
  React.useEffect(() => {
    // 1. Prevent iOS Safari gesture zoom
    const preventZoom = (e: any) => {
      if (e.scale && e.scale !== 1) {
        e.preventDefault();
      }
    };

    document.addEventListener('gesturestart', preventZoom, { passive: false });
    document.addEventListener('gesturechange', preventZoom, { passive: false });
    document.addEventListener('gestureend', preventZoom, { passive: false });

    // 2. Set touch-action on documentElement
    document.documentElement.style.touchAction = 'manipulation';

    return () => {
      document.removeEventListener('gesturestart', preventZoom);
      document.removeEventListener('gesturechange', preventZoom);
      document.removeEventListener('gestureend', preventZoom);
      document.documentElement.style.touchAction = '';
    };
  }, []);

  const activeBook = books.find(b => b.id === activeBookId);
  const currentBooks = books.filter(b => b.status === 'Currently Reading');

  const handleOpenBook = (book: Book) => {
    setActiveBookId(book.id);
  };

  return (
    <div 
      className={cn(
        "min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans transition-colors duration-200 flex flex-col",
        activeBookId ? "overflow-visible" : "overflow-hidden"
      )}
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
      <AnimatePresence mode="wait">
        {activeBook && (
          <PDFReaderErrorBoundary key={activeBook.id}>
            <PDFReader 
              book={activeBook}
              initialPage={activeBook.currentPage}
              updateBook={updateBook}
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
          </PDFReaderErrorBoundary>
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

