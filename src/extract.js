import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { ocrBuffers } from './ocr.js';
import { config } from './config.js';

const run = promisify(execFile);

// Un PDF scanné contient très peu de texte natif : en dessous de ce seuil par page, on bascule en OCR.
const MIN_CHARS_PAR_PAGE = 40;

async function pdfEnImages(buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ocr-'));
  try {
    await writeFile(path.join(dir, 'in.pdf'), buffer);
    // pdftoppm fait partie de poppler-utils (apt install poppler-utils / brew install poppler)
    await run('pdftoppm', [
      '-r', '200', '-png', '-l', String(config.OCR_MAX_PAGES),
      path.join(dir, 'in.pdf'), path.join(dir, 'page'),
    ]);
    const fichiers = (await readdir(dir)).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
    return await Promise.all(fichiers.map((f) => readFile(path.join(dir, f))));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error("OCR des PDF scannés impossible : 'pdftoppm' (poppler-utils) n'est pas installé sur le serveur.");
    }
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Retourne { texte, methode } avec methode = 'texte' | 'pdf' | 'ocr-image' | 'ocr-pdf'
export async function extraireTexte(buffer, mimetype) {
  if (mimetype === 'text/plain') {
    return { texte: buffer.toString('utf8'), methode: 'texte' };
  }

  if (mimetype === 'image/png' || mimetype === 'image/jpeg') {
    const [texte] = await ocrBuffers([buffer]);
    return { texte, methode: 'ocr-image' };
  }

  if (mimetype === 'application/pdf') {
    const natif = await pdfParse(buffer);
    const texteNatif = (natif.text ?? '').trim();
    if (texteNatif.length >= MIN_CHARS_PAR_PAGE * Math.max(natif.numpages, 1)) {
      return { texte: texteNatif, methode: 'pdf' };
    }
    const images = await pdfEnImages(buffer);
    const pages = await ocrBuffers(images);
    return { texte: pages.join('\n\n'), methode: 'ocr-pdf' };
  }

  throw new Error(`Type de fichier non supporté : ${mimetype}`);
}
