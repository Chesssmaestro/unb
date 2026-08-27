/**
 * Removes the brand marks — Drone Service and UNB Group — from a deck PDF,
 * in memory.
 *
 * The logos are separate image XObjects sitting on top of the slide artwork,
 * so they can be switched off without touching anything underneath — no
 * retouching, no visible patch. Some of them additionally sit on a plate that
 * is drawn as vector graphics in the page content stream; those blocks are
 * dropped as well, otherwise an empty box would be left behind.
 *
 * Identification is by the SHA1 of the decoded pixels, catalogued by hand from
 * every image embedded in the 23 source decks (see the contact sheet in the
 * commit that introduced this file). Hash matching means a logo is recognised
 * wherever it appears, at any placement or scale, and nothing else can be hit
 * by accident.
 *
 * The two brands are listed separately because they are found and verified
 * differently — the Drone Service green can be scanned for, the black UNB
 * lockup cannot — but they are stripped by exactly the same machinery.
 */
import * as mupdf from 'mupdf';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRESENTATIONS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'presentations'
);

/** Every Drone Service mark found across the source decks. */
export const DRONE_SERVICE_HASHES = new Set([
  'b32d3c56cb58', // 1179x331 wordmark on black, 138 placements
  '311bbe221f51', //  379x112
  'da95626e25f2', // 1216x337 light variant
  '1a0b75526618', //  902x227
  '52ea6e4b31f2', // 1879x520
  '7946763439d3', // 1179x331 variant
  '9372fb454b41', // 1132x318
  'ba6e09acb75a', //  749x210
  'f0ba976081c7', // 1125x331
  'badde50ba8ae', // 1179x307
]);

/**
 * Every UNB Group mark found across the source decks.
 *
 * Most of them are the square stacked lockup placed next to a Drone Service
 * wordmark, one per slide, which is why the placement counts of the two sets
 * mirror each other. The `alpha` ones read as a faint outline when decoded on
 * their own — that is the mark's soft shadow or its own transparency, not a
 * different logo.
 */
export const UNB_HASHES = new Set([
  'fe1c346cb240', // 387x340 stacked lockup, 124 placements
  '5c135f8d9e83', // 387x340 alpha
  '39249d053701', // 744x684 alpha
  'aa6e085f8d60', // 559x500 alpha
  'e7f76c287916', // 998x917 alpha
  '4be8bd91ead7', // 387x345 alpha
  'e0211b15b346', // 332x301 lockup in a framed plate
  'c8b7825a1d70', // 332x301 variant
  '60e3c126ae09', // 332x301 variant
  'de855f39b819', // 352x304
  '19d9d9e364af', // 387x278
  '22e3ad6bfcaf', // 377x227
  '464563c5f16e', // 377x252
  '70d7616e4786', // 377x280
  '73f1235cda02', // 377x289, 7 placements
  '7cdc4044abd6', // 377x250
  '810fe5990579', // 342x260
  'a3349687eb09', // 385x273
  'f71f5aecf931', // 366x254
]);

/** Both brands, which is all this module actually switches off. */
const MARK_HASHES = new Set([...DRONE_SERVICE_HASHES, ...UNB_HASHES]);

/** Solid backdrop plates whose only purpose is to sit behind a logo. */
const PLATE_HASHES = new Set([
  '7f9707b729db', // solar-ru p1, black rounded plate
  'c382eed1939c', // solar-uz p1, black rounded plate
]);

/**
 * Some slides were exported as a single flat picture with the mark already
 * baked in, so there is no object to switch off and the area has to be
 * repainted. Rectangles are `[x0, y0, x1, y1]` in the image's own pixels,
 * measured from the mark's ink plus a small margin.
 *
 * Two kinds:
 *
 * `fill` — the contact slides, where the mark sits on plain white. Painting
 * the box white is exact, not approximate.
 *
 * `donor` — the Chinese title slides, where the mark sits on a dark plate over
 * a photo, so plain fill would leave an obvious panel. The same slide exists
 * in another language with the photo as its own object and no plate, so the
 * clean original is copied in from there: the donor image is scaled to this
 * one and the rectangle lifted across. Boxes cover plate, border and logo.
 *
 * Marks printed into a slide picture that has nothing drawn over them are
 * easier to reach after rendering — those live in mark-patches.mjs. What needs
 * doing here is anything with something painted on top, which used to include
 * the two slides where the UNB lockup covered the Drone Service mark. Now that
 * the lockup comes off as well those two could move, but the boxes are
 * measured and checked, so they stay where they are.
 */
