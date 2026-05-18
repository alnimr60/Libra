import * as React from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, useMotionValue, useTransform, useSpring, animate, AnimatePresence } from 'motion/react';
import { Book, LanguageCode } from '../types';
import { cn } from '../lib/utils';

interface BookCarouselProps {
  books: Book[];
  selectedIndex: number;
  onChange: (index: number) => void;
  onOpen?: (book: Book) => void;
  style?: 'linear' | 'circular';
  language?: LanguageCode;
}

export default function BookCarousel({ books, selectedIndex, onChange, onOpen, style = 'linear', language = 'en' }: BookCarouselProps) {
  const isRTL = ['ar', 'ur'].includes(language);
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
    stiffness: 260,
    damping: 32,
    mass: 0.5
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

  // Helper for circular modulo that always returns a positive value
  const mod = (n: number, m: number) => ((n % m) + m) % m;

  // Helper to find the best distance to a target index on a circle, 
  // optionally respecting the direction of velocity to avoid "snap-back"
  const wrapShortest = (current: number, target: number, total: number, velocity: number = 0) => {
    const normCurrent = mod(current, total);
    const diff = (target - normCurrent) % total;
    let shortest = ((diff + total / 2) % total + total) % total - total / 2;
    
    // If we have significant velocity and it's pointing away from our "shortest" path,
    // we should go the long way around to preserve the feeling of momentum.
    // This prevents the carousel from reversing direction when we flick it hard.
    const VELOCITY_THRESHOLD = 0.5; 
    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      const vDir = velocity > 0 ? 1 : -1;
      const sDir = shortest > 0 ? 1 : -1;
      
      if (vDir !== sDir && Math.abs(shortest) > 0.1) {
        shortest += vDir * total;
      }
    }
    
    return shortest;
  };

  // Sync virtualIndex with prop changes (when user clicks dots or external buttons)
  useEffect(() => {
    if (!isDragging) {
      const currentV = virtualIndex.get();
      let target = selectedIndex;
      
      if (style === 'circular') {
        const delta = wrapShortest(currentV, selectedIndex, books.length, lastVelocity.current);
        target = currentV + delta;
      }

      // Only animate if we aren't already very close to the target
      if (Math.abs(currentV - target) > 0.001 || lastVelocity.current !== 0) {
        animate(virtualIndex, target, {
          type: 'spring',
          stiffness: 260,
          damping: 32,
          mass: 0.5,
          velocity: lastVelocity.current
        });
        // Reset velocity after handoff
        lastVelocity.current = 0;
      }
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
    const velocity = isRTL ? -info.velocity.x : info.velocity.x;
    
    // Project velocity into indices/s and invert (dragging right decreases index)
    // Capping results in more predictable behavior at extreme flick speeds
    const cappedVelocity = Math.max(-3000, Math.min(3000, velocity));
    const velocityInIndices = -cappedVelocity / spacing;
    
    // Calculate final index based on position and momentum projection
    const currentVal = virtualIndex.get();
    const projectionPower = 0.3; // Project 0.3 seconds ahead for snappier feel
    const predictedStop = currentVal + (velocityInIndices * projectionPower);
    
    // Snap to the nearest integer index
    let nextIndex = Math.round(predictedStop);
    
    // Directional bias: if we have a strong velocity but rounding would take us backward,
    // push it forward to avoid an awkward "snap back" against the flick direction.
    const vMag = Math.abs(velocityInIndices);
    if (vMag > 0.5) {
      const vDir = velocityInIndices > 0 ? 1 : -1;
      const roundingError = nextIndex - predictedStop; // if positive, we rounded UP
      const rDir = roundingError > 0 ? 1 : -1;
      
      if (vDir !== rDir && Math.abs(roundingError) > 0.2) {
        // e.g. velocity is positive (flick LEFT), but we rounded DOWN to nextIndex.
        // We should probably have rounded UP.
        nextIndex += vDir;
      }
    }

    if (style === 'linear') {
      nextIndex = Math.max(0, Math.min(books.length - 1, nextIndex));
    } else {
      // Circular: just ensure it's a valid integer (mod handled by onChange)
      nextIndex = Math.round(nextIndex);
    }
    
    setIsDragging(false);
    lastVelocity.current = velocityInIndices;

    // Keep ref true for a short duration to prevent accidental onTap triggers
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 150);

    // If index changed, notify parent
    const finalBookIndex = style === 'linear' ? nextIndex : mod(nextIndex, books.length);
    if (finalBookIndex !== selectedIndex) {
      onChange(finalBookIndex);
    } else {
      // If we didn't change the active book (or we are in circular and landed a full rotation away),
      // we still need to settle correctly from where we are.
      let target = nextIndex;
      if (style === 'circular') {
        target = currentVal + wrapShortest(currentVal, mod(nextIndex, books.length), books.length, velocityInIndices);
      }

      animate(virtualIndex, target, {
        type: 'spring',
        stiffness: 260,
        damping: 32,
        mass: 0.5,
        velocity: velocityInIndices
      });
      lastVelocity.current = 0;
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
    const dragProgress = (isRTL ? -info.offset.x : info.offset.x) / spacing;
    virtualIndex.set(baseIndex.current - dragProgress);
  };

  return (
    <div 
      ref={containerRef}
      dir="ltr"
      className="relative w-full h-full flex items-center justify-center overflow-visible perspective-[2000px] touch-pan-y"
    >
      {/* Interaction Layer */}
      <motion.div 
        className={cn(
          "absolute inset-0 z-50 cursor-grab active:cursor-grabbing touch-pan-y",
          isDragging && "cursor-grabbing"
        )}
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
          
          const isLeftClick = clickX < center - bookWidth;
          const isRightClick = clickX > center + bookWidth;

          if (isRTL ? isRightClick : isLeftClick) {
            const prev = (selectedIndex - 1 + books.length) % books.length;
            if (style === 'linear') {
              if (selectedIndex > 0) onChange(selectedIndex - 1);
            } else {
              onChange(prev);
            }
          } else if (isRTL ? isLeftClick : isRightClick) {
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
            isRTL={isRTL}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselBook({ book, index, virtualIndex, width, isActive, isCircular, totalBooks, isRTL }: { 
  book: Book, 
  index: number, 
  virtualIndex: any, 
  width: number,
  isActive: boolean,
  isCircular: boolean,
  totalBooks: number,
  isRTL: boolean,
  key?: React.Key
}) {
  // Compute distance from current virtual focus
  const distance = useTransform(virtualIndex, (v: number) => {
    if (!isCircular) return index - v;
    
    // Shortest path on a circle (using mod helper logic)
    const diff = (index - v) % totalBooks;
    const wrapped = ((diff + totalBooks / 2) % totalBooks + totalBooks) % totalBooks - totalBooks / 2;
    return wrapped;
  });
  
  // Transform distance into visual properties
  const x = useTransform(distance, (d: number) => {
    const factor = isRTL ? -1 : 1;
    return d * (width * 0.35) * factor;
  });

  const z = useTransform(distance, (d: number) => -Math.abs(d) * 400 - (Math.abs(d) < 0.1 ? 0 : 60));

  const rotateY = useTransform(distance, (d: number) => {
    const factor = isRTL ? -1 : 1;
    return d * -22 * factor;
  });

  const opacity = useTransform(distance, (d: number) => {
    const absD = Math.abs(d);
    // Show up to 4 books on each side for a fuller dashboard feel
    if (absD > 4) return 0;
    if (absD > 3) return 0.3 * (4 - absD);
    if (absD > 2) return 0.5 * (3 - absD) + 0.3 * (absD - 2);
    if (absD > 1) return 0.8 * (2 - absD) + 0.5 * (absD - 1);
    return 1 * (1 - absD) + 0.8 * absD;
  });

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

