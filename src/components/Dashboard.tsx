import React, { useState } from 'react';
import { Book } from '../types';
import BookCarousel from './BookCarousel';
import PDFReader from './PDFReader';
import { motion, AnimatePresence } from 'motion/react';
import { calculatePagesPerDay, getDaysRemaining, cn } from '../lib/utils';
import { BookOpen, Calendar, Clock, ChevronRight, Eye } from 'lucide-react';

interface DashboardProps {
  books: Book[];
  updateBook: (book: Book) => void;
}

export default function Dashboard({ books, updateBook }: DashboardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isReaderOpen, setIsReaderOpen] = useState(false);

  const currentBook = books[currentIndex];

  const handleBookClick = (index: number) => {
    const targetBook = books[index];
    
    // Only open the reader if we are clicking the book that is ALREADY centered
    if (index === currentIndex && targetBook?.fileDataId) {
      setIsReaderOpen(true);
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
        <div className="w-24 h-24 bg-white/20 dark:bg-white/5 rounded-full flex items-center justify-center animate-pulse">
           <BookOpen className="w-12 h-12 opacity-50" />
        </div>
        <div>
          <h2 className="text-2xl font-serif font-medium mb-2">Your library is waiting</h2>
          <p className="text-sm opacity-60">Add a book you're currently reading to start tracking your progress.</p>
        </div>
      </div>
    );
  }

  const ppd = currentBook ? calculatePagesPerDay(currentBook.totalPages, currentBook.currentPage, currentBook.deadline) : 0;
  const daysLeft = currentBook ? getDaysRemaining(currentBook.deadline) : 0;
  const progress = currentBook ? (currentBook.currentPage / currentBook.totalPages) * 100 : 0;

  return (
    <div className="flex flex-col h-full pt-[calc(3rem+var(--msp-top))]">
      <div className="px-6 mb-8">
        <h1 className="text-3xl font-serif font-medium tracking-tight">Currently Reading</h1>
        <p className="text-sm opacity-50 uppercase tracking-widest mt-1">Keep it up, you're doing great</p>
      </div>

      <div className="flex-1 flex flex-col justify-between overflow-hidden">
        {/* The Carousel */}
        <div className="h-[45vh] relative mb-8">
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
              className="px-6 pb-6"
            >
              <div className="mb-4">
                <h2 className="text-xl font-medium truncate">{currentBook.title}</h2>
                {currentBook.author && (
                  <p className="text-sm opacity-60 truncate">{currentBook.author}</p>
                )}
              </div>

              {/* Progress Bar */}
              <div className="relative h-2 w-full bg-white/30 dark:bg-white/10 rounded-full overflow-hidden mb-8">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="absolute h-full bg-[#141414] dark:bg-[#E0D8D0] rounded-full"
                />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <StatCard 
                  label="Goal Today" 
                  value={`${ppd} pgs/day`} 
                  icon={<Clock className="w-4 h-4" />} 
                />
                <StatCard 
                  label="Days Left" 
                  value={`${daysLeft} days`} 
                  icon={<Calendar className="w-4 h-4" />} 
                />
                <StatCard 
                  label="Reading" 
                  value={`${currentBook.currentPage}/${currentBook.totalPages}`} 
                  icon={<BookOpen className="w-4 h-4" />} 
                />
                <StatCard 
                  label="Remaining" 
                  value={`${currentBook.totalPages - currentBook.currentPage} pgs`} 
                  icon={<ChevronRight className="w-4 h-4" />} 
                />
              </div>

              <div className="flex gap-4">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="flex-1 py-4 border-2 border-[#141414]/10 dark:border-white/10 rounded-2xl font-medium shadow-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Log Progress
                </motion.button>
                {currentBook.fileDataId && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsReaderOpen(true)}
                    className="flex-1 py-4 bg-[#141414] dark:bg-[#E0D8D0] text-[#E0D8D0] dark:text-[#141414] rounded-2xl font-medium shadow-xl flex items-center justify-center gap-2"
                  >
                    <Eye className="w-5 h-5" />
                    Open Reader
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* PDF Reader Overlay */}
      {isReaderOpen && currentBook && (
        <PDFReader 
          book={currentBook}
          initialPage={currentBook.currentPage}
          onPageChange={(page) => {
             if (page > currentBook.currentPage) {
               handleUpdateProgress(page);
             }
          }}
          onClose={() => setIsReaderOpen(false)}
        />
      )}

      {/* Progress Update Modal */}
      <AnimatePresence>
        {isUpdateModalOpen && currentBook && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full max-w-md bg-white dark:bg-[#1A1A1A] rounded-t-3xl rounded-b-xl p-8"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-medium">Update Progress</h3>
                <button onClick={() => setIsUpdateModalOpen(false)} className="text-sm opacity-50">Cancel</button>
              </div>
              
              <div className="mb-8">
                <p className="text-sm opacity-60 mb-2">Where did you stop today?</p>
                <div className="flex items-center gap-4">
                  <input 
                    type="range"
                    min="0"
                    max={currentBook.totalPages}
                    value={currentBook.currentPage}
                    onChange={(e) => handleUpdateProgress(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-800 rounded-full appearance-none accent-[#141414] dark:accent-[#E0D8D0]"
                  />
                  <span className="text-lg font-mono font-medium min-w-[60px] text-right">
                    {currentBook.currentPage}
                  </span>
                </div>
                <div className="flex justify-between mt-2 text-[10px] uppercase tracking-widest opacity-40">
                  <span>Start</span>
                  <span>End ({currentBook.totalPages})</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleUpdateProgress(Math.min(currentBook.currentPage + ppd, currentBook.totalPages))}
                  className="py-3 px-4 rounded-xl border border-[#141414]/10 dark:border-white/10 text-sm font-medium"
                >
                  Read Goal (+{ppd})
                </button>
                <button 
                  onClick={() => {
                    const page = prompt('Enter page number:', currentBook.currentPage.toString());
                    if (page !== null) {
                      const num = parseInt(page);
                      if (!isNaN(num)) handleUpdateProgress(Math.min(Math.max(0, num), currentBook.totalPages));
                    }
                  }}
                  className="py-3 px-4 rounded-xl bg-[#141414] dark:bg-[#E0D8D0] text-[#E0D8D0] dark:text-[#141414] text-sm font-medium"
                >
                  Type Page
                </button>
              </div>
            </motion.div>
          </div>
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