const FLATTENED_PATCHES = {
  // contact slides — white
  '052a6d0c5ba8': { rect: [1238, 594, 1735, 745], fill: { r: 255, g: 255, b: 255 } }, // solar-en
  'b73a395e4674': { rect: [1910, 961, 2743, 1202], fill: { r: 255, g: 255, b: 255 } }, // group-en
  '94167ff5850b': { rect: [1876, 912, 2663, 1141], fill: { r: 255, g: 255, b: 255 } }, // power-en, roads-en
  '64c4665de9c2': { rect: [1876, 907, 2655, 1137], fill: { r: 255, g: 255, b: 255 } }, // power-uz
  '1d6148ac4546': { rect: [1878, 891, 2677, 1119], fill: { r: 255, g: 255, b: 255 } }, // solar-uz

  // marks that the UNB logo overlaps — the box also takes the divider rule
  // that would otherwise be left hanging next to nothing
  '2b1d7eda129b': { rect: [1098, 34, 1236, 81], fill: { r: 235, g: 240, b: 243 } }, // city-ch p2
  '555da3576142': { rect: [1166, 32, 1347, 82], fill: { r: 5, g: 37, b: 84 } },      // power-ru p7

  // Chinese title slides — photo lifted from the sibling deck
  'dc12f1f31158': { rect: [744, 63, 1298, 288], donor: 'products/solar-ru.pdf' },
  '27c97f68c224': { rect: [729, 116, 1293, 290], donor: 'products/roads-en.pdf' },
  '2157e4bb43b3': { rect: [745, 63, 1299, 288], donor: 'products/construction-ru.pdf' },
};

function hashPixels(image) {
  let pix;
  try {
    pix = image.toPixmap();
    const png = Buffer.from(pix.asPNG());
    return { hash: crypto.createHash('sha1').update(png).digest('hex').slice(0, 12), png };
  } catch {
    return { hash: null, png: null };
  } finally {
    pix?.destroy?.();
  }
}

function streamBytes(obj) {
  const buf = obj.readStream();
  return Buffer.from(buf.asUint8Array ? buf.asUint8Array() : new Uint8Array(buf));
}

/** Page contents may be one stream or an array of them. */
function readContents(contents) {
  if (contents.isArray()) {
    const parts = [];
    for (let i = 0; i < contents.length; i++) parts.push(streamBytes(contents.get(i)));
    return Buffer.concat(parts);
  }
  return streamBytes(contents);
}

/**
 * A 1x1 DeviceGray image whose only sample is 0 — fully transparent. Used as
 * an /SMask it stretches over the whole base image, so the logo stops being
 * painted while the artwork beneath it is left exactly as it was.
 */
function transparentSMask(pdf) {
  const dict = pdf.newDictionary();
  dict.put('Type', pdf.newName('XObject'));
  dict.put('Subtype', pdf.newName('Image'));
  dict.put('Width', pdf.newInteger(1));
  dict.put('Height', pdf.newInteger(1));
  dict.put('ColorSpace', pdf.newName('DeviceGray'));
  dict.put('BitsPerComponent', pdf.newInteger(8));
  return pdf.addStream(new Uint8Array([0]).buffer, dict);
}

const PAINT_OPS = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*']);

/** Splits a content stream into tokens, stepping over strings and inline images. */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '%') { while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') { i++; continue; }
    if (c === '(') {
      let depth = 1; i++;
      while (i < src.length && depth) {
        if (src[i] === '\\') i++;
        else if (src[i] === '(') depth++;
        else if (src[i] === ')') depth--;
        i++;
      }
      continue;
    }
    if (c === '<' || c === '>' || c === '[' || c === ']' || c === '{' || c === '}') { i++; continue; }
    if (c === '/') {
      const from = ++i;
      while (i < src.length && !' \n\r\t\f\0()<>[]{}/%'.includes(src[i])) i++;
      tokens.push({ text: src.slice(from, i), start: from, end: i, name: true });
      continue;
    }
    const start = i;
    while (i < src.length && !' \n\r\t\f\0()<>[]{}/%'.includes(src[i])) i++;
    if (i === start) { i++; continue; }
    const text = src.slice(start, i);
    tokens.push({ text, start, end: i });
    // Inline image data is arbitrary bytes; jump straight past it.
    if (text === 'ID') {
      const at = src.indexOf('EI', i);
      i = at === -1 ? src.length : at + 2;
    }
  }
  return tokens;
}

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Walks the page content and works out everything that exists only to present
 * a brand mark, given where the marks were found (`zones`).
 *
 * Returns the content stream with those vector paints turned into `n` — the
 * no-op path terminator — plus the names of XObjects placed on a mark.
 *
 * Both are needed. The decks frame their mark with a plate, a drop shadow and
 * a border: the plate and border are page graphics, the shadow is an image of
 * its own that shares no pixels with the logo, so hash matching alone leaves a
 * ghost behind. Judging by placement instead catches the whole assembly.
 *
 * Nothing is touched unless it is mostly inside a mark's footprint and no more
 * than a few times its size, which keeps full-page backgrounds, clipping paths
 * and neighbouring logos well out of range.
 */
