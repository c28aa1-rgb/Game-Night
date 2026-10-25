// Original geometric artwork for Game Night.
const sharp = require('sharp');
const path = require('path');
const four = '<path d="M154 72H115L46 182V222H142V278H187V222H211V181H187V72H154ZM142 126V181H88L142 96V126Z" fill="#123D39"/>';
const tile = (x,y,angle,face,edge) => `<g transform="translate(${x} ${y}) rotate(${angle} 135 180)" filter="url(#shadow)"><rect y="14" width="265" height="350" rx="30" fill="${edge}"/><rect width="265" height="350" rx="30" fill="${face}"/><rect x="12" y="12" width="241" height="326" rx="20" fill="none" stroke="#FFF4DC" stroke-opacity=".4"/>${four}<circle cx="32" cy="32" r="4" fill="#123D39"/><circle cx="233" cy="318" r="4" fill="#123D39"/></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1000" viewBox="0 0 1100 1000">
<defs><filter id="shadow" x="-40%" y="-30%" width="180%" height="190%"><feDropShadow dx="0" dy="25" stdDeviation="24" flood-color="#061E1B" flood-opacity=".48"/></filter></defs>
<g fill="none" stroke="#FFF4DC" opacity=".12"><ellipse cx="555" cy="598" rx="470" ry="236"/><ellipse cx="555" cy="598" rx="445" ry="211"/></g>
${tile(97,318,-12,'#F28C78','#BD745E')}
<g transform="translate(410 214) rotate(5 135 180)" filter="url(#shadow)">
<rect y="16" width="265" height="350" rx="30" fill="#B89952"/><rect width="265" height="350" rx="30" fill="#F2D481"/><rect x="12" y="12" width="241" height="326" rx="20" fill="none" stroke="#FFF4DC" stroke-opacity=".65"/>
<circle cx="132.5" cy="175" r="87" fill="#0C2C29"/><circle cx="132.5" cy="180" r="76" fill="#123D39"/><circle cx="132.5" cy="180" r="67" fill="none" stroke="#F2D481" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="4 8"/><path d="M124 180h17M132.5 171.5v17" stroke="#F2D481" stroke-opacity=".6" stroke-width="1.5"/></g>
${tile(722,326,14,'#B9ACD8','#7D729A')}
<path d="M540 610c-60 46-66 100-14 126" fill="none" stroke="#FFF4DC" stroke-opacity=".25" stroke-width="2" stroke-dasharray="3 10"/>
<g transform="translate(605 772) rotate(-18)" filter="url(#shadow)"><ellipse cy="10" rx="77" ry="63" fill="#C2A982"/><ellipse rx="77" ry="63" fill="#FFF4DC"/><ellipse rx="62" ry="49" fill="none" stroke="#123D39" stroke-opacity=".22" stroke-width="2"/><g fill="#123D39"><circle cx="-21" cy="-17" r="7"/><circle cx="21" cy="-17" r="7"/><circle cx="-21" cy="17" r="7"/><circle cx="21" cy="17" r="7"/></g></g>
</svg>`;
sharp(Buffer.from(svg)).png().toFile(path.join(__dirname, '../hub/public/art/404-missing-piece.png'))
  .then(info => console.log(`404 artwork: ${info.width} x ${info.height}, ${info.size} bytes`));
