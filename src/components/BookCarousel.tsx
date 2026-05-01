import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useAnimation, AnimatePresence } from 'motion/react';
import { Book } from '../types';
import { cn } from '../lib/utils';

interface BookCarouselProps {
  books: Book[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export default function BookCarousel({ books, selectedIndex, onChange }: BookCarouselProps) {
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.offsetWidth);
    }
    
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Cap the effective width for spacing calculation to prevent books 
        // from being pushed too far apart on wide screens
        const cappedWidth = Math.min(1200, entry.contentRect.width);
        setWidth(cappedWidth);
      }
    });
    
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleDragStart = () => setIsDragging(true);

  const handleDragEnd = (_: any, info: any) => {
    // Increase swipe threshold and distinguish from accidental taps
    const swipeThreshold = 30;
    const swipe = info.offset.x;

    if (swipe < -swipeThreshold && selectedIndex < books.length - 1) {
      onChange(selectedIndex + 1);
    } else if (swipe > swipeThreshold && selectedIndex > 0) {
      onChange(selectedIndex - 1);
    }
    
    // Reset dragging with slight delay to prevent phantom taps
    setTimeout(() => setIsDragging(false), 50);
  };

  const handleTap = (index: number) => {
    if (!isDragging) {
      onChange(index);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-visible perspective-[1500px] touch-none"
      onPointerDown={(e) => {
        // Track initial touch for manual swipe detection if needed
        // but Motion's onPan is better
      }}
    >
      {/* Interaction Layer */}
      <motion.div 
        className="absolute inset-0 z-10 touch-none"
        onPanEnd={(e, info) => {
          const velocity = info.velocity.x;
          const offset = info.offset.x;
          const swipeThreshold = 50;
          
          if ((offset < -swipeThreshold || velocity < -500) && selectedIndex < books.length - 1) {
            onChange(selectedIndex + 1);
          } else if ((offset > swipeThreshold || velocity > 500) && selectedIndex > 0) {
            onChange(selectedIndex - 1);
          }
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center preserve-3d pointer-events-none">
        <AnimatePresence initial={false} mode="popLayout">
          {books.map((book, index) => {
            const distance = index - selectedIndex;
            const isActive = index === selectedIndex;
            const isVisible = Math.abs(distance) <= 3;

            if (!isVisible) return null;

            return (
              <motion.div
                key={book.id}
                layoutId={`book-${book.id}`}
                initial={{ opacity: 0, scale: 0.5, rotateY: distance * 45, z: -500 }}
                animate={{ 
                  scale: isActive ? 1 : 0.82 - Math.abs(distance) * 0.08,
                  x: distance * (width * 0.32) - (distance * distance * 10 * Math.sign(distance)),
                  z: -Math.abs(distance) * 400 - (isActive ? 0 : 50),
                  rotateY: distance * -35,
                  opacity: 1 - Math.abs(distance) * 0.4,
                  zIndex: 100 - Math.abs(distance),
                }}
                exit={{ 
                  opacity: 0, 
                  scale: 0.5, 
                  x: distance > 0 ? 500 : -500,
                  rotateY: distance > 0 ? -90 : 90
                }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 260, 
                  damping: 24,
                  mass: 0.8
                }}
                className={cn(
                  "absolute w-52 h-72 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] dark:shadow-[0_30px_60px_rgba(255,255,255,0.08)] overflow-hidden cursor-pointer preserve-3d transition-all duration-300 pointer-events-auto",
                  isActive ? "ring-1 ring-white/30" : "grayscale-[0.3] brightness-75"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTap(index);
                }}
              >
                {book.coverUrl ? (
                  <img 
                    src={book.coverUrl} 
                    alt={book.title} 
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center p-6 text-center">
                    <span className="text-white font-serif text-lg leading-tight uppercase tracking-widest">{book.title}</span>
                  </div>
                )}
                
                {/* Mirroring effect light */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-black/20 pointer-events-none" />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