function analyseContent(src, zones, pageH) {
  const tokens = tokenize(src);
  const edits = [];
  const names = new Set();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let nums = [];
  let lastName = null;
  let box = null;

  /** Does this device-space box sit on one of the marks? */
  const onMark = (dev) => {
    const area = (dev[2] - dev[0]) * (dev[3] - dev[1]);
    if (!(area > 0)) return false;
    return zones.some((z) => {
      const zArea = (z[2] - z[0]) * (z[3] - z[1]);
      return intersection(dev, z) / area > 0.6 && area <= zArea * 6;
    });
  };

  const addPoint = (x, y) => {
    const [dx, dy] = apply(ctm, x, y);
    box = box ? [Math.min(box[0], dx), Math.min(box[1], dy), Math.max(box[2], dx), Math.max(box[3], dy)]
              : [dx, dy, dx, dy];
  };

  for (const tok of tokens) {
    const t = tok.text;
    if (tok.name) { lastName = t; continue; }
    const n = Number(t);
    if (Number.isFinite(n) && /^[-+.\d]/.test(t)) { nums.push(n); continue; }

    switch (t) {
      // An XObject is painted into the unit square, so its placement is the
      // current matrix applied to [0,0]-[1,1].
      case 'Do': {
        if (lastName) {
          const pts = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)];
          const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
          const dev = [Math.min(...xs), pageH - Math.max(...ys), Math.max(...xs), pageH - Math.min(...ys)];
          if (onMark(dev)) names.add(lastName);
        }
        break;
      }
      case 'q': stack.push(ctm.slice()); break;
      case 'Q': ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; break;
      case 'cm': if (nums.length >= 6) ctm = mul(nums.slice(-6), ctm); break;
      case 'm': case 'l': if (nums.length >= 2) addPoint(nums.at(-2), nums.at(-1)); break;
      case 'c': if (nums.length >= 6) for (let k = 0; k < 3; k++) addPoint(nums.at(-6 + k * 2), nums.at(-5 + k * 2)); break;
      case 'v': case 'y': if (nums.length >= 4) { addPoint(nums.at(-4), nums.at(-3)); addPoint(nums.at(-2), nums.at(-1)); } break;
      case 're':
        if (nums.length >= 4) {
          const [x, y, w, h] = nums.slice(-4);
          addPoint(x, y); addPoint(x + w, y); addPoint(x, y + h); addPoint(x + w, y + h);
        }
        break;
      case 'n': case 'W': case 'W*': if (t !== 'W' && t !== 'W*') box = null; break;
      default:
        if (PAINT_OPS.has(t)) {
          // User space is y-up, the logo boxes came from the renderer y-down.
          if (box && onMark([box[0], pageH - box[3], box[2], pageH - box[1]])) {
            edits.push({ start: tok.start, end: tok.end });
          }
          box = null;
        }
        break;
    }
    nums = [];
  }

  let out = src;
  if (edits.length) {
    out = '';
    let at = 0;
    for (const e of edits) {
      out += src.slice(at, e.start) + 'n'.padEnd(e.end - e.start, ' ');
      at = e.end;
    }
    out += src.slice(at);
  }
  return { out, hits: edits.length, names };
}

