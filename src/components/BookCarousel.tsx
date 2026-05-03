import * as React from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, useMotionValue, useTransform, useSpring, animate, AnimatePresence } from 'motion/react';
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
  const [isDragging, setIsDragging] = useState(false);
  const tapStartPos = useRef({ x: 0, y: 0 });
  const baseIndex = useRef(selectedIndex);
  
  // The "source of truth" for the current position in the carousel
  const virtualIndex = useMotionValue(selectedIndex);
  // A spring to make the snapping motion smooth
  const smoothIndex = useSpring(virtualIndex, {
    stiffness: 280,
    damping: 30,
    mass: 1
  });

  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.offsetWidth);
    }
    
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cappedWidth = Math.min(1200, entry.contentRect.width);
        setWidth(cappedWidth);
      }
    });
    
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync virtualIndex with prop changes (when user clicks dots or external buttons)
  useEffect(() => {
    if (!isDragging) {
      animate(virtualIndex, selectedIndex, {
        type: 'spring',
        stiffness: 300,
        damping: 35
      });
    }
  }, [selectedIndex, isDragging, virtualIndex]);

  const handlePanStart = () => {
    setIsDragging(true);
    baseIndex.current = virtualIndex.get();
  };

  const handlePanEnd = (_: any, info: any) => {
    const spacing = width * 0.35 || 100;
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    
    // Calculate final index based on position and momentum
    // Reduced multiplier for more controlled momentum
    const predictedOffset = -(offset + velocity * 0.12) / spacing;
    
    let nextIndex = Math.round(baseIndex.current + predictedOffset);
    nextIndex = Math.max(0, Math.min(books.length - 1, nextIndex));
    
    setIsDragging(false);
    onChange(nextIndex);
    
    // Animate to final position
    animate(virtualIndex, nextIndex, {
      type: 'spring',
      stiffness: 300,
      damping: 32,
      velocity: -velocity / spacing 
    });
  };

  const handlePan = (_: any, info: any) => {
    const spacing = width * 0.35 || 100;
    const dragProgress = info.offset.x / spacing;
    virtualIndex.set(baseIndex.current - dragProgress);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-visible perspective-[2000px] touch-pan-y"
    >
      {/* Interaction Layer */}
      <motion.div 
        className="absolute inset-0 z-50 cursor-grab active:cursor-grabbing touch-pan-y"
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        onTapStart={(_, info) => {
          tapStartPos.current = { x: info.point.x, y: info.point.y };
        }}
        onTap={(_, info) => {
          if (isDragging) return;

          // Increase threshold to differentiate between intentional tap and scroll start
          const dx = info.point.x - tapStartPos.current.x;
          const dy = info.point.y - tapStartPos.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 12) return;

          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const clickX = info.point.x - rect.left;
          const center = rect.width / 2;
          const bookWidth = 100;
          
          if (clickX < center - bookWidth) {
            if (selectedIndex > 0) onChange(selectedIndex - 1);
          } else if (clickX > center + bookWidth) {
            if (selectedIndex < books.length - 1) onChange(selectedIndex + 1);
          } else {
            // Clicked active book
            onChange(selectedIndex);
          }
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center preserve-3d pointer-events-none">
        {books.map((book, index) => (
          <CarouselBook 
            key={book.id} 
            book={book} 
            index={index} 
            virtualIndex={smoothIndex} 
            width={width}
            isActive={index === selectedIndex}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselBook({ book, index, virtualIndex, width, isActive }: { 
  book: Book, 
  index: number, 
  virtualIndex: any, 
  width: number,
  isActive: boolean,
  key?: React.Key
}) {
  // Compute distance from current virtual focus
  const distance = useTransform(virtualIndex, (v: number) => index - v);
  
  // Transform distance into visual properties
  const x = useTransform(distance, (d: number) => d * (width * 0.35));
  const z = useTransform(distance, (d: number) => -Math.abs(d) * 400 - (Math.abs(d) < 0.1 ? 0 : 60));
  const rotateY = useTransform(distance, (d: number) => d * -22);
  const opacity = useTransform(distance, [-3, -2, -1, 0, 1, 2, 3], [0, 0.4, 0.7, 1, 0.7, 0.4, 0]);
  const scale = useTransform(distance, (d: number) => 1 - Math.abs(d) * 0.12);
  const zIndex = useTransform(distance, (d: number) => Math.round(100 - Math.abs(d) * 10));

  return (
    <motion.div
      style={{
        x,
        z,
        rotateY,
        opacity,
        scale,
        zIndex,
      }}
      className={cn(
        "absolute w-44 md:w-52 h-64 md:h-72 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] dark:shadow-[0_20px_50px_rgba(255,255,255,0.05)] overflow-hidden preserve-3d pointer-events-none transition-[filter,brightness,ring,box-shadow] duration-500",
        isActive ? "ring-1 ring-white/40" : "grayscale-[0.2] brightness-90"
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
      
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-black/20 pointer-events-none" />
    </motion.div>
  );
}

