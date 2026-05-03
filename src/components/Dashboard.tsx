import React, { useState } from 'react';
import { Book } from '../types';
import BookCarousel from './BookCarousel';
import { motion, AnimatePresence } from 'motion/react';
import { calculatePagesPerDay, getDaysRemaining, cn } from '../lib/utils';
import { BookOpen, Calendar, Clock, ChevronRight } from 'lucide-react';
import { useSafeArea } from './SafeAreaProvider';

interface DashboardProps {
  books: Book[];
  updateBook: (book: Book) => void;
  onOpenBook: (book: Book) => void;
}

export default function Dashboard({ books, updateBook, onOpenBook }: DashboardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const insets = useSafeArea();

  const currentBook = books[currentIndex];

  const handleBookClick = (index: number) => {
    const targetBook = books[index];
    
    // Only open the reader if we are clicking the book that is ALREADY centered
    if (index === currentIndex && targetBook?.fileDataId) {
      onOpenBook(targetBook);
    } else {
      // Otherwise, just move the carousel to that book
      setCurrentIndex(index);
    }
  };

  const handleUpdateProgress = (newPage: number) => {
    if (!currentBook) return;
    updateBook({
      ...currentBook,
      currentPage: newPage,
      lastReadAt: new Date().toISOString(),
    });
    setIsUpdateModalOpen(false);
  };

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-10 text-center gap-6">
        <div className="w-24 h-24 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center animate-pulse">
           <BookOpen className="w-10 h-10 text-zinc-400 dark:text-zinc-600" />
        </div>
        <div>
          <h2 className="text-2xl font-serif font-medium mb-3">Your library is waiting</h2>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">Add a book to start tracking</p>
        </div>
      </div>
    );
  }

  const ppd = currentBook ? calculatePagesPerDay(currentBook.totalPages, currentBook.currentPage, currentBook.deadline) : 0;
  const daysLeft = currentBook ? getDaysRemaining(currentBook.deadline) : 0;
  const progress = currentBook ? (currentBook.currentPage / currentBook.totalPages) * 100 : 0;

  return (
    <div 
      style={{ paddingTop: `${insets.top + 32}px` }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div className="px-6 mb-8 flex-shrink-0">
        <h1 className="text-4xl font-serif font-medium tracking-tight">Today</h1>
        <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.3em] mt-2">Continuity is key</p>
      </div>

      <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar pb-10">
        {/* The Carousel */}
        <div className="h-[42vh] relative mb-4 flex-shrink-0">
          <BookCarousel 
            books={books} 
            selectedIndex={currentIndex} 
            onChange={handleBookClick} 
          />
        </div>

        {/* Book Info Panel */}
        <AnimatePresence mode="wait">
          {currentBook && (
            <motion.div
              key={currentBook.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="px-6 space-y-8"
            >
              <div className="text-center max-w-sm mx-auto">
                <h2 className="text-2xl font-serif font-medium leading-tight mb-1">{currentBook.title}</h2>
                {currentBook.author && (
                  <p className="text-xs font-mono uppercase tracking-widest text-zinc-400">{currentBook.author}</p>
                )}
              </div>

              {/* Progress Summary */}
              <div className="flex flex-col items-center">
                <div className="text-5xl font-serif font-medium tracking-tighter mb-2">
                  {Math.round(progress)}%
                </div>
                <div className="w-48 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-orange-500 rounded-full"
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                <StatCard 
                  label="Goal" 
                  value={`${ppd} pgs/day`} 
                  icon={<Clock className="w-3 h-3" />} 
                />
                <StatCard 
                  label="Left" 
                  value={`${daysLeft} days`} 
                  icon={<Calendar className="w-3 h-3" />} 
                />
              </div>

              <div className="flex justify-center max-w-sm mx-auto w-full">
                <button
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="w-full py-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors active:scale-95"
                >
                  Log Reading Progress
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
              className="fixed bottom-0 left-0 right-0 z-[510] w-full bg-white dark:bg-zinc-900 rounded-t-[2.5rem] p-10 pb-[calc(var(--sab)+2rem)] shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-10" />
              
              <div className="mb-10 space-y-4">
                <div className="flex justify-between items-baseline mb-2">
                   <h3 className="text-2xl font-serif font-medium">Update Reading</h3>
                   <span className="text-4xl font-serif text-orange-500">{currentBook.currentPage}</span>
                </div>
                
                <div className="py-8">
                  <input 
                    type="range"
                    min="0"
                    max={currentBook.totalPages}
                    value={currentBook.currentPage}
                    onChange={(e) => handleUpdateProgress(parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none accent-zinc-900 dark:accent-zinc-50 cursor-pointer"
                  />
                  <div className="flex justify-between mt-4 text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-400">
                    <span>Start</span>
                    <span>End ({currentBook.totalPages})</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleUpdateProgress(Math.min(currentBook.currentPage + ppd, currentBook.totalPages))}
                  className="py-5 px-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono uppercase tracking-widest active:scale-95 transition-transform"
                >
                  Goal (+{ppd})
                </button>
                <button 
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="py-5 px-4 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-[10px] font-mono uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                >
                  Complete
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
