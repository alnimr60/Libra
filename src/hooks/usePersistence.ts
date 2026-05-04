import { useState, useEffect } from 'react';
import { Book, AppSettings, ReadingGoal, ReadingLog, AppData } from '../types';
import { del } from 'idb-keyval';

const STORAGE_KEY = 'my_personal_library_data';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  notificationsEnabled: true,
  notificationFrequency: 'once',
  customNotificationTimes: ['09:00'],
  dashboardStyle: 'linear',
  language: 'en',
};

export function usePersistence() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          books: (parsed.books || []).map((b: any) => ({
            ...b,
            readingDirection: b.readingDirection || 'ltr'
          })),
          goals: parsed.goals || [],
          readingLogs: parsed.readingLogs || [],
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        };
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
    return {
      books: [],
      settings: DEFAULT_SETTINGS,
      goals: [],
      readingLogs: [],
    };
  });

  // Apply theme whenever data.settings.theme changes
  useEffect(() => {
    const applyTheme = () => {
      const theme = data.settings.theme;
      const isDark = theme === 'dark' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (data.settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [data.settings.theme]);

  // Persist data whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

  const addGoal = (goal: ReadingGoal) => {
    setData(prev => ({
      ...prev,
      goals: [goal, ...prev.goals],
    }));
  };

  const updateGoal = (updatedGoal: ReadingGoal) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === updatedGoal.id ? updatedGoal : g),
    }));
  };

  const deleteGoal = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id),
    }));
  };

  const logReading = (pages: number) => {
    if (pages <= 0) return;
    const today = new Date().toISOString().split('T')[0];
    setData(prev => {
      const existingLogIndex = prev.readingLogs.findIndex(l => l.date === today);
      const newLogs = [...prev.readingLogs];
      if (existingLogIndex >= 0) {
        newLogs[existingLogIndex] = {
          ...newLogs[existingLogIndex],
          pagesRead: newLogs[existingLogIndex].pagesRead + pages,
        };
      } else {
        newLogs.push({ date: today, pagesRead: pages });
      }
      return { ...prev, readingLogs: newLogs };
    });
  };

  return {
    books: data.books,
    settings: data.settings,
    goals: data.goals,
    readingLogs: data.readingLogs,
    addBook,
    updateBook,
    deleteBook,
    setSettings,
    addGoal,
    updateGoal,
    deleteGoal,
    logReading,
  };
}
