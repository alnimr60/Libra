import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { 
  X, Settings, Type, Languages, Check, 
  Bookmark as BookmarkIcon, Trash2, Navigation,
  ChevronLeft, ChevronRight, Menu
} from 'lucide-react';
import { useSafeArea } from '../../components/SafeAreaProvider';
import { cn } from '../../lib/utils';
import { Book, Bookmark } from '../../types';
import { useReader, ReaderTheme } from './ReaderContext';

interface ReaderShellProps {
  book: Book;
  onClose: () => void;
  children: React.ReactNode;
  currentPage: number;
  totalPages: number;
  progress: number;
  onPageChange: (page: number) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onPrev: () => void;
  onNext: () => void;
  onJumpToPage: (page: number) => void;
  onToggleNav?: () => void;
  title: string;
}

export default function ReaderShell({
  book,
  onClose,
  children,
  currentPage,
  totalPages,
  progress,
  onPageChange,
  onUpdateBookmarks,
  onPrev,
  onNext,
  onJumpToPage,
  onToggleNav,
  title
}: ReaderShellProps) {
  const { 
    theme, setTheme, 
    fontSize, setFontSize, 
    showControls, setShowControls,
    direction, setDirection 
  } = useReader();
  
  const insets = useSafeArea();
  const [showSettings, setShowSettings] = useState(false);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [navTab, setNavTab] = useState<'pages' | 'bookmarks'>('pages');

  // Swipe gesture handling
  const touchStart = useRef({ x: 0, y: 0 });
  const swipeX = useMotionValue(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStart.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStart.current.y;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 100) {
      if (deltaX > 0) {
        // Swipe Right
        direction === 'ltr' ? onPrev() : onNext();
      } else {
        // Swipe Left
        direction === 'ltr' ? onNext() : onPrev();
      }
    }
  };

  const bookmarks = book.bookmarks || [];
  const isBookmarked = bookmarks.some(bm => bm.page === currentPage);

  const toggleBookmark = () => {
    if (isBookmarked) {
      onUpdateBookmarks(bookmarks.filter(bm => bm.page !== currentPage));
    } else {
      const newBookmark: Bookmark = {
        id: Math.random().toString(36).substr(2, 9),
        page: currentPage,
        createdAt: new Date().toISOString()
      };
      onUpdateBookmarks([...bookmarks, newBookmark]);
    }
  };

  const handleToggleControls = (e: React.MouseEvent) => {
    // If clicking target is UI, don't toggle
    if ((e.target as HTMLElement).closest('button, input, .hud-overlay')) return;
    setShowControls(!showControls);
  };

  return (
    <div 
      className={cn(
        "fixed inset-0 z-[300] flex flex-col transition-colors duration-500 overflow-hidden select-none",
        theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 
        theme === 'sepia' ? 'bg-[#f4ecd8] text-[#433422]' : 
        'bg-white text-zinc-900'
      )}
      onClick={handleToggleControls}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background layer */}
      <div className="absolute inset-0 z-0" />

      {/* Content Renderer Wrapper */}
      <div className="flex-1 relative z-10">
        {children}
      </div>

      {/* Interaction Zones (Overlays) */}
      <div className="absolute inset-0 z-20 pointer-events-none flex">
        <div className="w-1/4 h-full pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); onPrev(); }} />
        <div className="flex-1 h-full pointer-events-auto" onClick={() => setShowControls(!showControls)} />
        <div className="w-1/4 h-full pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); onNext(); }} />
      </div>

      {/* Top HUD */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 right-0 z-40 hud-overlay"
            style={{ paddingTop: insets.top }}
          >
            <div className={cn(
              "flex items-center justify-between px-4 py-3 backdrop-blur-xl border-b transition-colors duration-500",
              theme === 'dark' ? 'bg-zinc-950/80 border-white/5' : 
              theme === 'sepia' ? 'bg-[#f4ecd8]/80 border-[#433422]/10' : 
              'bg-white/80 border-zinc-200'
            )}>
              <div className="flex items-center gap-1">
                <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
                {onToggleNav && (
                  <button onClick={onToggleNav} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                    <Menu className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="flex-1 text-center truncate px-4">
                <h2 className="font-serif font-bold text-sm md:text-base opacity-80">{title}</h2>
              </div>

              <div className="flex items-center gap-1">
                <button 
                  onClick={toggleBookmark}
                  className={cn(
                    "p-2 rounded-full transition-all active:scale-75",
                    isBookmarked ? "text-orange-500" : "hover:bg-black/5 dark:hover:bg-white/10"
                  )}
                >
                  <BookmarkIcon className={cn("w-5 h-5", isBookmarked && "fill-current")} />
                </button>
                <button 
                  onClick={() => setIsNavigatorOpen(true)}
                  className="px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 transition-all flex items-center gap-2"
                >
                  <span className="text-[10px] font-mono font-bold">{currentPage} / {totalPages}</span>
                  <Navigation className="w-3 h-3 opacity-40" />
                </button>
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom HUD */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-40 hud-overlay"
            style={{ paddingBottom: insets.bottom }}
          >
            <div className={cn(
              "p-6 backdrop-blur-xl border-t transition-colors duration-500",
              theme === 'dark' ? 'bg-zinc-950/80 border-white/5' : 
              theme === 'sepia' ? 'bg-[#f4ecd8]/80 border-[#433422]/10' : 
              'bg-white/80 border-zinc-200'
            )}>
              <div className="max-w-xl mx-auto flex items-center gap-6">
                <button onClick={onPrev} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                
                <div className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-orange-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-mono font-bold tracking-[0.2em] opacity-40 uppercase">
                    {progress}% Progress
                  </span>
                </div>

                <button onClick={onNext} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[50] bg-black/20"
              onClick={() => setShowSettings(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={cn(
                "fixed top-[calc(80px+env(safe-area-inset-top))] right-6 z-[60] p-6 rounded-3xl shadow-2xl border w-72 backdrop-blur-2xl transition-colors duration-500",
                theme === 'dark' ? 'bg-zinc-900/90 border-white/10 text-white' : 
                theme === 'sepia' ? 'bg-[#ede3c9]/95 border-[#d8ccaf] text-[#433422]' : 
                'bg-white/95 border-zinc-200 text-zinc-900'
              )}
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-6">
                <div className="space-y-3">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-40">Appearance</span>
                  <div className="flex gap-2">
                    {(['light', 'dark', 'sepia'] as const).map(t => (
                      <button 
                        key={t}
                        onClick={() => setTheme(t)}
                        className={cn(
                          "flex-1 h-12 rounded-xl transition-all border-2",
                          theme === t ? "border-orange-500 bg-orange-500/5" : "border-transparent bg-black/5 dark:bg-white/5"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full mx-auto border",
                          t === 'light' ? "bg-white border-zinc-200" : 
                          t === 'dark' ? "bg-black border-zinc-700" : 
                          "bg-[#f4ecd8] border-[#d8ccaf]"
                        )} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-40">Text Scale</span>
                    <span className="text-xs font-mono font-bold">{fontSize}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Type className="w-3 h-3 opacity-30" />
                    <input 
                      type="range" min="80" max="250" step="10" 
                      value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))}
                      className="flex-1 accent-orange-500"
                    />
                    <Type className="w-5 h-5 opacity-60" />
                  </div>
                </div>

                <div className="pt-4 border-t border-black/5 dark:border-white/5">
                  <button 
                    onClick={() => setDirection(direction === 'ltr' ? 'rtl' : 'ltr')}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 transition-all font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <Languages className="w-4 h-4 opacity-50" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Reading: {direction}</span>
                    </div>
                    <div className="w-8 h-4 bg-orange-500/20 rounded-full relative">
                      <motion.div 
                        animate={{ x: direction === 'rtl' ? 16 : 4 }}
                        className="absolute top-1 w-2 h-2 bg-orange-500 rounded-full"
                      />
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pages Navigator */}
      <AnimatePresence>
        {isNavigatorOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-6"
            onClick={() => setIsNavigatorOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="w-full max-w-sm flex flex-col items-center gap-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex bg-white/5 p-1 rounded-2xl w-full">
                <button 
                  onClick={() => setNavTab('pages')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                    navTab === 'pages' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                  )}
                >
                  Jump to
                </button>
                <button 
                  onClick={() => setNavTab('bookmarks')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                    navTab === 'bookmarks' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                  )}
                >
                  Bookmarks
                  {bookmarks.length > 0 && <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[8px] flex items-center justify-center">{bookmarks.length}</span>}
                </button>
              </div>

              {navTab === 'pages' ? (
                <div className="w-full flex flex-col items-center gap-12 py-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-9xl font-serif text-white tracking-tighter leading-none">{currentPage}</span>
                    <span className="text-xl font-serif text-white/20">/ {totalPages}</span>
                  </div>
                  <div className="w-full space-y-4">
                    <input 
                      type="range" min={1} max={totalPages} value={currentPage}
                      onChange={(e) => onJumpToPage(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-white/20 uppercase tracking-widest px-1">
                      <span>Start</span>
                      <span>End</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-h-[40vh] overflow-y-auto no-scrollbar space-y-2">
                  {bookmarks.length === 0 ? (
                    <div className="py-12 text-center opacity-30 text-[10px] font-mono uppercase tracking-widest">No Bookmarks</div>
                  ) : (
                    bookmarks.sort((a,b) => a.page - b.page).map(bm => (
                      <div key={bm.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all">
                        <button 
                          onClick={() => { onJumpToPage(bm.page); setIsNavigatorOpen(false); }}
                          className="flex-1 text-left"
                        >
                          <span className="text-3xl font-serif text-white tracking-tighter">P{bm.page}</span>
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
                className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center shadow-2xl active:scale-95 transition-all"
              >
                <Check className="w-8 h-8" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
