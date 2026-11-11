// Vérifie ce que l'extraction lit réellement dans chaque fichier de test.
import { readFile } from 'node:fs/promises';
import { extraireTexte } from '../src/extract.js';

const dir = new URL('./fixtures/', import.meta.url);
const cas = [
  ['notes_python.txt', 'text/plain', [['boucle for', /boucle for/]]],
  ['cours_sql_mixte.pdf', 'application/pdf', [
    ['texte natif', /INNER JOIN/],
    ['texte dans une image (TANGO-47)', /TANGO-47/],
    ['schéma (Table clients)', /Table clients/],
  ]],
  ['cours_reseau_scanne.pdf', 'application/pdf', [['scan (port 443)', /443/]]],
  ['photosynthese.png', 'image/png', [['image (chloroplastes)', /chloroplaste/i]]],
];

for (const [fichier, type, marqueurs] of cas) {
  try {
    const { texte, methode } = await extraireTexte(await readFile(new URL(fichier, dir)), type);
    console.log(`\n${fichier} : méthode=${methode}, ${texte.length} caractères`);
    for (const [nom, re] of marqueurs) console.log(`  ${re.test(texte) ? 'trouvé  ' : 'ABSENT  '} ${nom}`);
  } catch (err) {
    console.log(`\n${fichier} : ERREUR ${err.message}`);
  }
}
