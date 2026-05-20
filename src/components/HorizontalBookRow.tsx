import React from 'react';
import { Book } from '../types';
import { BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface RowProps {
  title: string;
  books: Book[];
  onOpen: (book: Book) => void;
  isRTL: boolean;
}

export default function HorizontalBookRow({ title, books, onOpen, isRTL }: RowProps) {
  if (books.length === 0) return null;

  return (
    <div className="px-6 mb-10">
      <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-4">{title}</h3>
      <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth" dir={isRTL ? "rtl" : "ltr"}>
        {books.map(book => (
          <motion.button
            key={book.id}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onOpen(book)}
            className="w-24 flex-shrink-0 flex flex-col gap-2 group"
          >
            <div className="w-24 h-36 bg-zinc-200 dark:bg-zinc-800 rounded-lg overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2 text-center text-[8px] uppercase">
                    {book.title}
                </div>
              )}
            </div>
            <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-300 line-clamp-2 leading-tight">{book.title}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
