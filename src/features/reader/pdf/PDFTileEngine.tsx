import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pdfjs } from '../../../lib/pdf';
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
  sheetRelX: number;
}

export const PDFTileEngine: React.FC<PDFTileEngineProps> = React.memo(({ 
  pageNumber, pdf, width, height, panX, panY, committedScale, isVisible 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfPage, setPdfPage] = useState<any>(null);
  const renderTimeout = useRef<any>(null);
  const currentRenderTask = useRef<any>(null);
  const baseRenderTask = useRef<any>(null);
  const renderGeneration = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (offscreenRef.current) {
        offscreenRef.current.width = 0;
        offscreenRef.current.height = 0;
        offscreenRef.current = null;
      }
      if (baseRenderTask.current) {
        try { baseRenderTask.current.cancel(); } catch (_) { /* ignore */ }
      }
      if (currentRenderTask.current) {
        try { currentRenderTask.current.cancel(); } catch (_) { /* ignore */ }
      }
    };
  }, []);

  const getOffscreen = useCallback((w: number, h: number) => {
    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
    offscreenRef.current.width = w;
    offscreenRef.current.height = h;
    return offscreenRef.current;
  }, []);

  // Load PDF page
  useEffect(() => {
    let active = true;
    pdf.getPage(pageNumber).then(page => {
      if (active) setPdfPage(page);
    });
    return () => { active = false; };
  }, [pdf, pageNumber]);

  // Base render (1x scale, drawn once when page loads)
  useEffect(() => {
    let isActive = true;
    if (!pdfPage || !baseCanvasRef.current || !isVisible) return;
    
    const drawBase = async () => {
      if (baseRenderTask.current) {
        try { 
          baseRenderTask.current.cancel(); 
          await baseRenderTask.current.promise;
        } catch (_) { /* ignore */ }
      }

      if (!isActive) return;

      const canvas = baseCanvasRef.current;
      if (!canvas) return;
      
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const fitScale = width / viewport.width;
      
      const physicalWidth = Math.ceil(width * dpr);
      const physicalHeight = Math.ceil(height * dpr);
      
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, physicalWidth, physicalHeight);

      const renderViewport = pdfPage.getViewport({ scale: fitScale * dpr });
      
      baseRenderTask.current = pdfPage.render({
        canvasContext: ctx,
        viewport: renderViewport
      });

      try {
        await baseRenderTask.current.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException' && !err.message?.includes('cancelled')) {
          console.error('[PDFTileEngine] Base render error:', err.message || err);
        }
      }
    };
    
    drawBase();

    return () => {
      isActive = false;
      if (baseRenderTask.current) {
        try { baseRenderTask.current.cancel(); } catch (_) { /* ignore */ }
      }
    };
  }, [pdfPage, width, height, isVisible]);

  // High-resolution render (zoomed in viewport)
  const drawHighRes = useCallback(async () => {
    if (!isVisible || !pdfPage || !containerRef.current || !canvasRef.current) return;
    
    // We only need to redraw if zoomed in
    if (committedScale <= 1.05) {
      canvasRef.current.style.opacity = '0';
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // Calculate visible intersection
    const visLeft = Math.max(0, rect.left);
    const visTop = Math.max(0, rect.top);
    const visRight = Math.min(sw, rect.right);
    const visBottom = Math.min(sh, rect.bottom);
    const visWidth = visRight - visLeft;
    const visHeight = visBottom - visTop;

    const canvas = canvasRef.current;

    if (visWidth <= 0 || visHeight <= 0 || rect.width <= 0) {
      canvas.style.opacity = '0';
      return;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const physicalWidth = Math.ceil(visWidth * dpr);
    const physicalHeight = Math.ceil(visHeight * dpr);

    if (currentRenderTask.current) {
      try { 
        currentRenderTask.current.cancel(); 
        await currentRenderTask.current.promise;
      } catch (_) { }
    }

    const myGeneration = ++renderGeneration.current;
    if (renderGeneration.current !== myGeneration) return;

    const offscreen = getOffscreen(physicalWidth, physicalHeight);
    const ctx = offscreen.getContext('2d', { alpha: false });
    if (!ctx) return;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, physicalWidth, physicalHeight);

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const renderScale = (rect.width * dpr) / baseViewport.width;
    
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
      
      if (renderGeneration.current === myGeneration && canvasRef.current) {
        canvas.width = physicalWidth;
        canvas.height = physicalHeight;
        
        // Position relative to the container! Not the screen!
        // We use percentages to ensure it sticks properly even if the container transforms
        const leftPercent = ((visLeft - rect.left) / rect.width) * 100;
        const topPercent = ((visTop - rect.top) / rect.height) * 100;
        const widthPercent = (visWidth / rect.width) * 100;
        const heightPercent = (visHeight / rect.height) * 100;

        canvas.style.left = `${leftPercent}%`;
        canvas.style.top = `${topPercent}%`;
        canvas.style.width = `${widthPercent}%`;
        canvas.style.height = `${heightPercent}%`;
        
        const mainCtx = canvas.getContext('2d', { alpha: false });
        if (mainCtx) mainCtx.drawImage(offscreen, 0, 0);
        
        canvas.style.opacity = '1';
      }
    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException' && !err.message?.includes('cancelled')) {
        console.error('[PDFTileEngine] High-res render error:', err.message || err);
      }
    }
  }, [isVisible, pdfPage, committedScale, panX, panY, getOffscreen]);

  const scheduleRender = useCallback(() => {
    clearTimeout(renderTimeout.current);
    renderTimeout.current = setTimeout(() => {
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
    <div ref={containerRef} className="absolute inset-0 w-full h-full">
      {/* Base layer: 1x resolution, always visible, scales up natively during pinch */}
      <canvas 
        ref={baseCanvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none" 
      />
      
      {/* High-res overlay: Sharpens the visible area when zoomed in */}
      <canvas 
        ref={canvasRef} 
        className="absolute z-10 pointer-events-none transition-opacity duration-200" 
        style={{ width: 0, height: 0, top: 0, left: 0, opacity: 0 }}
      />
    </div>
  );
});