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
import { Home, Library as LibraryIcon, Settings as SettingsIcon, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

type ActiveTab = 'home' | 'library' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { books, settings, addBook, updateBook, deleteBook, setSettings } = usePersistence();

  const currentBooks = books.filter(b => b.status === 'Currently Reading');

  return (
    <div className="min-h-screen bg-[#F5F2ED] dark:bg-[#0A0502] text-[#1A1A1A] dark:text-[#E0D8D0] font-sans transition-colors duration-300 overflow-hidden flex flex-col">
      {/* Dynamic Background Atmosphere (Recipe 7) */}
      <div className="fixed inset-0 pointer-events-none opacity-40 dark:opacity-60 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-200/40 dark:bg-orange-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-200/40 dark:bg-blue-900/20 blur-[120px]" />
      </div>

      <main className="flex-1 relative z-10 overflow-auto pb-24 custom-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full"
            >
              <Dashboard books={currentBooks} updateBook={updateBook} />
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
              <Library allBooks={books} updateBook={updateBook} deleteBook={deleteBook} />
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

      {/* Floating Action Button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsAddModalOpen(true)}
        className="fixed bottom-24 right-6 z-50 w-14 h-14 bg-[#141414] dark:bg-[#E0D8D0] text-[#E0D8D0] dark:text-[#141414] rounded-full shadow-2xl flex items-center justify-center hover:scale-105 transition-transform"
        id="add-book-fab"
      >
        <Plus className="w-8 h-8" />
      </motion.button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-[#151619]/80 backdrop-blur-xl border-t border-[#141414]/10 dark:border-white/10 px-6 py-4 flex justify-around items-center rounded-t-3xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)]">
        <NavButton
          active={activeTab === 'home'}
          onClick={() => setActiveTab('home')}
          icon={<Home className="w-6 h-6" />}
          label="Home"
        />
        <NavButton
          active={activeTab === 'library'}
          onClick={() => setActiveTab('library')}
          icon={<LibraryIcon className="w-6 h-6" />}
          label="Library"
        />
        <NavButton
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={<SettingsIcon className="w-6 h-6" />}
          label="Settings"
        />
      </nav>

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
        "flex flex-col items-center gap-1 transition-all duration-300",
        active ? "text-[#141414] dark:text-white" : "text-[#141414]/40 dark:text-white/40"
      )}
    >
      <motion.div
        animate={active ? { scale: 1.2, y: -2 } : { scale: 1, y: 0 }}
        className="relative"
      >
        {icon}
        {active && (
          <motion.div
            layoutId="nav-dot"
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"
          />
        )}
      </motion.div>
      <span className="text-[10px] font-medium tracking-tight uppercase">{label}</span>
    </button>
  );
}

