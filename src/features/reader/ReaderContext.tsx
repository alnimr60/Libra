import React, { createContext, useContext, useState, useEffect } from 'react';

export type ReaderTheme = 'light' | 'dark' | 'sepia';

export type ReadingMode = 'paginated' | 'scrolled';

interface ReaderContextType {
  theme: ReaderTheme;
  setTheme: (theme: ReaderTheme) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  showControls: boolean;
  setShowControls: (show: boolean) => void;
  direction: 'ltr' | 'rtl';
  setDirection: (dir: 'ltr' | 'rtl') => void;
  readingMode: ReadingMode;
  setReadingMode: (mode: ReadingMode) => void;
}

const ReaderContext = createContext<ReaderContextType | undefined>(undefined);

export function ReaderProvider({ children, initialDirection = 'ltr' }: { children: React.ReactNode, initialDirection?: 'ltr' | 'rtl' }) {
  const [theme, setTheme] = useState<ReaderTheme>(() => {
    if (typeof window !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return 'dark';
    }
    return 'light';
  });
  const [fontSize, setFontSize] = useState(100);
  const [showControls, setShowControls] = useState(true);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(initialDirection);
  const [readingMode, setReadingMode] = useState<ReadingMode>('paginated');

  return (
    <ReaderContext.Provider value={{
      theme, setTheme,
      fontSize, setFontSize,
      showControls, setShowControls,
      direction, setDirection,
      readingMode, setReadingMode
    }}>
      {children}
    </ReaderContext.Provider>
  );
}

export function useReader() {
  const context = useContext(ReaderContext);
  if (!context) throw new Error('useReader must be used within a ReaderProvider');
  return context;
}