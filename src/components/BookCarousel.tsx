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

  const dragX = useMotionValue(0);
  const dragRotation = useTransform(dragX, [-200, 200], [25, -25]);

  const handleDragStart = () => setIsDragging(true);

  const handleDragEnd = (_: any, info: any) => {
    const swipeThreshold = 50;
    const velocityThreshold = 500;
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if ((offset < -swipeThreshold || velocity < -velocityThreshold) && selectedIndex < books.length - 1) {
      onChange(selectedIndex + 1);
    } else if ((offset > swipeThreshold || velocity > velocityThreshold) && selectedIndex > 0) {
      onChange(selectedIndex - 1);
    }
    
    // Reset drag visuals
    dragX.set(0);
    
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
    >
      {/* Interaction Layer - Top level to catch everything */}
      <motion.div 
        className="absolute inset-0 z-50 cursor-grab active:cursor-grabbing touch-none"
        drag="x"
        _dragX={dragX}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onTap={(e, info) => {
          if (isDragging) return;
          
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          
          const clickX = info.point.x - rect.left;
          const center = rect.width / 2;
          const bookWidth = 140; // tighter tap target for active book
          
          if (clickX < center - bookWidth) {
            if (selectedIndex > 0) onChange(selectedIndex - 1);
          } else if (clickX > center + bookWidth) {
            if (selectedIndex < books.length - 1) onChange(selectedIndex + 1);
          } else {
            // Clicked active book area
            handleTap(selectedIndex);
          }
        }}
      />

      <motion.div 
        style={{ rotateY: dragRotation }}
        className="absolute inset-0 flex items-center justify-center preserve-3d pointer-events-none transition-transform duration-500 ease-out"
      >
        <AnimatePresence initial={false}>
          {books.map((book, index) => {
            const distance = index - selectedIndex;
            const isActive = index === selectedIndex;
            const isVisible = Math.abs(distance) <= 2; 

            if (!isVisible) return null;

            return (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, scale: 0.5, rotateY: distance * 45, z: -500 }}
                animate={{ 
                  scale: isActive ? 1 : 0.85 - Math.abs(distance) * 0.1,
                  x: distance * (width * 0.35) - (distance * distance * 10 * Math.sign(distance)),
                  z: -Math.abs(distance) * 400 - (isActive ? 0 : 50),
                  rotateY: distance * -40,
                  opacity: 1 - Math.abs(distance) * 0.5,
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
                  stiffness: 300, 
                  damping: 30,
                  mass: 1
                }}
                className={cn(
                  "absolute w-44 md:w-52 h-64 md:h-72 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.4)] dark:shadow-[0_20px_40px_rgba(255,255,255,0.05)] overflow-hidden preserve-3d transition-filter duration-500 pointer-events-none",
                  isActive ? "ring-1 ring-white/30" : "grayscale-[0.4] brightness-75 blur-[1px]"
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
      </motion.div>
    </div>
  );
}
