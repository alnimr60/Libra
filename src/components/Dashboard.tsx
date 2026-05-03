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
            {isRTL ? "مكتبتك في انتظارك" : "Your library is waiting"}
          </h2>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
            {isRTL ? "أضف كتاباً لبدء المتابعة" : "Add a book to start tracking"}
          </p>
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
                  value={`${ppd} ${t.units}/${isRTL ? "يوم" : "day"}`} 
                  icon={<Clock className="w-3 h-3" />} 
                />
                <StatCard 
                  label={isRTL ? "متبقى" : "Left"} 
                  value={`${daysLeft} ${isRTL ? "أيام" : "days"}`} 
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
                        {isRTL ? "لا توجد أهداف نشطة" : "No active goals"}
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
              className="fixed bottom-0 left-0 right-0 z-[510] w-full bg-white dark:bg-zinc-900 rounded-t-[2.5rem] p-10 pb-[calc(var(--sab)+2rem)] shadow-2xl"
              dir={isRTL ? "rtl" : "ltr"}
            >
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-10" />
              
               <div className="mb-10 space-y-4">
                <div className="flex justify-between items-baseline mb-2">
                   <h3 className="text-2xl font-serif font-medium">
                    {isRTL ? "تحديث القراءة" : "Update Reading"}
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
                    <span>{isRTL ? "البداية" : "Start"}</span>
                    <span>{isRTL ? "النهاية" : "End"} ({currentBook.totalPages})</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setTempPage(Math.min(currentBook.currentPage + ppd, currentBook.totalPages))}
                  className="py-5 px-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono uppercase tracking-widest active:scale-95 transition-transform"
                >
                  {isRTL ? "الهدف" : "Goal"} (+{ppd})
                </button>
                <button 
                  onClick={() => handleUpdateProgress(tempPage)}
                  className="py-5 px-4 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-[10px] font-mono uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                >
                  {isRTL ? "إتمام" : "Complete"}
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
                ? (goal.frequency === 'daily' ? "هدف يومي" : "هدف أسبوعي") 
                : `${goal.frequency} goal`}
            </span>
          </div>
          <div className="text-xl font-serif font-medium">{goal.target} {isRTL ? "صفحة" : "Pages"}</div>
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
          <span className="text-zinc-400">{isRTL ? "التقدم" : "Progress"}</span>
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
              {isRTL ? "هدف جديد" : "New Goal"}
            </h3>
            
            <div className="space-y-8 mb-10">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-4 block">
                  {isRTL ? "عدد الصفحات المستهدف" : "Target Pages"}
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
                  {isRTL ? "التكرار" : "Frequency"}
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
                      {isRTL ? (f === 'daily' ? "يومي" : "أسبوعي") : f}
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
                {isRTL ? "إلغاء" : "Cancel"}
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-[2] py-4 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-[10px] font-mono uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
              >
                {isRTL ? "حفظ الهدف" : "Set Goal"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
