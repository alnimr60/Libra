import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  pageNumber, pdf, width, height, panX, panY, committedScale, dims, isVisible, sheetRelX 
}) => {
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

  // 2. The Adobe-style "Sniper" Render
  const drawHighRes = useCallback(async () => {
    if (!isVisible || !pdfPage || !canvasRef.current || !dims.width) return;
    
    // Calculate page position relative to the center of the screen
    const pageScreenLeft = panX.get() + (dims.width / 2) + (sheetRelX * committedScale);
    const pageScreenTop = panY.get() + (dims.height / 2) - (height * committedScale / 2);

    // Create a bounding box for the screen (with a 10% buffer for smooth panning)
    const bufferX = dims.width * 0.1;
    const bufferY = dims.height * 0.1;
    const screenBox = {
      left: -bufferX,
      top: -bufferY,
      right: dims.width + bufferX,
      bottom: dims.height + bufferY
    };

    // Calculate the exact intersection of the screen box and the scaled PDF page
    const visLeftScreen = Math.max(screenBox.left, pageScreenLeft);
    const visTopScreen = Math.max(screenBox.top, pageScreenTop);
    const visRightScreen = Math.min(screenBox.right, pageScreenLeft + (width * committedScale));
    const visBottomScreen = Math.min(screenBox.bottom, pageScreenTop + (height * committedScale));

    const visWidthScreen = visRightScreen - visLeftScreen;
    const visHeightScreen = visBottomScreen - visTopScreen;

    // If the page is off-screen, clear the canvas memory instantly
    if (visWidthScreen <= 0 || visHeightScreen <= 0) {
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
      return;
    }

    // Convert from Screen space down to Logical Page CSS space
    const logicalLeft = (visLeftScreen - pageScreenLeft) / committedScale;
    const logicalTop = (visTopScreen - pageScreenTop) / committedScale;
    const logicalWidth = visWidthScreen / committedScale;
    const logicalHeight = visHeightScreen / committedScale;

    // Scale up by Device Pixel Ratio for Retina/Mobile clarity
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const physicalWidth = Math.ceil(visWidthScreen * dpr);
    const physicalHeight = Math.ceil(visHeightScreen * dpr);

    const canvas = canvasRef.current;
    
    // Cancel any older render if the user scrolled again
    if (currentRenderTask.current) {
      currentRenderTask.current.cancel();
      currentRenderTask.current = null;
    }

    // Prepare a temporary offscreen canvas so the old image stays visible until the new one is ready
    const offscreen = document.createElement('canvas');
    offscreen.width = physicalWidth;
    offscreen.height = physicalHeight;
    const ctx = offscreen.getContext('2d', { alpha: false });
    if (!ctx) return;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, physicalWidth, physicalHeight);

    // Calculate exact PDF zoom and camera shift
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const fitScale = width / baseViewport.width;
    const renderScale = fitScale * committedScale * dpr;

    const renderViewport = pdfPage.getViewport({ 
      scale: renderScale,
      offsetX: -Math.round(logicalLeft * committedScale * dpr),
      offsetY: -Math.round(logicalTop * committedScale * dpr)
    });

    // Command PDF.js to render ONLY this specific rectangle
    const renderTask = pdfPage.render({
      canvasContext: ctx,
      viewport: renderViewport
    });
    
    currentRenderTask.current = renderTask;

    try {
      await renderTask.promise;
      
      // Safety check: Make sure this is still the active request
      if (currentRenderTask.current === renderTask) {
        canvas.width = physicalWidth;
        canvas.height = physicalHeight;
        canvas.style.left = `${logicalLeft}px`;
        canvas.style.top = `${logicalTop}px`;
        canvas.style.width = `${logicalWidth}px`;
        canvas.style.height = `${logicalHeight}px`;
        
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
  }, [isVisible, pdfPage, committedScale, panX, panY, dims, width, height, sheetRelX]);

  // 3. Debounce Engine: Wait 150ms after the user STOPS panning/zooming before firing the sniper
  const scheduleRender = useCallback(() => {
    clearTimeout(renderTimeout.current);
    renderTimeout.current = setTimeout(drawHighRes, 150);
  }, [drawHighRes]);

  useEffect(() => {
    scheduleRender();
    return () => clearTimeout(renderTimeout.current);
  }, [committedScale, scheduleRender]);

  useMotionValueEvent(panX, "change", scheduleRender);
  useMotionValueEvent(panY, "change", scheduleRender);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute z-10 pointer-events-none origin-top-left" 
      style={{ width: 0, height: 0 }}
    />
  );
});