function intersection(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

const donorCache = new Map();

/** The clean background photo of a donor deck's first slide. */
function donorPhoto(file) {
  if (donorCache.has(file)) return donorCache.get(file);
  const doc = mupdf.PDFDocument.openDocument(fs.readFileSync(path.join(PRESENTATIONS, file)), 'application/pdf');
  const page = doc.loadPage(0);
  let best = null;
  page.toStructuredText('preserve-images').walk({
    onImageBlock(bbox, ctm, image) {
      if (!best || image.getWidth() > best.w) best = { w: image.getWidth(), png: Buffer.from(image.toPixmap().asPNG()) };
    },
  });
  donorCache.set(file, best?.png ?? null);
  return donorCache.get(file);
}

/** Repaints a flattened slide picture over the baked-in mark. */
async function patchComposite(doc, xobjects, name, obj, png, patch) {
  const w = obj.get('Width').asNumber();
  const h = obj.get('Height').asNumber();
  const [x0, y0, x1, y1] = patch.rect;
  const box = { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };

  let input;
  if (patch.donor) {
    const photo = donorPhoto(patch.donor);
    if (!photo) throw new Error(`donor photo not found: ${patch.donor}`);
    input = await sharp(photo).resize({ width: w, height: h, fit: 'fill' }).extract(box).png().toBuffer();
  } else {
    input = { create: { width: box.width, height: box.height, channels: 3, background: patch.fill } };
  }

  const jpeg = await sharp(png)
    .composite([{ input, left: x0, top: y0 }])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const dict = doc.newDictionary();
  dict.put('Type', doc.newName('XObject'));
  dict.put('Subtype', doc.newName('Image'));
  dict.put('Width', doc.newInteger(w));
  dict.put('Height', doc.newInteger(h));
  dict.put('ColorSpace', doc.newName('DeviceRGB'));
  dict.put('BitsPerComponent', doc.newInteger(8));
  dict.put('Filter', doc.newName('DCTDecode'));
  const ab = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength);
  xobjects.put(name, doc.addRawStream(ab, dict));
}

/**
 * @param {Buffer} bytes  source PDF
 * @returns {Promise<{doc: mupdf.PDFDocument, images: number, plates: number, repainted: number}>}
 */
export async function stripMarks(bytes) {
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf');
  const smask = transparentSMask(doc);
  let images = 0, plates = 0, repainted = 0;

  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    const bounds = page.getBounds();
    const pageH = bounds[3] - bounds[1];

    // Pass 1 — find the marks on this page and remember their footprint.
    const doomed = new Set();   // "WxH" of images to switch off
    const zones = [];           // device-space boxes the marks occupied
    const flattened = new Map(); // "WxH" -> {patch, png} for baked-in marks
    page.toStructuredText('preserve-images').walk({
      onImageBlock(bbox, ctm, image) {
        const { hash, png } = hashPixels(image);
        if (!hash) return;
        const size = `${image.getWidth()}x${image.getHeight()}`;
        if (MARK_HASHES.has(hash)) {
          doomed.add(size);
          zones.push(bbox.slice());
        } else if (PLATE_HASHES.has(hash)) {
          doomed.add(size);
        } else if (FLATTENED_PATCHES[hash]) {
          flattened.set(size, { patch: FLATTENED_PATCHES[hash], png });
        }
      },
    });

    if (!doomed.size && !flattened.size) { page.destroy?.(); continue; }

    // Pass 2 — read the page content to learn what else is stacked on the mark
    // (plate, shadow, border) and blank the vector parts of it.
    let onMarkNames = new Set();
    if (zones.length) {
      const src = readContents(page.getObject().get('Contents')).toString('latin1');
      const { out, hits, names } = analyseContent(src, zones, pageH);
      onMarkNames = names;
      if (hits) {
        plates += hits;
        // Node Buffers are carved out of a shared pool, so `.buffer` is the
        // whole pool — slicing to this buffer's own range is what keeps the
        // stream from picking up unrelated bytes.
        const b = Buffer.from(out, 'latin1');
        const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        page.getObject().put('Contents', doc.addStream(ab, doc.newDictionary()));
      }
    }

    // Pass 3 — switch those XObjects off, repaint the flattened slides.
    const xobjects = page.getObject().get('Resources').get('XObject');
    if (xobjects.isDictionary()) {
      const jobs = [];
      xobjects.forEach((val, name) => {
        const key = `${val.get('Width').asNumber()}x${val.get('Height').asNumber()}`;
        if (doomed.has(key) || onMarkNames.has(name)) { val.put('SMask', smask); images++; }
        else if (flattened.has(key)) {
          const { patch, png } = flattened.get(key);
          jobs.push(patchComposite(doc, xobjects, name, val, png, patch));
          repainted++;
        }
      });
      await Promise.all(jobs);
    }

    page.destroy?.();
  }

  return { doc, images, plates, repainted };
}
