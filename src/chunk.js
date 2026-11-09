// Découpe en morceaux d'environ `taille` caractères avec chevauchement,
// en coupant de préférence sur un saut de paragraphe, puis une fin de phrase.
export function decouper(texte, taille = 1000, chevauchement = 150) {
  const propre = texte.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const chunks = [];
  let debut = 0;

  while (debut < propre.length) {
    let fin = Math.min(debut + taille, propre.length);
    if (fin < propre.length) {
      const fenetre = propre.slice(debut, fin);
      const coupe = Math.max(fenetre.lastIndexOf('\n\n'), fenetre.lastIndexOf('. '), fenetre.lastIndexOf('\n'));
      if (coupe > taille * 0.5) fin = debut + coupe + 1;
    }
    const morceau = propre.slice(debut, fin).trim();
    if (morceau.length > 20) chunks.push(morceau);
    if (fin >= propre.length) break;
    debut = Math.max(fin - chevauchement, debut + 1);
  }
  return chunks;
}
