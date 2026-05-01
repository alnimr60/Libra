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
    
    // Resize observer to update width
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
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
      className="relative w-full h-full flex items-center justify-center overflow-visible perspective-[1500px]"
    >
      <div className="absolute inset-0 flex items-center justify-center preserve-3d">
        <AnimatePresence initial={false}>
          {books.map((book, index) => {
            const distance = index - selectedIndex;
            const isActive = distance === 0;
            const isVisible = Math.abs(distance) <= 2;

            if (!isVisible) return null;

            return (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, scale: 0.5, rotateY: distance * 45, z: -500 }}
                animate={{ 
                  scale: isActive ? 1 : 0.85 - Math.abs(distance) * 0.1,
                  x: distance * (width * 0.38) - (distance * distance * 15 * Math.sign(distance)),
                  z: -Math.abs(distance) * 350,
                  rotateY: distance * -45,
                  opacity: 1 - Math.abs(distance) * 0.45,
                  zIndex: 100 - Math.abs(distance),
                }}
                exit={{ 
                  opacity: 0, 
                  scale: 0.5,
                  x: distance * width
                }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 280, 
                  damping: 24,
                  mass: 0.8
                }}
                drag={isActive ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.1}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onTap={() => handleTap(index)}
                className={cn(
                  "absolute w-52 h-72 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] dark:shadow-[0_30px_60px_rgba(255,255,255,0.08)] overflow-hidden cursor-pointer preserve-3d",
                  isActive ? "ring-1 ring-white/30" : "grayscale-[0.3]"
                )}
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
