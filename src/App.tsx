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
import { Home, Library as LibraryIcon, Settings as SettingsIcon, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useSafeArea } from './components/SafeAreaProvider';
import { Book } from './types';

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

  const activeBook = books.find(b => b.id === activeBookId);
  const currentBooks = books.filter(b => b.status === 'Currently Reading');

  const handleOpenBook = (book: Book) => {
    setActiveBookId(book.id);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans transition-colors duration-500 overflow-hidden flex flex-col">
      {/* Dynamic Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-40 overflow-hidden">
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
        className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-200 dark:border-white/5 px-6 py-4 flex justify-around items-center rounded-t-3xl transition-all duration-500 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05)]"
      >
        <NavButton
          active={activeTab === 'home'}
          onClick={() => setActiveTab('home')}
          icon={<Home className="w-5 h-5 transition-transform duration-500 group-hover:scale-110" />}
          label="Home"
        />
        <NavButton
          active={activeTab === 'library'}
          onClick={() => setActiveTab('library')}
          icon={<LibraryIcon className="w-5 h-5 transition-transform duration-500 group-hover:scale-110" />}
          label="Library"
        />
        <NavButton
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={<SettingsIcon className="w-5 h-5 transition-transform duration-500 group-hover:scale-110" />}
          label="Settings"
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
      />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1.5 transition-all duration-500",
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

