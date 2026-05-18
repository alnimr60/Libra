import * as pdfjs from 'pdfjs-dist';

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

// Version-matched worker from UNPKG ensures the build never fails due to local path resolution issues
const PDFJS_VERSION = pdfjs.version;
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

export { pdfjs };
export interface PDFMetadata {
  pageCount: number;
  coverUrl?: string;
}

export async function extractPDFMetadata(file: File): Promise<PDFMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ 
    data: arrayBuffer,
    stopAtErrors: false,
    enableXfa: true,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
    cMapPacked: true,
    disableRange: true,
    disableStream: true
  });
  const pdf = await loadingTask.promise;

  const metadata: PDFMetadata = {
    pageCount: pdf.numPages,
  };

  try {
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
  // Include Arabic, Hebrew, Syriac, Thaana, N'Ko, and other RTL ranges
  const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  
  // Include Latin, Cyrillic (Russian), Devanagari (Hindi), CJK (Chinese/Japanese/Korean), etc
  const ltrRegex = /[a-zA-Z\u0400-\u04FF\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g;
  
  const rtlMatch = text.match(rtlRegex);
  const ltrMatch = text.match(ltrRegex);
  
  const rtlCount = rtlMatch ? rtlMatch.length : 0;
  const ltrCount = ltrMatch ? ltrMatch.length : 0;
  
  return rtlCount > ltrCount ? 'rtl' : 'ltr';
}

export async function samplePDFText(pdf: pdfjs.PDFDocumentProxy): Promise<string> {
  let sampleText = '';
  const pagesToSample = [1, Math.floor(pdf.numPages / 2), pdf.numPages].filter(p => p > 0 && p <= pdf.numPages);
  const uniquePages = [...new Set(pagesToSample)];
  
  for (const pageNum of uniquePages) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => (item as any).str)
        .join(' ')
        .substring(0, 1000); 
      sampleText += text + '\n';
    } catch (e) {}
  }
  return sampleText.trim();
}

export async function extractPDFSampleText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ 
    data: new Uint8Array(arrayBuffer),
    stopAtErrors: false,
    enableXfa: true,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
    cMapPacked: true,
    disableRange: true,
    disableStream: true
  });
  const pdf = await loadingTask.promise;
  return samplePDFText(pdf);
}
