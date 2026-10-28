// Scans the media/ folder and writes manifest.json (no dependencies).
// Runs automatically via GitHub Actions whenever files in media/ change.
//
// Optional titles: put a text file next to a media file with ".txt" added,
// e.g.  media/Sales/q3.pdf  +  media/Sales/q3.pdf.txt  (first line = title)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MEDIA = path.join(ROOT, 'media');

const TYPES = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp'],
  video: ['.mp4', '.webm', '.mov', '.m4v', '.ogv'],
  pdf: ['.pdf'],
};
const typeOf = ext => Object.keys(TYPES).find(t => TYPES[t].includes(ext.toLowerCase()));
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function walk(dir, rel = '') {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const abs = path.join(dir, entry.name);
    const r = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out = out.concat(walk(abs, r));
    else {
      const type = typeOf(path.extname(entry.name));
      if (!type) continue;
      let title = '';
      const side = abs + '.txt';
      if (fs.existsSync(side)) title = fs.readFileSync(side, 'utf8').split(/\r?\n/)[0].trim();
      const st = fs.statSync(abs);
      out.push({
        path: 'media/' + r,
        name: entry.name,
        title,
        folder: rel,
        type,
        size: st.size,
      });
    }
  }
  return out;
}

const items = walk(MEDIA).sort((a, b) => natural(a.folder, b.folder) || natural(a.name, b.name));
fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify({ items }, null, 2) + '\n');
console.log(`manifest.json written with ${items.length} item(s).`);
