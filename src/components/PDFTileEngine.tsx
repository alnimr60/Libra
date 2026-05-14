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

export const PDFTileEngine: React.FC<PDFTileEngineProps> = React.memo(({ 
  pageNumber, pdf, width, height, panX, panY, committedScale, dims, isVisible 
}) => {
  const measureRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfPage, setPdfPage] = useState<any>(null);
  const renderTimeout = useRef<any>(null);
  const currentRenderTask = useRef<any>(null);

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
    // getBoundingClientRect calculates the final physical screen position
    // AFTER all CSS transforms (panX, panY, scale) have been applied by the browser.
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
    if (visWidth <= 0 || visHeight <= 0) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    // HARDWARE PIXELS
    // We bypass CSS scaling completely to avoid mobile browser blurring
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const physicalWidth = Math.ceil(visWidth * dpr);
    const physicalHeight = Math.ceil(visHeight * dpr);

    if (currentRenderTask.current) {
      currentRenderTask.current.cancel();
      currentRenderTask.current = null;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = physicalWidth;
    offscreen.height = physicalHeight;
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
      
      if (currentRenderTask.current === renderTask) {
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
      {typeof document !== 'undefined' && createPortal(
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

