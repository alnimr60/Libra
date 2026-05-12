import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';

// Polyfill Promise.withResolvers for older environments (e.g. iOS < 17.4)
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Use Vite's URL import for the worker to ensure version matching and local serving
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

// For PDF.js 3+, we must use matching versions for the main lib and the worker.
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export { pdfjs };
export interface PDFMetadata {
  pageCount: number;
  coverUrl?: string;
}

const version = pdfjs.version;

export async function extractPDFMetadata(file: File): Promise<PDFMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ 
    data: arrayBuffer,
    stopAtErrors: false,
    enableXfa: true,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${version}/cmaps/`,
    cMapPacked: true,
    disableRange: true,
    disableStream: true
  });
  const pdf = await loadingTask.promise;

  const metadata: PDFMetadata = {
    pageCount: pdf.numPages,
  };

  try {
    // Attempt to extract the first page as a cover
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (context) {
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
        // @ts-ignore
        canvas: canvas, 
      }).promise;

      metadata.coverUrl = canvas.toDataURL('image/jpeg', 0.8);
    }
  } catch (error) {
    console.error('Failed to extract PDF cover:', error);
  }

  return metadata;
}

export function detectDirectionFromText(text: string): 'ltr' | 'rtl' {
  if (!text) return 'ltr';
  
  // As requested:
  // Arabic script ranges: \u0600-\u06FF \u0750-\u077F \u08A0-\u08FF \uFB50-\uFDFF \uFE70-\uFEFF
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const latinRegex = /[a-zA-Z]/g;
  
  const arabicMatch = text.match(arabicRegex);
  const latinMatch = text.match(latinRegex);
  
  const arabicCount = arabicMatch ? arabicMatch.length : 0;
  const latinCount = latinMatch ? latinMatch.length : 0;
  
  const detected = arabicCount > latinCount ? 'rtl' : 'ltr';
  
  console.log(`[DirectionDetection] Results:`, {
    arabicCount,
    latinCount,
    detected
  });
  
  return detected;
}

export async function samplePDFText(pdf: pdfjs.PDFDocumentProxy): Promise<string> {
  let sampleText = '';
  // Sample: first, middle, last
  const pagesToSample = [1, Math.floor(pdf.numPages / 2), pdf.numPages].filter(p => p > 0 && p <= pdf.numPages);
  const uniquePages = [...new Set(pagesToSample)];
  
  console.log(`[DirectionDetection] Sampling pages: ${uniquePages.join(', ')}`);

  for (const pageNum of uniquePages) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => (item as any).str)
        .join(' ')
        .substring(0, 1000); // 1000 chars per page
      sampleText += text + '\n';
    } catch (e) {
      console.warn(`[DirectionDetection] Failed to sample text from page ${pageNum}`, e);
    }
  }
  
  return sampleText.trim();
}

export async function extractPDFSampleText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ 
    data: new Uint8Array(arrayBuffer),
    stopAtErrors: false,
    enableXfa: true,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    disableRange: true,
    disableStream: true
  });
  const pdf = await loadingTask.promise;
  return samplePDFText(pdf);
}
