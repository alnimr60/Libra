import * as pdfjs from 'pdfjs-dist';

// Use Vite's URL import for the worker to ensure version matching and local serving
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

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
  // Strip out spaces, digits, and common punctuation for accurate character counting
  const cleanedText = text.replace(/[\s\d.,!?'"()[\]{}:;\-*_+=&^%$#@~`\\/|<>\u200e\u200f\u202a-\u202e]/g, '');
  if (cleanedText.length === 0) return 'ltr';

  // Arabic, Hebrew, Persian, Urdu unicode ranges
  const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  
  const rtlMatch = cleanedText.match(rtlRegex);
  const rtlCharsCount = rtlMatch ? rtlMatch.length : 0;
  
  // If more than 20% of the significant characters are RTL, classify it as RTL
  return (rtlCharsCount / cleanedText.length) > 0.2 ? 'rtl' : 'ltr';
}

export async function extractPDFSampleText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let sampleText = '';

  const pagesToSample = [1, Math.floor(pdf.numPages / 2), pdf.numPages];
  for (const pageNum of pagesToSample) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .substring(0, 500); // 500 chars per page
      sampleText += text + '\n';
    } catch (e) {
      console.warn(`Failed specifically to sample text from page ${pageNum}`);
    }
  }

  return sampleText.trim();
}
