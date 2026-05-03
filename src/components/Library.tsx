import React, { useState, useMemo } from 'react';
import { Book, ReadingStatus } from '../types';
import { Search, Grid, List as ListIcon, Trash2, MoreHorizontal, BookOpen, Clock, CheckCircle2, ChevronRight, X, PlayCircle, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useSafeArea } from './SafeAreaProvider';

interface LibraryProps {
  allBooks: Book[];
  updateBook: (book: Book) => void;
  deleteBook: (id: string) => void;
  onOpenBook: (book: Book) => void;
  onAddClick: () => void;
}

export default function Library({ allBooks, updateBook, deleteBook, onOpenBook, onAddClick }: LibraryProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReadingStatus | 'All'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', author: '', coverUrl: '' });
  const insets = useSafeArea();

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
        coverUrl: selectedBook.coverUrl || ''
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
        coverUrl: editForm.coverUrl
      });
      setIsEditing(false);
    }
  };

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    allBooks.forEach(b => b.tags.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, [allBooks]);

  return (
    <div 
      style={{ paddingTop: `${insets.top + 32}px` }}
      className="px-6 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 transition-colors duration-500 overflow-hidden"
    >
      {/* Header Section */}
      <header className="mb-10 space-y-6 flex-shrink-0">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-serif font-medium tracking-tight text-zinc-900 dark:text-zinc-50">Library</h1>
            <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] mt-2">
              {allBooks.length} VOLUMES COLLECTED
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onAddClick}
              className="p-3 bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
              title="Add Volume"
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
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-orange-500 transition-colors" />
          <input 
            type="text"
            placeholder="Search your collection..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-4 py-2 bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-orange-500 focus:outline-none text-sm transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
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
                  ? "text-zinc-900 dark:text-zinc-100" 
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              )}
            >
              {status}
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
                  onClick={() => onOpenBook(book)}
                  onInfoClick={() => setSelectedBookId(book.id)}
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
              <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">No volumes match your query</p>
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
              }}
              className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[500]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-[2.5rem] z-[510] border-t border-zinc-200 dark:border-zinc-800 p-8 pb-[calc(var(--sab)+2rem)] shadow-2xl overflow-hidden"
            >
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-8" />
              
              <div className="flex gap-8 mb-8">
                <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-xl border border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-100 dark:bg-zinc-800">
                  {(isEditing ? editForm.coverUrl : selectedBook.coverUrl) ? (
                    <img src={isEditing ? editForm.coverUrl : selectedBook.coverUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2 text-center">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">No Cover</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input 
                        type="text"
                        placeholder="Volume Title"
                        value={editForm.title}
                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-xl text-sm font-serif focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <input 
                        type="text"
                        placeholder="Author"
                        value={editForm.author}
                        onChange={(e) => setEditForm(prev => ({ ...prev, author: e.target.value }))}
                        className="w-full bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <input 
                        type="text"
                        placeholder="Cover URL"
                        value={editForm.coverUrl}
                        onChange={(e) => setEditForm(prev => ({ ...prev, coverUrl: e.target.value }))}
                        className="w-full bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-xl text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  ) : (
                    <>
                      <h2 className="text-2xl font-serif font-medium text-zinc-900 dark:text-zinc-50 leading-tight mb-1">{selectedBook.title}</h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{selectedBook.author || 'Unknown Author'}</p>
                    </>
                  )}
                  
                  <div className="flex items-center gap-3 mt-4">
                    {isEditing ? (
                      <>
                        <button 
                          onClick={handleSaveEdit}
                          className="flex-1 bg-orange-500 text-white py-3 px-6 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform"
                        >
                          Save Changes
                        </button>
                        <button 
                          onClick={() => setIsEditing(false)}
                          className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-400 active:scale-90 transition-transform"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={startEditing}
                          className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 py-3.5 px-6 rounded-2xl text-[10px] font-mono uppercase tracking-[0.2em] active:scale-95 transition-transform"
                        >
                          Edit Metadata
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm('Permanently remove this volume?')) {
                              deleteBook(selectedBook.id);
                              setSelectedBookId(null);
                            }
                          }}
                          className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-red-500 active:scale-90 transition-transform"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-4">Reading Status</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'To-Be-Read', icon: Clock, label: 'Queue' },
                      { id: 'Currently Reading', icon: BookOpen, label: 'Reading' },
                      { id: 'Finished', icon: CheckCircle2, label: 'Done' }
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
                      <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Progress</p>
                      <p className="text-sm font-serif">{Math.round((selectedBook.currentPage / selectedBook.totalPages) * 100)}%</p>
                    </div>
                    <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(selectedBook.currentPage / selectedBook.totalPages) * 100}%` }}
                        className="h-full bg-orange-500"
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
  onInfoClick
}: { 
  book: Book, 
  viewMode: 'grid' | 'list',
  index: number,
  onClick: () => void,
  onInfoClick: () => void,
  key?: React.Key
}) {
  const progress = (book.currentPage / book.totalPages) * 100;

  if (viewMode === 'grid') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ delay: index * 0.05 }}
        className="group cursor-pointer"
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
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5 dark:bg-white/5">
              <div className="h-full bg-orange-500" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />
          
          <button 
            onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
            className="absolute top-3 right-3 p-2.5 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 backdrop-blur-sm hover:bg-orange-500 hover:text-white"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-1" onClick={onClick}>
          <h3 className="text-sm font-serif font-medium leading-snug line-clamp-2 text-zinc-900 dark:text-zinc-50 group-hover:text-orange-600 transition-colors">
            {book.title}
          </h3>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono truncate">
            {book.author || 'ANONYMOUS'}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group flex items-center gap-6 py-4 border-b border-zinc-100 dark:border-zinc-900 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
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
        <h3 className="text-sm font-serif font-medium text-zinc-900 dark:text-zinc-50 truncate group-hover:text-orange-600 transition-colors">{book.title}</h3>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono uppercase tracking-widest truncate">{book.author || 'ANONYMOUS'}</p>
      </div>

      <div className="flex items-center gap-8">
        {book.status === 'Currently Reading' && (
          <div className="hidden sm:flex flex-col items-end gap-1.5 min-w-[100px]" onClick={onClick}>
             <div className="w-24 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
               <div className="h-full bg-orange-500" style={{ width: `${progress}%` }} />
             </div>
             <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest">{Math.round(progress)}% COMPLETE</span>
          </div>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
          className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4 text-zinc-400" />
        </button>
        <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:translate-x-1 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-all" onClick={onClick} />
      </div>
    </motion.div>
  );
}
