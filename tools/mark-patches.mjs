/**
 * Brand marks that were flattened into the slide artwork.
 *
 * strip-marks.mjs switches off the marks that exist as their own object in the
 * PDF. What is left are slides exported as one flat picture with the mark
 * already printed into it — nothing to switch off, so the area has to be
 * painted over instead. Two of those pictures also sit *under* an object-level
 * mark, which is why a slide can look branded even after the strip runs.
 *
 * Rectangles are `[x0, y0, x1, y1]` on the rendered slide at REFERENCE_WIDTH,
 * found by tools/find-marks.mjs and checked by eye; they are scaled to
 * whatever width the build renders at. `fill` is the background colour behind
 * the mark, sampled from the ring around it — every one of these marks sits on
 * flat colour, so painting the box is exact rather than approximate.
 *
 * A slide can carry more than one, so an entry may be a single box or an array
 * of them — the Drone Service wordmark and the UNB lockup usually sit side by
 * side, and where both are printed in they need one box each.
 *
 * Regenerate after replacing a PDF:
 *
 *     node tools/find-marks.mjs
 */
import sharp from 'sharp';

export const REFERENCE_WIDTH = 1600;

/** Boxes are measured on the mark's ink; this covers its soft edges too. */
const MARGIN = 5;

export const SLIDE_PATCHES = {
  'city-ch': {
    1: { rect: [1177, 69, 1588, 162], fill: '#eff3f6' },
    2: { rect: [1420, 41, 1556, 105], fill: '#ecf0f3' }, // UNB
    3: [
      { rect: [1168, 36, 1424, 107], fill: '#e3e7eb' },
      { rect: [1430, 30, 1590, 125], fill: '#dce3ea' }, // UNB
    ],
    9: [
      { rect: [1273, 30, 1454, 82], fill: '#dae4ec' },
      { rect: [1492, 38, 1592, 90], fill: '#dae5ec' }, // UNB
    ],
    11: [
      { rect: [1054, 501, 1419, 604], fill: '#fffffe' },
      { rect: [1104, 326, 1330, 452], fill: '#fefefe' }, // UNB
    ],
  },
  'city-en': {
    11: [
      { rect: [1060, 549, 1447, 658], fill: '#ecf3f7' },
      { rect: [1116, 374, 1350, 502], fill: '#ecf3f7' }, // UNB
    ],
  },
  'city-ru': {
    11: [
      { rect: [1054, 535, 1419, 638], fill: '#fefffe' },
      { rect: [1104, 366, 1330, 488], fill: '#fefefe' }, // UNB
    ],
  },
  'city-uz': {
    11: [
      { rect: [1060, 555, 1447, 663], fill: '#eaf5fe' },
      { rect: [1116, 380, 1350, 506], fill: '#eaf6fe' }, // UNB
    ],
  },
  'construction-ch': {
    1: { rect: [1183, 465, 1388, 573], fill: '#eeeeee' }, // UNB
    2: [
      { rect: [1364, 64, 1532, 112], fill: '#e9ebe9' },
      { rect: [1195, 60, 1355, 128], fill: '#ebecea' }, // UNB
    ],
    3: [
      { rect: [1385, 52, 1554, 100], fill: '#f6f9f5' },
      { rect: [1216, 54, 1342, 118], fill: '#f6f9f5' }, // UNB
    ],
    4: [
      { rect: [1383, 27, 1552, 75], fill: '#f3f9fa' },
      { rect: [1224, 28, 1348, 94], fill: '#f4f8f9' }, // UNB
    ],
    5: [
      { rect: [1401, 25, 1570, 73], fill: '#f4fafa' },
      { rect: [1253, 14, 1377, 80], fill: '#f4f9f9' }, // UNB
    ],
    10: [
      { rect: [1060, 532, 1424, 635], fill: '#f4f9fa' },
      { rect: [1108, 352, 1336, 482], fill: '#f4f9fa' }, // UNB
    ],
  },
  'construction-en': {
    10: [
      { rect: [1056, 523, 1436, 629], fill: '#ffffff' },
      { rect: [1108, 340, 1344, 472], fill: '#ffffff' }, // UNB
    ],
  },
  'construction-ru': {
    10: [
      { rect: [1060, 512, 1424, 615], fill: '#ffffff' },
      { rect: [1108, 340, 1336, 464], fill: '#ffffff' }, // UNB
    ],
  },
  'construction-uz': {
    10: [
      { rect: [1061, 501, 1442, 608], fill: '#fffffe' },
      { rect: [1114, 326, 1346, 454], fill: '#ffffff' }, // UNB
    ],
  },
  'group-en': {
    1: [
      { rect: [14, 779, 402, 887], fill: '#f0f1eb' },
      { rect: [414, 755, 650, 880], fill: '#f1f2ec' }, // UNB
    ],
    2: [
      { rect: [1232, 5, 1449, 66], fill: '#f3f4ee' },
      { rect: [1445, 9, 1596, 78], fill: '#f3f4ee' }, // UNB
    ],
    3: [
      { rect: [1230, 9, 1447, 69], fill: '#f0f1ea' },
      { rect: [1454, 14, 1600, 80], fill: '#f0f1eb' }, // UNB
    ],
    4: [
      { rect: [1237, 23, 1454, 84], fill: '#f2f3ec' },
      { rect: [1459, 15, 1599, 88], fill: '#f2f3ec' }, // UNB
    ],
    5: [
      { rect: [1220, 27, 1436, 87], fill: '#f0efeb' },
      { rect: [1454, 30, 1586, 96], fill: '#f0efeb' }, // UNB
    ],
    6: [
      { rect: [1237, 5, 1454, 66], fill: '#eef3f4' },
      { rect: [1472, 10, 1600, 76], fill: '#eef3f4' }, // UNB
    ],
    7: [
      { rect: [1211, 41, 1428, 101], fill: '#f4f3ee' },
      { rect: [1443, 46, 1574, 112], fill: '#f4f3ef' }, // UNB
    ],
    8: [
      { rect: [1230, 21, 1447, 82], fill: '#f2f3ec' },
      { rect: [1452, 12, 1600, 100], fill: '#f2f3ec' }, // UNB
    ],
    9: [
      { rect: [1356, 12, 1483, 48], fill: '#f2f5f5' },
      { rect: [1518, 10, 1586, 44], fill: '#f8fafa' }, // UNB
    ],
    10: [
      { rect: [1150, 20, 1390, 87], fill: '#f0f5f6' },
      { rect: [1458, 26, 1552, 74], fill: '#f2f6f7' }, // UNB
    ],
    15: [
      { rect: [1232, 4, 1449, 64], fill: '#ecebe7' },
      { rect: [1466, 8, 1596, 74], fill: '#ecebe7' }, // UNB
    ],
    16: [
      { rect: [1227, 9, 1444, 69], fill: '#f4f5eb' },
      { rect: [1460, 12, 1590, 78], fill: '#f5f5eb' }, // UNB
    ],
    17: [
      { rect: [1234, 20, 1451, 80], fill: '#f4f3ee' },
      { rect: [1456, 20, 1586, 88], fill: '#f4f3ef' }, // UNB
    ],
    18: [
      { rect: [1212, 41, 1429, 101], fill: '#edf1f2' },
      { rect: [1444, 46, 1574, 110], fill: '#edf1f2' }, // UNB
    ],
    19: { rect: [1114, 348, 1352, 482], fill: '#ffffff' }, // UNB
  },
  'group-ru': {
    5: { rect: [1377, 49, 1584, 96], fill: '#e8f2fc' }, // UNB
    19: [
      { rect: [537, 777, 727, 830], fill: '#e3e8ed' },
      { rect: [566, 680, 708, 756], fill: '#e3e9ee' }, // UNB
    ],
  },
  'group-uz': {
    3: { rect: [1491, 0, 1597, 45], fill: '#e9f7f9' }, // UNB
    7: { rect: [1318, 79, 1560, 130], fill: '#e6e9ee' }, // UNB
    19: [
      { rect: [537, 777, 727, 830], fill: '#e2e7eb' },
      { rect: [566, 680, 708, 755], fill: '#e2e7eb' }, // UNB
    ],
  },
  'power-ch': {
    15: [
      { rect: [1063, 526, 1428, 629], fill: '#fffffe' },
      { rect: [1110, 348, 1338, 476], fill: '#fefefe' }, // UNB
    ],
  },
  'power-en': {
    16: { rect: [1112, 342, 1346, 474], fill: '#ffffff' }, // UNB
  },
  'power-ru': {
    1: [
      { rect: [110, 672, 420, 759], fill: '#ccd8e2' },
      { rect: [476, 679, 613, 748], fill: '#dbe6ec' }, // UNB
    ],
    16: { rect: [1098, 328, 1324, 454], fill: '#feffff' }, // UNB
  },
  'power-uz': {
    16: { rect: [1112, 344, 1348, 476], fill: '#feffff' }, // UNB
  },
  'roads-ch': {
    1: { rect: [1119, 541, 1365, 669], fill: '#ebebeb' }, // UNB
    15: [
      { rect: [1307, 750, 1499, 804], fill: '#fefffe' },
      { rect: [1331, 660, 1449, 726], fill: '#ffffff' }, // UNB
    ],
  },
  'roads-en': {
    15: { rect: [1112, 342, 1346, 474], fill: '#ffffff' }, // UNB
  },
  'roads-ru': {
    17: [
      { rect: [1054, 485, 1419, 588], fill: '#fffffe' },
      { rect: [1104, 316, 1330, 440], fill: '#fefffe' }, // UNB
    ],
  },
  'roads-uz': {
    15: [
      { rect: [1060, 500, 1447, 608], fill: '#ffffff' },
      { rect: [1114, 324, 1348, 452], fill: '#ffffff' }, // UNB
    ],
  },
  'solar-ch': {
    1: { rect: [1175, 442, 1380, 547], fill: '#eeeeee' }, // UNB
    3: [
      { rect: [1356, 50, 1525, 98], fill: '#edf2f4' },
      { rect: [1186, 50, 1310, 116], fill: '#ecf1f4' }, // UNB
    ],
    9: [
      { rect: [1358, 48, 1527, 96], fill: '#edf2f7' },
      { rect: [1188, 48, 1312, 116], fill: '#f2f6fa' }, // UNB
    ],
    14: [
      { rect: [1054, 514, 1419, 617], fill: '#fffffe' },
      { rect: [1104, 340, 1330, 466], fill: '#fefefe' }, // UNB
    ],
  },
  'solar-en': {
    15: { rect: [938, 266, 1312, 476], fill: '#ffffff' }, // UNB
  },
  'solar-ru': {
    15: [
      { rect: [1054, 500, 1419, 603], fill: '#fffffe' },
      { rect: [1104, 326, 1330, 452], fill: '#fefefe' }, // UNB
    ],
  },
  'solar-uz': {
    15: { rect: [1114, 328, 1350, 458], fill: '#ffffff' }, // UNB
  },
};

/** Paints out every mark known for this slide. */
export async function patchSlide(png, deck, page, renderWidth) {
  const patch = SLIDE_PATCHES[deck]?.[page];
  if (!patch) return { png, painted: 0 };

  const k = renderWidth / REFERENCE_WIDTH;
  const boxes = Array.isArray(patch) ? patch : [patch];
  const meta = await sharp(png).metadata();
  const composites = boxes.map(({ rect, fill }) => {
    const left = Math.max(0, Math.round((rect[0] - MARGIN) * k));
    const top = Math.max(0, Math.round((rect[1] - MARGIN) * k));
    const right = Math.min(meta.width, Math.round((rect[2] + MARGIN) * k));
    const bottom = Math.min(meta.height, Math.round((rect[3] + MARGIN) * k));
    return {
      input: {
        create: { width: right - left, height: bottom - top, channels: 3, background: fill },
      },
      left,
      top,
    };
  });
  return { png: await sharp(png).composite(composites).png().toBuffer(), painted: boxes.length };
}
