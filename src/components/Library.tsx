import React, { useState, useMemo } from 'react';
import { Book, ReadingStatus } from '../types';
import { Search, Filter, Grid, List as ListIcon, Trash2, Edit2, PlayCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LibraryProps {
  allBooks: Book[];
  updateBook: (book: Book) => void;
  deleteBook: (id: string) => void;
}

export default function Library({ allBooks, updateBook, deleteBook }: LibraryProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReadingStatus | 'All'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    allBooks.forEach(b => b.tags.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, [allBooks]);

  return (
    <div className="px-6 pt-12 flex flex-col h-full overflow-hidden">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-medium tracking-tight">Your Library</h1>
        <p className="text-sm opacity-50 uppercase tracking-widest mt-1">Found {allBooks.length} books</p>
      </div>

      {/* Search & Actions */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-30" />
          <input 
            type="text"
            placeholder="Search titles, authors, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/40 dark:bg-white/5 backdrop-blur-md border border-[#141414]/5 dark:border-white/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 dark:focus:ring-white/10"
          />
        </div>

        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex items-center gap-2">
            {(['All', 'Currently Reading', 'To-Be-Read', 'Finished'] as const).map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                  filterStatus === status 
                    ? "bg-[#141414] dark:bg-[#E0D8D0] text-[#E0D8D0] dark:text-[#141414] shadow-lg" 
                    : "bg-white/40 dark:bg-white/5 border border-[#141414]/5 dark:border-white/5"
                )}
              >
                {status}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-1 bg-white/40 dark:bg-white/5 rounded-full p-1 border border-[#141414]/5 dark:border-white/5">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded-full transition-colors", viewMode === 'grid' ? "bg-white dark:bg-[#1A1A1A] shadow-sm" : "opacity-40")}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-full transition-colors", viewMode === 'list' ? "bg-white dark:bg-[#1A1A1A] shadow-sm" : "opacity-40")}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Book Grid/List */}
      <div className="flex-1 overflow-auto pb-8 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {filteredBooks.length > 0 ? (
            <div className={cn(
              "grid gap-4",
              viewMode === 'grid' ? "grid-cols-2" : "grid-cols-1"
            )}>
              {filteredBooks.map((book) => (
                <BookLibraryItem 
                  key={book.id} 
                  book={book} 
                  viewMode={viewMode}
                  onUpdateStatus={() => {
                    const nextStatusMap: Record<ReadingStatus, ReadingStatus> = {
                      'To-Be-Read': 'Currently Reading',
                      'Currently Reading': 'Finished',
                      'Finished': 'To-Be-Read'
                    };
                    updateBook({ ...book, status: nextStatusMap[book.status] });
                  }}
                  onDelete={() => deleteBook(book.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
              <Search className="w-12 h-12 mb-4" />
              <p>No books found</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Featured Tags Section (Horizontal scroll) */}
      {uniqueTags.length > 0 && (
        <div className="pt-4 border-t border-[#141414]/5 dark:border-white/5 mb-2">
          <p className="text-[10px] uppercase tracking-widest opacity-40 mb-3 px-1">Your Topics</p>
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
            {uniqueTags.map(tag => (
              <button 
                key={tag}
                onClick={() => setSearch(tag)}
                className="px-3 py-1 bg-white/20 dark:bg-white/5 rounded-lg text-xs hover:bg-white/40 transition-colors"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BookLibraryItem({ 
  book, 
  viewMode, 
  onUpdateStatus, 
  onDelete 
}: { 
  book: Book, 
  viewMode: 'grid' | 'list',
  onUpdateStatus: () => void,
  onDelete: () => void,
  key?: string // Added to avoid TS error when passing in map
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const progress = (book.currentPage / book.totalPages) * 100;

  if (viewMode === 'grid') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="group relative"
      >
        <div 
          onClick={() => {
            if (showConfirm) return;
            setIsOverlayOpen(!isOverlayOpen);
          }}
          className="aspect-[2/3] rounded-2xl overflow-hidden shadow-lg border border-[#141414]/5 dark:border-white/5 mb-2 relative cursor-pointer touch-manipulation"
        >
          {book.coverUrl ? (
            <img src={book.coverUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-400 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
              <span className="text-[10px] font-serif text-center uppercase tracking-widest">{book.title}</span>
            </div>
          )}
          
          {/* Progress Overlay */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10">
            <div className="h-full bg-orange-400" style={{ width: `${progress}%` }} />
          </div>

          {/* Quick Actions Overlay (Hidden until hover/tap) */}
          <div className={cn(
            "absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 transition-opacity duration-300 backdrop-blur-[2px]",
            (isOverlayOpen || showConfirm) ? "opacity-100 pointer-events-auto" : "opacity-0 lg:group-hover:opacity-100 pointer-events-none lg:group-hover:pointer-events-auto"
          )}>
            {showConfirm ? (
              <div className="flex flex-col items-center gap-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                <p className="text-[11px] text-white font-bold uppercase tracking-[0.2em] mb-1">Delete Book?</p>
                <div className="flex gap-4">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                    className="w-12 h-12 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-75 transition-transform"
                    aria-label="Confirm Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowConfirm(false); setIsOverlayOpen(false); }} 
                    className="w-12 h-12 bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md active:scale-75 transition-transform"
                    aria-label="Cancel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-5" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={(e) => { e.stopPropagation(); onUpdateStatus(); }} 
                  className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center active:scale-75 transition-transform shadow-2xl"
                >
                  <PlayCircle className="w-8 h-8" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }} 
                  className="w-14 h-14 bg-red-500 text-white rounded-full flex items-center justify-center active:scale-75 transition-transform shadow-2xl"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        </div>
        <h3 className="text-xs font-medium truncate px-1">{book.title}</h3>
        {book.author && <p className="text-[10px] opacity-50 truncate px-1">{book.author}</p>}
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="bg-white/40 dark:bg-white/5 p-3 rounded-2xl border border-[#141414]/5 dark:border-white/5 flex gap-4 items-center overflow-hidden relative touch-manipulation"
      onClick={() => setIsOverlayOpen(!isOverlayOpen)}
    >
      <div className="w-16 h-20 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
        {book.coverUrl ? (
          <img src={book.coverUrl} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-800" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium truncate">{book.title}</h3>
        {book.author && <p className="text-xs opacity-50 truncate">{book.author}</p>}
        <div className="flex items-center gap-2 mt-2">
           <div className="flex-1 h-1 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
             <div className="h-full bg-orange-400" style={{ width: `${progress}%` }} />
           </div>
           <span className="text-[10px] font-mono opacity-40">{Math.round(progress)}%</span>
        </div>
      </div>
      <div className={cn(
        "flex items-center gap-2 z-10 transition-opacity",
        (isOverlayOpen || showConfirm) ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"
      )}>
        {showConfirm ? (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
             <button 
              onClick={(e) => { e.stopPropagation(); onDelete(); }} 
              className="p-3 bg-red-500 text-white rounded-full active:scale-75 transition-transform"
             >
                <Trash2 className="w-5 h-5" />
             </button>
             <button 
              onClick={(e) => { e.stopPropagation(); setShowConfirm(false); setIsOverlayOpen(false); }} 
              className="p-3 bg-black/10 dark:bg-white/10 rounded-full active:scale-75 transition-transform"
             >
                <X className="w-5 h-5" />
             </button>
          </div>
        ) : (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={(e) => { e.stopPropagation(); onUpdateStatus(); }} 
              className="p-3 bg-white dark:bg-white/10 text-black dark:text-white rounded-full shadow-lg active:scale-75 transition-transform"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }} 
              className="p-3 bg-red-500 text-white rounded-full shadow-lg active:scale-75 transition-transform"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
