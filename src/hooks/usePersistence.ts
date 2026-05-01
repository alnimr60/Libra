import { useState, useEffect } from 'react';
import { Book, AppSettings } from '../types';
import { del } from 'idb-keyval';

const STORAGE_KEY = 'my_personal_library_data';

interface AppData {
  books: Book[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  notificationsEnabled: true,
  notificationFrequency: 'once',
  customNotificationTimes: ['09:00'],
};

export function usePersistence() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
    return {
      books: [],
      settings: DEFAULT_SETTINGS,
    };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    
    // Apply theme
    if (data.settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [data]);

  const addBook = (book: Book) => {
    setData(prev => ({
      ...prev,
      books: [book, ...prev.books],
    }));
  };

  const updateBook = (updatedBook: Book) => {
    setData(prev => ({
      ...prev,
      books: prev.books.map(b => b.id === updatedBook.id ? updatedBook : b),
    }));
  };

  const deleteBook = (id: string) => {
    const bookToDelete = data.books.find(b => b.id === id);
    if (bookToDelete?.fileDataId) {
      del(bookToDelete.fileDataId).catch(console.error);
    }
    setData(prev => ({
      ...prev,
      books: prev.books.filter(b => b.id !== id),
    }));
  };

  const setSettings = (settings: Partial<AppSettings>) => {
    setData(prev => ({
      ...prev,
      settings: { ...prev.settings, ...settings },
    }));
  };

  return {
    books: data.books,
    settings: data.settings,
    addBook,
    updateBook,
    deleteBook,
    setSettings,
  };
}
