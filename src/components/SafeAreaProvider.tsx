import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const SafeAreaContext = createContext<Insets>({ top: 0, bottom: 0, left: 0, right: 0 });

export const useSafeArea = () => useContext(SafeAreaContext);

export const SafeAreaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [insets, setInsets] = useState<Insets>({ top: 0, bottom: 0, left: 0, right: 0 });

  useEffect(() => {
    // Create a hidden element to measure safe area insets
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '0';
    div.style.left = '0';
    div.style.visibility = 'hidden';
    div.style.pointerEvents = 'none';
    div.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    div.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    div.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
    div.style.paddingRight = 'env(safe-area-inset-right, 0px)';
    document.body.appendChild(div);

    const updateInsets = () => {
      const style = window.getComputedStyle(div);
      const top = parseInt(style.paddingTop, 10) || 0;
      const bottom = parseInt(style.paddingBottom, 10) || 0;
      const left = parseInt(style.paddingLeft, 10) || 0;
      const right = parseInt(style.paddingRight, 10) || 0;

      // Smart Detection & Fallbacks
      // If we are on mobile and insets are reported as 0, we apply standard device fallbacks
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
      
      // Standard iPhone Notch height is ~44px. Android Status bar is ~24px.
      const fallbackTop = isMobile ? (top > 0 ? top : 44) : 0;
      const fallbackBottom = isMobile ? (bottom > 0 ? bottom : 20) : 0;

      setInsets({
        top: fallbackTop,
        bottom: fallbackBottom,
        left: left,
        right: right,
      });
    };

    updateInsets();
    window.addEventListener('resize', updateInsets);
    window.addEventListener('orientationchange', updateInsets);

    return () => {
      window.removeEventListener('resize', updateInsets);
      window.removeEventListener('orientationchange', updateInsets);
      document.body.removeChild(div);
    };
  }, []);

  return (
    <SafeAreaContext.Provider value={insets}>
      {children}
    </SafeAreaContext.Provider>
  );
};
