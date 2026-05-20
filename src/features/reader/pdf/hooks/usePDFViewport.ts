import React, { useState, useEffect, useRef } from 'react';
import { useMotionValue, animate, MotionValue } from 'motion/react';

export enum GestureMode {
  Idle = 'Idle',
  PinchZooming = 'PinchZooming',
}

interface UsePDFViewportProps {
  readerContainerRef: React.RefObject<HTMLDivElement>;
}

export function usePDFViewport({ readerContainerRef }: UsePDFViewportProps) {
  const gestureMode = useRef<GestureMode>(GestureMode.Idle);
  const isAnimatingZoom = useRef(false);
  const [committedScale, setCommittedScale] = useState(1.0);
  const liveScale = useMotionValue(1.0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  const pinchRef = useRef({ 
    initialDist: 0, 
    initialScale: 1, 
    initialPanX: 0, 
    initialPanY: 0, 
    midpoint: { x: 0, y: 0 } 
  });

  useEffect(() => {
    animate(liveScale, committedScale, { type: 'spring', stiffness: 300, damping: 30 });
    if (committedScale <= 1.05) {
      animate(panX, 0, { type: 'spring', stiffness: 300, damping: 30 });
      animate(panY, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [committedScale, liveScale, panX, panY]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && !isAnimatingZoom.current) {
      gestureMode.current = GestureMode.PinchZooming;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      if (!readerContainerRef.current) return;
      const rect = readerContainerRef.current.getBoundingClientRect();
      pinchRef.current = {
        initialDist: dist,
        initialScale: liveScale.get(),
        initialPanX: panX.get(),
        initialPanY: panY.get(),
        midpoint: { 
          x: (t1.clientX + t2.clientX) / 2 - (rect.left + rect.width / 2), 
          y: (t1.clientY + t2.clientY) / 2 - (rect.top + rect.height / 2) 
        }
      };
      liveScale.stop(); 
      panX.stop(); 
      panY.stop();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (gestureMode.current === GestureMode.PinchZooming && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      const nextScale = Math.max(0.5, Math.min(6, pinchRef.current.initialScale * (dist / pinchRef.current.initialDist)));
      liveScale.set(nextScale);
      const sDelta = nextScale / pinchRef.current.initialScale;
      const p = pinchRef.current.midpoint;
      panX.set(p.x - (p.x - pinchRef.current.initialPanX) * sDelta);
      panY.set(p.y - (p.y - pinchRef.current.initialPanY) * sDelta);
    }
  };

  const handleTouchEnd = () => {
    gestureMode.current = GestureMode.Idle;
    setCommittedScale(liveScale.get());
  };

  return {
    committedScale,
    setCommittedScale,
    liveScale,
    panX,
    panY,
    gestureMode,
    isAnimatingZoom,
    pinchRef,
    handlers: {
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd
    }
  };
}
