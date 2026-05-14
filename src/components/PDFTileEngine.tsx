import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { pdfjs } from '../lib/pdf';
import { useMotionValueEvent } from 'motion/react';

interface PDFTileEngineProps {
  pageNumber: number;
  pdf: pdfjs.PDFDocumentProxy;
  width: number;
  height: number;
  panX: any;
  panY: any;
  liveScale: any;
  committedScale: number;
  dims: { width: number, height: number };
  isVisible: boolean;
  sheetRelX: number; // For side-by-side positioning
}

// SINGLETON RENDER CANVAS to prevent iOS Safari 16-context limit crash
let globalSniperCanvas: HTMLCanvasElement | null = null;
let sniperMutex = Promise.resolve(); // MUTEX LOCK: Ensures only one page uses the singleton at a time

function getSniperCanvas(width: number, height: number) {
  if (!globalSniperCanvas) {
    globalSniperCanvas = document.createElement('canvas');
  }
  globalSniperCanvas.width = width;
  globalSniperCanvas.height = height;
  return globalSniperCanvas;
}

export const PDFTileEngine: React.FC<PDFTileEngineProps> = React.memo(({ 
  pageNumber, pdf, width, height, panX, panY, committedScale, dims, isVisible 
}) => {
  const measureRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfPage, setPdfPage] = useState<any>(null);
  const renderTimeout = useRef<any>(null);
  const currentRenderTask = useRef<any>(null);
  const currentTaskToken = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  // 0. Hydration Safe Mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // 1. Load PDF Page
  useEffect(() => {
    let active = true;
    pdf.getPage(pageNumber).then(page => {
      if (active) setPdfPage(page);
    });
    return () => { active = false; };
  }, [pdf, pageNumber]);

  // 2. The Native-Hardware Portal Render
  const drawHighRes = useCallback(async () => {
    if (!isVisible || !pdfPage || !measureRef.current || !canvasRef.current) return;
    
    // EXACT ON-SCREEN COORDINATES
    const rect = measureRef.current.getBoundingClientRect();
    
    // Screen bounds
    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // VISIBLE INTERSECTION
    const visLeft = Math.max(0, rect.left);
    const visTop = Math.max(0, rect.top);
    const visRight = Math.min(sw, rect.right);
    const visBottom = Math.min(sh, rect.bottom);

    const visWidth = visRight - visLeft;
    const visHeight = visBottom - visTop;

    const canvas = canvasRef.current;

    // If page is completely off-screen, clear canvas
    if (visWidth <= 0 || visHeight <= 0 || rect.width <= 0) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    // HARDWARE PIXELS
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const physicalWidth = Math.ceil(visWidth * dpr);
    const physicalHeight = Math.ceil(visHeight * dpr);

    if (currentRenderTask.current) {
      try {
        currentRenderTask.current.cancel();
      } catch (e) {
        // Ignore cancel errors
      }
      currentRenderTask.current = null;
    }

    // Generate a unique token for this specific render request
    const myToken = {};
    currentTaskToken.current = myToken;

    // MUTEX QUEUE: Wait in line for the Singleton Canvas
    sniperMutex = sniperMutex.then(async () => {
      // If the user panned again while we were waiting in line, abort this stale request
      if (currentTaskToken.current !== myToken) return;

      // Re-use the Singleton Canvas to completely prevent GPU context limit crashes on Mobile
      const offscreen = getSniperCanvas(physicalWidth, physicalHeight);
      const ctx = offscreen.getContext('2d', { alpha: false });
      if (!ctx) return;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, physicalWidth, physicalHeight);

      // PDF.JS MATH
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      
      // Scale the PDF up to match the exact physical Retina pixels of the screen intersection
      const renderScale = (rect.width * dpr) / baseViewport.width;

      // Shift the PDF camera to crop out the parts of the page that are off-screen
      const shiftXScreen = visLeft - rect.left;
      const shiftYScreen = visTop - rect.top;
      
      const renderViewport = pdfPage.getViewport({ 
        scale: renderScale,
        offsetX: -Math.round(shiftXScreen * dpr),
        offsetY: -Math.round(shiftYScreen * dpr)
      });

      const renderTask = pdfPage.render({
        canvasContext: ctx,
        viewport: renderViewport
      });
      
      currentRenderTask.current = renderTask;

      try {
        await renderTask.promise;
        
        // If this is still the active request, copy the image from the Singleton to our Portal Canvas
        if (currentTaskToken.current === myToken) {
          canvas.width = physicalWidth;
          canvas.height = physicalHeight;
          canvas.style.left = `${visLeft}px`;
          canvas.style.top = `${visTop}px`;
          canvas.style.width = `${visWidth}px`;
          canvas.style.height = `${visHeight}px`;
          
          const mainCtx = canvas.getContext('2d', { alpha: false });
          if (mainCtx) {
            mainCtx.drawImage(offscreen, 0, 0);
          }
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('PDF Sniper Render Error:', err);
        }
      }
    }).catch(console.error);
    
  }, [isVisible, pdfPage, committedScale, panX, panY]);

  // 3. Debounce Engine: Wait for motion to stop, hide sharp canvas during motion
  const scheduleRender = useCallback(() => {
    if (canvasRef.current) {
       canvasRef.current.style.opacity = '0';
    }
    clearTimeout(renderTimeout.current);
    renderTimeout.current = setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '1';
      drawHighRes();
    }, 150);
  }, [drawHighRes]);

  useEffect(() => {
    scheduleRender();
    return () => clearTimeout(renderTimeout.current);
  }, [committedScale, scheduleRender]);

  useMotionValueEvent(panX, "change", scheduleRender);
  useMotionValueEvent(panY, "change", scheduleRender);

  return (
    <>
      <div ref={measureRef} className="absolute inset-0 pointer-events-none" />
      {mounted && typeof document !== 'undefined' && createPortal(
        <canvas 
          ref={canvasRef} 
          className="fixed z-50 pointer-events-none transition-opacity duration-150" 
          style={{ width: 0, height: 0, top: 0, left: 0 }}
        />,
        document.body
      )}
    </>
  );
});

