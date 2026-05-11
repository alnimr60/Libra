import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { get } from 'idb-keyval';

/**
 * STEP 2 & 3: PDFPage Mount & Canvas Test
 */
function PDFPage({ pdf }: { pdf: pdfjs.PDFDocumentProxy }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    console.log('[PDFPage Mounted]');
    
    async function testRender() {
      if (!canvasRef.current || !pdf) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error("[STEP 3 FAIL] No 2d Context");
        return;
      }

      // STEP 3: Manual Pixel Test
      console.log("[STEP 3] Drawing Manual Test pattern...");
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'black';
      ctx.font = '40px sans-serif';
      ctx.fillText('CANVAS WORKS', 50, 100);

      try {
        // STEP 4: PDF Load Test
        console.log(`[STEP 4] Loading page 1...`);
        const page = await pdf.getPage(1);
        console.log('[PAGE LOADED]', page);

        // STEP 5: Simple Render
        const viewport = page.getViewport({ scale: 1 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        console.log(`[STEP 5] Render starting. size: ${viewport.width}x${viewport.height}`);

        // STEP 8: Remove all cancellation for test
        await page.render({
          canvasContext: ctx,
          viewport: viewport
        }).promise;

        console.log("[STEP 5 SUCCESS] PDF rendered.");
      } catch (err) {
        console.error("[RENDER FAIL] RAW ERROR:", err);
      }
    }

    testRender();
  }, [pdf]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <p style={{ color: 'white', position: 'absolute', top: 0, left: 0 }}>PDFPage Mounted</p>
      {/* STEP 6: Force Visibility */}
      <canvas 
        ref={canvasRef} 
        width={500} 
        height={700}
        style={{ 
          display: 'block', 
          background: 'white', 
          border: '4px solid blue',
          opacity: 1,
          visibility: 'visible',
          zIndex: 9999,
          position: 'relative',
          margin: 'auto'
        }} 
      />
    </div>
  );
}

export default function PDFReader({ book }: any) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);

  useEffect(() => {
    // STEP 7: Worker Test
    console.log("[STEP 7] pdfjs version:", pdfjs.version);
    console.log("[STEP 7] worker loaded:", !!(pdfjs as any).GlobalWorkerOptions?.workerSrc);

    async function load() {
      if (!book.fileDataId) return;
      const data = await get<Uint8Array>(book.fileDataId);
      if (!data) return;
      const doc = await pdfjs.getDocument({ data }).promise;
      setPdf(doc);
    }
    load();
  }, [book.fileDataId]);

  // STEP 1: HARD RENDER TEST
  // Change to false to proceed to Step 2-8
  const FORCE_RED_TEST = false; 

  if (FORCE_RED_TEST) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'red', zIndex: 99999, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        TEST (IF YOU SEE THIS, REACT MOUNTED)
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      overflow: 'hidden', 
      background: 'black', 
      position: 'fixed', 
      inset: 0, 
      zIndex: 99998,
      border: '4px solid red' // Red border around viewport
    }}>
      {pdf ? (
        <PDFPage pdf={pdf} />
      ) : (
        <div style={{ color: 'white', padding: '20px' }}>Loading PDF Document...</div>
      )}
    </div>
  );
}
