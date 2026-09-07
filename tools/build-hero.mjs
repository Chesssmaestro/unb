/**
 * Собирает assets/matrice_400_l3.webp — дрон с подвешенным лидаром Zenmuse L3.
 *
 * Фотографии двух железок пришли по отдельности, а в герое на главной нужен
 * один снимок: дрон с той полезной нагрузкой, о которой сайт и рассказывает.
 * Совмещаются они здесь, а не в вёрстке, потому что в SVG это два <image> с
 * ручными координатами, и любая правка размера героя их разъезжает.
 *
 * Координаты ниже — по фотографии дрона (1000×1000): фюзеляж занимает
 * x 458..553, снизу по центру у него площадка подвеса. Туда L3 и вешается,
 * закрывая её собой, как это и происходит на настоящем дроне.
 *
 * Usage:  node tools/build-hero.mjs [--preview]
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');

const DRONE = path.join(ASSETS, 'matrice_400.webp');
const LIDAR = path.join(ASSETS, 'zenmuse_l3.png');
const OUT = path.join(ASSETS, 'matrice_400_l3.webp');

/** Куда вешаем: центр фюзеляжа, площадка подвеса и ширина лидара в пикселях кадра. */
const MOUNT_X = 505;
const MOUNT_Y = 494;
const LIDAR_W = 68;

/**
 * Снимает белый фон фотографии.
 *
 * Заливкой от краёв, а не порогом по всему кадру: на дроне есть блики светлее
 * порога, и глобальная отсечка пробила бы в корпусе дырки. Заливка же идёт
 * только по связной области фона и внутрь объекта не попадает.
 *
 * Прозрачность у границы не резкая, а по растяжке: край на фото сглажен, и
 * отсечка «или фон, или объект» оставила бы по контуру белую кайму.
 */
async function cutout(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const light = (i) => Math.min(data[i], data[i + 1], data[i + 2]);

  const seen = new Uint8Array(width * height);
  const queue = [];
  const push = (x, y) => {
    const n = y * width + x;
    if (seen[n]) return;
    if (light(n * channels) < 232) return; // это уже объект
    seen[n] = 1;
    queue.push(n);
  };

  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  for (let q = 0; q < queue.length; q++) {
    const n = queue[q];
    const x = n % width;
    const y = (n - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  for (let n = 0; n < seen.length; n++) {
    if (!seen[n]) continue;
    const i = n * channels;
    const l = light(i);
    const a = l >= 250 ? 0 : Math.round(((250 - l) / 18) * 255);
    data[i + 3] = Math.min(data[i + 3], a);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Обрезает прозрачные поля, чтобы размер и позиция считались по самой железке. */
async function trimmed(buf) {
  const out = await sharp(buf).trim({ threshold: 1 }).png().toBuffer();
  const meta = await sharp(out).metadata();
  return { buf: out, width: meta.width, height: meta.height };
}

const lidar = await trimmed(await cutout(LIDAR));
const scale = LIDAR_W / lidar.width;
const w = Math.round(LIDAR_W);
const h = Math.round(lidar.height * scale);
const scaled = await sharp(lidar.buf).resize({ width: w, height: h }).png().toBuffer();

const left = Math.round(MOUNT_X - w / 2);
const top = MOUNT_Y;

// Дрон тоже без фона: на сайте он лежит на цветной подложке, и белый прямоугольник
// вокруг него пришлось бы прятать режимом наложения, который пачкает саму железку.
const composed = sharp(await cutout(DRONE)).composite([{ input: scaled, left, top }]);

if (process.argv.includes('--preview')) {
  const file = path.join(ROOT, 'tools', '.check', 'hero-preview.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await composed.png().toFile(file);
  console.log(`превью: ${path.relative(ROOT, file)} — L3 ${w}×${h} в точке ${left},${top}`);
} else {
  await composed.webp({ quality: 88 }).toFile(OUT);
  const { size } = fs.statSync(OUT);
  console.log(`assets/matrice_400_l3.webp — L3 ${w}×${h} в точке ${left},${top}, ${Math.round(size / 1024)} КБ`);
}
