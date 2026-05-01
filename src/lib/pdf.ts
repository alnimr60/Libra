import * as pdfjs from 'pdfjs-dist';

// For PDF.js 5+, we must use matching versions for the main lib and the worker.
// Using the .mjs version as the error indicated a dynamic import attempt.
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.7.284/build/pdf.worker.mjs`;

export { pdfjs };
export interface PDFMetadata {
  pageCount: number;
  coverUrl?: string;
}

export async function extractPDFMetadata(file: File): Promise<PDFMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
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
