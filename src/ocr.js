import { createWorker } from 'tesseract.js';
import { config } from './config.js';

// Crée le worker en transformant les erreurs internes (ex. téléchargement des données de langue
// impossible) en rejet de promesse : sans errorHandler, tesseract.js lève l'erreur hors de toute
// portée try/catch et fait tomber tout le processus Node.
function creerWorker() {
  return new Promise((resolve, reject) => {
    createWorker(config.OCR_LANGS, 1, { errorHandler: reject }).then(resolve, reject);
  });
}

// OCR d'une liste d'images (Buffer PNG/JPEG). Un seul worker pour tout le lot.
// Les données de langue (fra/eng) sont téléchargées au premier lancement.
export async function ocrBuffers(buffers) {
  let worker;
  try {
    worker = await creerWorker();
  } catch (err) {
    throw Object.assign(new Error(`OCR indisponible : ${String(err.message ?? err).slice(0, 200)}`), { status: 503 });
  }
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
