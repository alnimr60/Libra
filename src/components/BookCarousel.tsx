import * as React from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, useMotionValue, useTransform, useSpring, animate, AnimatePresence } from 'motion/react';
import { Book } from '../types';
import { cn } from '../lib/utils';

interface BookCarouselProps {
  books: Book[];
  selectedIndex: number;
  onChange: (index: number) => void;
  onOpen?: (book: Book) => void;
  style?: 'linear' | 'circular';
}

export default function BookCarousel({ books, selectedIndex, onChange, onOpen, style = 'linear' }: BookCarouselProps) {
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const swipeDirection = useRef<'horizontal' | 'vertical' | null>(null);
  const lastVelocity = useRef(0);
  const baseIndex = useRef(selectedIndex);
  
  // The "source of truth" for the current position in the carousel
  const virtualIndex = useMotionValue(selectedIndex);
  // A spring to make the snapping motion smooth
  const smoothIndex = useSpring(virtualIndex, {
    stiffness: 180,
    damping: 30,
    mass: 0.6
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
      let target = selectedIndex;
      
      if (style === 'circular') {
        const currentV = virtualIndex.get();
        // Shortest path to the selected index on a circle
        const diff = (selectedIndex - currentV) % books.length;
        const shortest = ((diff + books.length / 2) % books.length + books.length) % books.length - books.length / 2;
        target = currentV + shortest;
      }

      animate(virtualIndex, target, {
        type: 'spring',
        stiffness: 180,
        damping: 30,
        mass: 0.6,
        velocity: lastVelocity.current
      });
      // Reset velocity after handoff
      lastVelocity.current = 0;
    }
  }, [selectedIndex, isDragging, virtualIndex, style, books.length]);

  const handlePanStart = () => {
    setIsDragging(true);
    isDraggingRef.current = true;
    swipeDirection.current = null;
    lastVelocity.current = 0;
    baseIndex.current = virtualIndex.get();
  };

  const handlePanEnd = (_: any, info: any) => {
    if (swipeDirection.current === 'vertical') {
      setIsDragging(false);
      isDraggingRef.current = false;
      swipeDirection.current = null;
      return;
    }

    const spacing = width * 0.35 || 100;
    const velocity = info.velocity.x;
    
    // Project velocity into indices/s and invert (dragging right decreases index)
    // Cap velocity to keep it controlled
    const cappedVelocity = Math.max(-4000, Math.min(4000, velocity));
    const velocityInIndices = -cappedVelocity / spacing;
    lastVelocity.current = velocityInIndices;

    // Calculate final index based on position and momentum projection
    // Power of 0.45s creates a natural "flick" feel
    const currentVal = virtualIndex.get();
    const predictedStop = currentVal + (velocityInIndices * 0.45);
    
    let nextIndex = Math.round(predictedStop);
    
    if (style === 'linear') {
      nextIndex = Math.max(0, Math.min(books.length - 1, nextIndex));
    } else {
      // Circular: just find the "actual" book index for the parent
      nextIndex = (nextIndex % books.length + books.length) % books.length;
    }
    
    setIsDragging(false);
    // Keep ref true for a short duration to prevent accidental onTap triggers
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);

    // If index changed, notify parent; the useEffect will handle the smooth handoff
    if (nextIndex !== selectedIndex) {
      onChange(nextIndex);
    } else {
      // If we are already at the target index (or it didn't change), 
      // explicitly settle with momentum to avoid a "snap-back" feel
      let target = nextIndex;
      if (style === 'circular') {
        const currentV = virtualIndex.get();
        const diff = (nextIndex - currentV) % books.length;
        const shortest = ((diff + books.length / 2) % books.length + books.length) % books.length - books.length / 2;
        target = currentV + shortest;
      }

      animate(virtualIndex, target, {
        type: 'spring',
        stiffness: 180,
        damping: 30,
        mass: 0.6,
        velocity: velocityInIndices
      });
    }
  };

  const handlePan = (_: any, info: any) => {
    if (!swipeDirection.current) {
      if (Math.abs(info.offset.y) > Math.abs(info.offset.x) + 10) {
        swipeDirection.current = 'vertical';
        return;
      } else if (Math.abs(info.offset.x) > 10) {
        swipeDirection.current = 'horizontal';
      }
    }

    if (swipeDirection.current === 'vertical') return;
    
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
        onTap={(_, info) => {
          // If we just finished a drag/swipe, ignore this tap
          if (isDraggingRef.current) return;
          
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const clickX = info.point.x - rect.left;
          const center = rect.width / 2;
          const bookWidth = 100;
          
          if (clickX < center - bookWidth) {
            const prev = (selectedIndex - 1 + books.length) % books.length;
            if (style === 'linear') {
              if (selectedIndex > 0) onChange(selectedIndex - 1);
            } else {
              onChange(prev);
            }
          } else if (clickX > center + bookWidth) {
            const next = (selectedIndex + 1) % books.length;
            if (style === 'linear') {
              if (selectedIndex < books.length - 1) onChange(selectedIndex + 1);
            } else {
              onChange(next);
            }
          } else {
            // Clicked active book
            if (onOpen && books[selectedIndex]) {
              onOpen(books[selectedIndex]);
            }
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
            isCircular={style === 'circular'}
            totalBooks={books.length}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselBook({ book, index, virtualIndex, width, isActive, isCircular, totalBooks }: { 
  book: Book, 
  index: number, 
  virtualIndex: any, 
  width: number,
  isActive: boolean,
  isCircular: boolean,
  totalBooks: number,
  key?: React.Key
}) {
  // Compute distance from current virtual focus
  const distance = useTransform(virtualIndex, (v: number) => {
    if (!isCircular) return index - v;
    
    // Shortest path on a circle
    const diff = (index - v) % totalBooks;
    const wrapped = ((diff + totalBooks / 2) % totalBooks + totalBooks) % totalBooks - totalBooks / 2;
    return wrapped;
  });
  
  // Transform distance into visual properties
  const x = useTransform(distance, (d: number) => {
    if (!isCircular) return d * (width * 0.35);
    // Circular: follow a curve (arc)
    const angle = d * (Math.PI / 6);
    return Math.sin(angle) * (width * 0.45);
  });

  const z = useTransform(distance, (d: number) => {
    if (!isCircular) return -Math.abs(d) * 400 - (Math.abs(d) < 0.1 ? 0 : 60);
    const angle = d * (Math.PI / 6);
    return Math.cos(angle) * 400 - 450;
  });

  const rotateY = useTransform(distance, (d: number) => {
    if (!isCircular) return d * -22;
    const angle = d * 30; // 30 degrees per book
    return angle;
  });

  const opacity = useTransform(distance, (d: number) => {
    const absD = Math.abs(d);
    if (!isCircular) {
      if (absD > 3) return 0;
      if (absD > 2) return 0.4 * (3 - absD);
      if (absD > 1) return 0.7 * (2 - absD) + 0.4 * (absD - 1);
      return 1 * (1 - absD) + 0.7 * absD;
    }
    // For circular, fade out as they go around the side
    return Math.max(0, 1 - absD * 0.25);
  });

  const scale = useTransform(distance, (d: number) => {
    const base = 1 - Math.abs(d) * 0.12;
    if (!isCircular) return base;
    return Math.max(0.6, 1 - Math.abs(d) * 0.1);
  });
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

