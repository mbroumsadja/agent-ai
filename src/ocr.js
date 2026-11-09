import { createWorker } from 'tesseract.js';
import { config } from './config.js';

// OCR d'une liste d'images (Buffer PNG/JPEG). Un seul worker pour tout le lot.
// Les données de langue (fra/eng) sont téléchargées au premier lancement.
export async function ocrBuffers(buffers) {
  const worker = await createWorker(config.OCR_LANGS);
  try {
    const pages = [];
    for (const buf of buffers) {
      const { data } = await worker.recognize(buf);
      pages.push(data.text.trim());
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
