/**
 * Фон страницы: дрейфующие частицы и созвездие из контурных треугольников.
 *
 * Созвездие — это дрон. При загрузке треугольники разлетаются по экрану и
 * сходятся в квадрокоптер в первом слоте (hero, справа). По мере прокрутки
 * дрон перелетает между слотами [data-constellation] — во второй секции он
 * слева, — а в последнем слоте (футер, data-constellation="bulb") те же
 * частицы перестраиваются в лампочку: решение.
 *
 * Производительность: Canvas 2D, ~16 stroke()-вызовов за кадр (5 цветов ×
 * 3 уровня яркости + связи), DPR ограничен, на узких экранах частиц меньше,
 * в скрытой вкладке цикл стоит. prefers-reduced-motion и кнопка паузы
 * замораживают время: кадр перерисовывается только при прокрутке.
 */
(function(){
  'use strict';

  var canvas = document.getElementById('constellation');
  var slots = Array.prototype.slice.call(document.querySelectorAll('[data-constellation]'));
  if(!canvas || !slots.length || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  if(!ctx) return;

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var css = getComputedStyle(document.documentElement);
  var COLORS = [1,2,3,4,5].map(function(i){
    return css.getPropertyValue('--c-star-' + i).trim() || '#ffffff';
  });
  var AMBER = 1, TEAL = 2, BLUE = 4;
  var DUST = css.getPropertyValue('--c-dust').trim() || 'rgba(255,255,255,.5)';
  var LINK = css.getPropertyValue('--c-line').trim() || 'rgba(255,255,255,.14)';
  var ALPHAS = [0.32, 0.62, 1];

  // Детерминированный генератор: одни и те же формы при каждой загрузке.
  var seed = 1;
  function rand(){
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function gauss(){
    var u = rand() || 1e-6, v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * v);
  }
  function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smooth(a, b, v){ v = clamp01((v - a) / (b - a)); return v * v * (3 - 2 * v); }
  function easeOut(v){ return v >= 1 ? 1 : 1 - Math.pow(2, -10 * v); }
  function lerp(a, b, v){ return a + (b - a) * v; }

  /* ---------- Дрон (вид сверху, x ∈ [-1, 1]) ---------- */
  var ROTORS = [
    {x:-0.62, y:-0.60, dir: 1},
    {x: 0.62, y:-0.60, dir:-1},
    {x: 0.62, y: 0.60, dir: 1},
    {x:-0.62, y: 0.60, dir:-1}
  ];
  var RIM = 0.33;          // радиус защиты винта
  var SQUASH = 0.56;       // наклон камеры: вид сверху-сбоку
  var SPIN = 4.2;          // рад/с — лопасти
  var RIM_SPIN = 0.35;

  function buildDrone(n){
    var pts = [];
    function add(x, y, rotor, rim){ pts.push({x:x, y:y, rotor:rotor, rim:!!rim}); }
    var i, t, k;

    // Корпус: скруглённый прямоугольник, плотнее к контуру
    var bodyN = Math.round(n * 0.17);
    for(i = 0; i < bodyN; i++){
      if(rand() < 0.55){
        t = rand() * 6.283;
        var cx = Math.cos(t), cy = Math.sin(t);
        var m = Math.pow(Math.pow(Math.abs(cx), 4) + Math.pow(Math.abs(cy), 4), 0.25);
        add(cx / m * 0.2 + gauss() * 0.008, cy / m * 0.3 + gauss() * 0.008, -1);
      }else{
        add((rand() * 2 - 1) * 0.18, (rand() * 2 - 1) * 0.28, -1);
      }
    }
    // Лучи рамы
    var armN = Math.round(n * 0.15);
    for(i = 0; i < armN; i++){
      var r = ROTORS[i % 4];
      t = 0.2 + rand() * 0.72;
      var len = Math.sqrt(r.x * r.x + r.y * r.y);
      var w = gauss() * 0.02;
      add(r.x * t - r.y / len * w, r.y * t + r.x / len * w, -1);
    }
    // Моторы
    var hubN = Math.round(n * 0.08);
    for(i = 0; i < hubN; i++){
      k = i % 4; t = rand() * 6.283;
      var hr = Math.sqrt(rand()) * 0.075;
      add(ROTORS[k].x + Math.cos(t) * hr, ROTORS[k].y + Math.sin(t) * hr, -1);
    }
    var core = pts.length;
    // Защита винтов — кольца
    var rimN = Math.round(n * 0.22);
    for(i = 0; i < rimN; i++){
      k = i % 4; t = rand() * 6.283;
      var rr = RIM + gauss() * 0.012;
      add(ROTORS[k].x + Math.cos(t) * rr, ROTORS[k].y + Math.sin(t) * rr, k, true);
    }
    // Лопасти: по две на винт, сужаются к концу — их вращение и видно
    var bladeN = Math.round(n * 0.2);
    for(i = 0; i < bladeN; i++){
      k = i % 4;
      var br = 0.08 + Math.pow(rand(), 0.8) * 0.23;
      var bt = (rand() < 0.5 ? 0 : Math.PI) + k * 0.7 + gauss() * ((0.3 - br) * 0.25 + 0.02);
      add(ROTORS[k].x + Math.cos(bt) * br, ROTORS[k].y + Math.sin(bt) * br, k);
    }
    // Подвес камеры
    var gimN = Math.round(n * 0.03);
    for(i = 0; i < gimN; i++){
      t = rand() * 6.283;
      var gr = 0.055 + gauss() * 0.006;
      add(Math.cos(t) * gr, 0.36 + Math.sin(t) * gr, -1);
    }
    // Ореол: форма не обрезана, а растворяется
    var base = pts.length;
    while(pts.length < n){
      var src = pts[Math.floor(rand() * base)];
      add(src.x + gauss() * 0.09, src.y + gauss() * 0.09, -1);
    }
    pts.core = core;
    return pts;
  }

  /* ---------- Лампочка (центр колбы в (0, -0.28), y вниз) ---------- */
  function buildBulb(n){
    var pts = [];
    var GY = -0.28, GR = 0.58;
    // +0.2 по y: центрирует лампочку с лучами по вертикали слота
    function add(x, y, color){ pts.push({x:x, y:y + 0.2, color:color}); }
    function spectral(x, y){
      var ang = (Math.atan2(y - GY, x) + Math.PI) / 6.283185;
      return Math.floor(ang * 5 + rand() * 1.3 + 5) % 5;
    }
    var i, t, a, x, y;

    // Колба: окружность без нижнего сектора
    var glassN = Math.round(n * 0.34);
    for(i = 0; i < glassN; i++){
      a = (140 + rand() * 260) * Math.PI / 180;
      var rr = GR + gauss() * 0.012;
      x = Math.cos(a) * rr; y = GY + Math.sin(a) * rr;
      add(x, y, spectral(x, y));
    }
    // Горлышко: плавный переход колбы в цоколь
    var neckN = Math.round(n * 0.08);
    var ex = Math.cos(40 * Math.PI / 180) * GR, ey = GY + Math.sin(40 * Math.PI / 180) * GR;
    for(i = 0; i < neckN; i++){
      t = rand();
      var side = i % 2 ? 1 : -1;
      var qx = (1 - t) * (1 - t) * ex + 2 * (1 - t) * t * 0.24 + t * t * 0.2;
      var qy = (1 - t) * (1 - t) * ey + 2 * (1 - t) * t * 0.22 + t * t * 0.44;
      x = side * qx + gauss() * 0.008; y = qy + gauss() * 0.008;
      add(x, y, spectral(x, y));
    }
    // Цоколь: резьба из трёх полос и контакт
    var baseN = Math.round(n * 0.14);
    for(i = 0; i < baseN; i++){
      var band = i % 4;
      if(band < 3){
        var bw = 0.2 - band * 0.015;
        x = (rand() * 2 - 1) * bw;
        y = 0.48 + band * 0.09 + gauss() * 0.01;
      }else{
        t = rand() * Math.PI;
        x = Math.cos(t) * 0.1; y = 0.72 + Math.sin(t) * 0.07;
      }
      add(x, y, rand() < 0.5 ? TEAL : BLUE);
    }
    // Нить накаливания: две стойки и спираль между ними
    var filN = Math.round(n * 0.16);
    for(i = 0; i < filN; i++){
      if(i % 3 === 0){
        var sx = (i % 2 ? 1 : -1) * 0.09;
        add(sx + gauss() * 0.006, -0.12 + rand() * 0.56, AMBER);
      }else{
        t = rand();
        x = -0.16 + t * 0.32;
        y = -0.16 + Math.sin(t * Math.PI * 6) * 0.05 + gauss() * 0.006;
        add(x, y, AMBER);
      }
    }
    // Лучи: «идея» вокруг верхней половины
    var rayN = Math.round(n * 0.1);
    for(i = 0; i < rayN; i++){
      var ri = i % 7;
      a = (-90 + (ri - 3) * 30) * Math.PI / 180;
      var d = 0.72 + rand() * 0.2;
      add(Math.cos(a) * d + gauss() * 0.006, GY + Math.sin(a) * d + gauss() * 0.006, AMBER);
    }
    // Внутренний объём колбы
    var fillN = Math.round(n * 0.1);
    for(i = 0; i < fillN; i++){
      t = rand() * 6.283;
      var fr = Math.sqrt(rand()) * GR * 0.85;
      x = Math.cos(t) * fr; y = GY + Math.sin(t) * fr;
      add(x, y, spectral(x, y));
    }
    // Ореол
    var base = pts.length;
    while(pts.length < n){
      var src = pts[Math.floor(rand() * base)];
      pts.push({x:src.x + gauss() * 0.07, y:src.y + gauss() * 0.07, color:src.color});
    }
    return pts;
  }

  /* ---------- Частицы созвездия ---------- */
  var particles = [];
  var links = [];
  var frags = [];

  function build(n){
    seed = 20260919;
    var drone = buildDrone(n);
    var bulb = buildBulb(n);
    particles = drone.map(function(d){
      var p = {
        hx:d.x, hy:d.y, rotor:d.rotor,
        r:0, a:0, spin:0,
        bx:0, by:0, color2:0,
        size: 2.2 + rand() * 3.4,
        rot: rand() * 6.283,
        rotSpeed: (rand() - 0.5) * 0.9,
        phase: rand() * 6.283,
        twinkle: 0.6 + rand() * 1.8,
        delay: rand() * 0.7,
        sx: 0, sy: 0, ox: 0, oy: 0,
        color: 0
      };
      if(d.rotor >= 0){
        var c = ROTORS[d.rotor];
        var dx = d.x - c.x, dy = d.y - c.y;
        p.r = Math.sqrt(dx * dx + dy * dy);
        p.a = Math.atan2(dy, dx);
        p.spin = c.dir * (d.rim ? RIM_SPIN : SPIN);
      }
      // Спектр идёт по кругу вокруг центра — соседние участки перетекают
      var ang = (Math.atan2(d.y, d.x) + Math.PI) / 6.283185;
      p.color = Math.floor(ang * 5 + rand() * 1.3 + 5) % 5;
      return p;
    });

    // Каждой частице дрона — точка лампочки с близким углом: при
    // превращении форма перетекает, а не взрывается.
    function byAngle(cy){ return function(a, b){
      return Math.atan2(a.y - cy, a.x) - Math.atan2(b.y - cy, b.x);
    };}
    var order = particles.map(function(p, i){ return {i:i, x:p.hx, y:p.hy}; }).sort(byAngle(0));
    bulb.sort(byAngle(-0.08));
    for(var k = 0; k < order.length; k++){
      var p = particles[order[k].i], b = bulb[k];
      p.bx = b.x; p.by = b.y; p.color2 = b.color;
    }

    // Осколки: соседние в силуэте частицы разлетаются одним куском.
    // Сетка поверх модели дрона; у каждого куска своё направление, дальность
    // и вращение — при сборке он возвращается ровно на своё место.
    var FX = small ? 6 : 8, FY = small ? 5 : 6;
    frags = [];
    for(var fy = 0; fy < FY; fy++){
      for(var fx = 0; fx < FX; fx++){
        var cxm = -1.05 + (fx + 0.5) * 2.1 / FX;
        var cym = -1 + (fy + 0.5) * 2 / FY;
        frags.push({
          dir: Math.atan2(cym * SQUASH, cxm) + gauss() * 0.45,
          dist: 0.35 + rand() * 0.75,
          spin: (rand() - 0.5) * 3.2,
          sx: 0, sy: 0, n: 0
        });
      }
    }
    for(var q = 0; q < particles.length; q++){
      var pq = particles[q];
      var gx = Math.min(FX - 1, Math.max(0, Math.floor((pq.hx + 1.05) / 2.1 * FX)));
      var gy = Math.min(FY - 1, Math.max(0, Math.floor((pq.hy + 1) / 2 * FY)));
      pq.frag = gy * FX + gx;
      pq.jx = gauss() * 0.04;
      pq.jy = gauss() * 0.04;
      pq.jr = (rand() - 0.5) * 8;
    }

    // Нейросеть: редкие связи между ближайшими соседями корпуса и рамы
    links = [];
    var core = drone.core;
    for(var i = 0; i < core; i += 7){
      var best = -1, bestD = 0.0064;
      for(var j = 0; j < core; j++){
        if(j === i) continue;
        var ddx = particles[j].hx - particles[i].hx;
        var ddy = particles[j].hy - particles[i].hy;
        var dd = ddx * ddx + ddy * ddy;
        if(dd < bestD && dd > 0.0004){ bestD = dd; best = j; }
      }
      if(best >= 0) links.push(i, best);
    }
  }

  /* ---------- Фоновые частицы ---------- */
  var dust = [];
  function buildDust(count){
    dust = [];
    for(var i = 0; i < count; i++){
      var z = 0.25 + Math.random() * 0.75;   // глубина: ближние крупнее и быстрее
      dust.push({
        x: Math.random(), y: Math.random(), z: z,
        vx: (Math.random() - 0.5) * 0.012 * z,
        vy: -(0.004 + Math.random() * 0.01) * z,
        s: 0.7 + z * 1.4,
        a: 0.12 + z * 0.45,
        tri: Math.random() < 0.18,
        rot: Math.random() * 6.283
      });
    }
  }

  /* ---------- Геометрия ---------- */
  var W = 0, H = 0, dpr = 1, small = false;
  var ui = 1;   // масштаб интерфейса: корневой font-size / 16 (растёт на больших экранах)

  function measure(){
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    small = W < 700;
    ui = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
    // Холст на весь экран: выше 1.5 разница в тонких линиях не видна,
    // а площадь заливки растёт квадратично — плюс общий бюджет ~4.5 Мп,
    // чтобы 27" 4K не рисовал 3840×2160×1.5² пикселей каждый кадр
    dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(4.5e6 / (W * H)));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var wanted = small ? 1100 : 2600;
    if(particles.length !== wanted) build(wanted);
    for(var i = 0; i < particles.length; i++){
      particles[i].sx = Math.random() * W;
      particles[i].sy = Math.random() * H;
    }
    buildDust(small ? 60 : 150);
  }

  // Где сейчас созвездие: между какими слотами и насколько далеко пролетело.
  // center — сглаженный центр экрана в координатах документа: по нему
  // считается прогресс перелёта, поэтому шаги колёсика не дёргают дрон.
  // Сама точка переводится в экран по настоящей прокрутке — у слота дрон
  // стоит ровно на месте, без отставания.
  function placement(center, scrollY){
    var docH = document.documentElement.scrollHeight;
    var lo = H / 2, hi = Math.max(lo, docH - H / 2);
    var anchors = [];
    for(var i = 0; i < slots.length; i++){
      var r = slots[i].getBoundingClientRect();
      if(!r.width || !r.height) continue;
      var bulb = slots[i].getAttribute('data-constellation') === 'bulb';
      var docCy = r.top + scrollY + r.height / 2;
      anchors.push({
        cx: r.left + r.width / 2,
        docCy: docCy,
        // Крайние слоты могут быть недостижимы для центра экрана — прижимаем
        y: Math.min(hi, Math.max(lo, docCy)),
        sd: Math.min(r.width / 2.15, r.height / 1.25),
        sb: Math.min(r.width / 2.1, r.height / 2.15),
        m: bulb ? 1 : 0
      });
    }
    if(!anchors.length) return null;
    var last = anchors.length - 1;
    var A = anchors[0], B = anchors[0], t = 0, seg = 0;
    if(anchors.length > 1){
      if(center <= anchors[0].y){ B = anchors[1]; }
      else if(center >= anchors[last].y){
        seg = last - 1; A = anchors[seg]; B = anchors[last]; t = 1;
      }else{
        for(var k = 0; k < last; k++){
          if(center < anchors[k + 1].y){
            seg = k; A = anchors[k]; B = anchors[k + 1];
            t = (center - A.y) / Math.max(1, B.y - A.y);
            break;
          }
        }
      }
    }
    var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    // Как далеко ближайший слот, в высотах экрана
    var near = Math.min(Math.abs(center - A.y), Math.abs(center - B.y)) / H;
    // До первого слота и после последнего дрон ждёт на месте целым
    if(center <= anchors[0].y || center >= anchors[last].y) near = 0;
    return {
      cx: lerp(A.cx, B.cx, e),
      cy: lerp(A.docCy, B.docCy, e) - scrollY,
      sd: lerp(A.sd, B.sd, e),
      sb: lerp(A.sb, B.sb, e),
      m: lerp(A.m, B.m, smooth(0.45, 0.95, t)),
      flight: Math.sin(Math.PI * t),   // 0 у слотов, 1 в середине перелёта
      near: near,
      seg: seg
    };
  }

  /* ---------- Указатель ---------- */
  var pointer = {x:0, y:0, active:false};
  window.addEventListener('pointermove', function(e){
    if(e.pointerType === 'touch') return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
  }, {passive:true});
  document.addEventListener('pointerleave', function(){ pointer.active = false; }, {passive:true});

  /* ---------- Кадр ---------- */
  var buckets = [];
  for(var b = 0; b < 15; b++) buckets.push([]);
  var px = new Float32Array(0), py = new Float32Array(0);
  var INTRO = 2.1;
  var clock = 0;        // секунды анимации; стоит на паузе
  var lastNow = 0;
  var scrollPrev = 0;
  var smoothCenter = -1; // сглаженный центр экрана для перелёта
  var hxA = new Float32Array(0), hyA = new Float32Array(0);

  function frame(dt){
    var t = clock;
    var still = reduceQuery.matches;
    var scrollY = window.pageYOffset || 0;
    var scrollDelta = scrollY - scrollPrev;
    scrollPrev = scrollY;

    if(px.length !== particles.length){
      px = new Float32Array(particles.length);
      py = new Float32Array(particles.length);
      hxA = new Float32Array(particles.length);
      hyA = new Float32Array(particles.length);
    }
    ctx.clearRect(0, 0, W, H);

    // Частицы: дрейфуют вверх и сдвигаются от прокрутки с параллаксом
    // (точки — fillRect; треугольники копятся в один путь и рисуются разом)
    ctx.fillStyle = DUST;
    ctx.strokeStyle = DUST;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for(var d = 0; d < dust.length; d++){
      var q = dust[d];
      q.x += q.vx * dt;
      q.y += q.vy * dt - scrollDelta * q.z * 0.35 / H;
      q.x -= Math.floor(q.x); q.y -= Math.floor(q.y);
      var qx = q.x * W, qy = q.y * H;
      if(q.tri){
        var qs = q.s * 2.2 * ui, qr = q.rot + t * 0.3 * q.z;
        ctx.moveTo(qx + Math.sin(qr) * qs, qy - Math.cos(qr) * qs);
        ctx.lineTo(qx + Math.sin(qr + 2.094) * qs, qy - Math.cos(qr + 2.094) * qs);
        ctx.lineTo(qx + Math.sin(qr + 4.189) * qs, qy - Math.cos(qr + 4.189) * qs);
        ctx.closePath();
      }
    }
    ctx.stroke();
    for(d = 0; d < dust.length; d++){
      var dq = dust[d];
      if(dq.tri) continue;
      ctx.globalAlpha = dq.a;
      ctx.fillRect(dq.x * W, dq.y * H, dq.s * ui, dq.s * ui);
    }

    var center = scrollY + H / 2;
    if(smoothCenter < 0 || dt === 0) smoothCenter = center;
    else smoothCenter += (center - smoothCenter) * (1 - Math.exp(-dt * 9));
    var place = placement(smoothCenter, scrollY);
    if(!place){ ctx.globalAlpha = 1; return; }
    var CX = place.cx, CY = place.cy;
    // Превращение дрон ⇄ лампочка всегда следует за прокруткой
    var m = place.m;
    // Лампочка висит ровно; дрон покачивается и кренится в зависании
    var hover = 1 - m;
    var bob = Math.sin(t * 0.9) * place.sd * 0.018 * hover;
    var tilt = Math.sin(t * 0.55) * 0.035 * hover;
    var ct = Math.cos(tilt), st = Math.sin(tilt);

    for(b = 0; b < 15; b++) buckets[b].length = 0;

    // Из hero во вторую секцию дрон перелетает целым. Дальше, где своего
    // слота нет, осколки лежат по фону всего экрана — в обе стороны
    // прокрутки. У своего слота (дрон или лампочка) он всегда собран.
    var inFlight = smooth(0.2, 0.5, place.flight);
    var away = (still || place.seg === 0) ? 0 : smooth(0.45, 0.95, place.near);
    var shatter = away;
    // Рассыпанный фон центрируем по экрану, чтобы осколки легли равномерно
    if(!still){
      CX = lerp(CX, W / 2, away);
      CY = lerp(CY, H / 2, away);
    }
    // Осколки разлетаются по экрану, но не улетают за край узкого телефона
    var reach = Math.min(Math.max(W, H) * 0.55, Math.min(W, H) * 0.9);
    var fi;
    for(fi = 0; fi < frags.length; fi++){ frags[fi].sx = 0; frags[fi].sy = 0; frags[fi].n = 0; }

    var i, p;
    for(i = 0; i < particles.length; i++){
      p = particles[i];
      var mx = p.hx, my = p.hy;
      if(p.rotor >= 0){
        var c = ROTORS[p.rotor];
        var ang = p.a + p.spin * t;
        mx = c.x + Math.cos(ang) * p.r;
        my = c.y + Math.sin(ang) * p.r;
      }
      var dxs = (mx * ct - my * st) * place.sd;
      var dys = (mx * st + my * ct) * SQUASH * place.sd + bob;
      var hx = CX, hy = CY;
      if(m < 1){ hx += dxs * (1 - m); hy += dys * (1 - m); }
      if(m > 0){
        var breathe = 1 + Math.sin(t * 1.4 + p.phase) * 0.006;
        hx += p.bx * place.sb * breathe * m;
        hy += p.by * place.sb * breathe * m;
      }
      hxA[i] = hx; hyA[i] = hy;
      if(shatter > 0.001){
        var fr = frags[p.frag];
        fr.sx += hx; fr.sy += hy; fr.n++;
      }
    }

    // Центры осколков — один раз на кадр
    if(shatter > 0.001){
      for(fi = 0; fi < frags.length; fi++){
        var fg = frags[fi];
        if(fg.n){ fg.sx /= fg.n; fg.sy /= fg.n; }
        var ease = shatter * shatter * (3 - 2 * shatter);
        // В фоне осколки не замирают: медленно вращаются и плывут
        fg.a = fg.spin * ease + t * 0.08 * fg.spin * away;
        fg.ca = Math.cos(fg.a); fg.sa = Math.sin(fg.a);
        fg.ox = Math.cos(fg.dir) * fg.dist * reach * ease;
        fg.oy = Math.sin(fg.dir) * fg.dist * reach * ease;
        if(away > 0){
          fg.ox += Math.sin(t * 0.23 + fi * 1.3) * reach * 0.05 * away;
          fg.oy += Math.cos(t * 0.19 + fi * 1.7) * reach * 0.05 * away;
        }
      }
    }

    var R = small ? 0 : 110 * ui, R2 = R * R;
    for(i = 0; i < particles.length; i++){
      p = particles[i];
      var hx = hxA[i], hy = hyA[i];
      if(shatter > 0.001){
        // Кусок поворачивается вокруг своего центра и улетает прочь
        var f2 = frags[p.frag];
        var rx = hx - f2.sx, ry = hy - f2.sy;
        var spread = 1 + 0.35 * shatter;
        hx = f2.sx + f2.ox + (rx * f2.ca - ry * f2.sa) * spread + p.jx * reach * shatter;
        hy = f2.sy + f2.oy + (rx * f2.sa + ry * f2.ca) * spread + p.jy * reach * shatter;
      }

      var e = still ? 1 : easeOut(Math.max(0, (t - p.delay) / INTRO));
      var x = p.sx + (hx - p.sx) * e;
      var y = p.sy + (hy - p.sy) * e;

      if(R && pointer.active){
        var dx = x - pointer.x, dy = y - pointer.y;
        var dd = dx * dx + dy * dy;
        var tx = 0, ty = 0;
        if(dd < R2 && dd > 0.01){
          var dist = Math.sqrt(dd);
          var f = Math.pow(1 - dist / R, 2) * 34 * ui;
          tx = dx / dist * f; ty = dy / dist * f;
        }
        p.ox += (tx - p.ox) * 0.12;
        p.oy += (ty - p.oy) * 0.12;
      }else if(p.ox || p.oy){
        p.ox *= 0.9; p.oy *= 0.9;
        if(Math.abs(p.ox) < 0.05) p.ox = 0;
        if(Math.abs(p.oy) < 0.05) p.oy = 0;
      }
      px[i] = x + p.ox;
      py[i] = y + p.oy;

      var tw = 0.5 + 0.5 * Math.sin(p.phase + t * p.twinkle);
      var level = tw > 0.72 ? 2 : (tw > 0.3 ? 1 : 0);
      if(e < 1) level = Math.min(level, e > 0.6 ? 2 : (e > 0.25 ? 1 : 0));
      var col = m < 0.5 ? p.color : p.color2;
      buckets[col * 3 + level].push(i);
    }

    // Рассыпанное созвездие светится тише, чтобы не спорить с текстом
    // В перелёте — даже собранный — дрон чуть тише, чтобы текст читался
    // В перелёте (и собранная лампочка вдали от слотов) — тише, чтобы текст читался
    var alpha = 1 - 0.45 * shatter - 0.3 * inFlight * (1 - shatter);

    // Связи нейросети — только у дрона
    var linkAlpha = (still ? 1 : clamp01((t - INTRO * 0.8) / 1.2)) * (1 - m) * (1 - smooth(0, 0.12, shatter));
    if(linkAlpha > 0.01 && links.length){
      ctx.globalAlpha = linkAlpha;
      ctx.strokeStyle = LINK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(var l = 0; l < links.length; l += 2){
        ctx.moveTo(px[links[l]], py[links[l]]);
        ctx.lineTo(px[links[l + 1]], py[links[l + 1]]);
      }
      ctx.stroke();
    }

    // Треугольники: один путь на цвет и уровень яркости
    ctx.lineWidth = small ? 1 : 1.2 * ui;
    ctx.lineJoin = 'round';
    for(b = 0; b < 15; b++){
      var list = buckets[b];
      if(!list.length) continue;
      ctx.strokeStyle = COLORS[Math.floor(b / 3)];
      ctx.globalAlpha = ALPHAS[b % 3] * alpha;
      ctx.beginPath();
      for(var n = 0; n < list.length; n++){
        var k = list[n], pp = particles[k];
        var rot = pp.rot + pp.rotSpeed * t + pp.jr * shatter;
        var sz = small ? pp.size * 0.68 : pp.size * ui;
        var cs = Math.cos(rot) * sz, sn = Math.sin(rot) * sz;
        var x0 = px[k], y0 = py[k];
        // вершины равностороннего треугольника: (0,-1), (±0.866, 0.5)
        ctx.moveTo(x0 + sn, y0 - cs);
        ctx.lineTo(x0 + 0.866 * cs - 0.5 * sn, y0 + 0.866 * sn + 0.5 * cs);
        ctx.lineTo(x0 - 0.866 * cs - 0.5 * sn, y0 - 0.866 * sn + 0.5 * cs);
        ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- Управление циклом ---------- */
  var raf = 0, running = false, paused = false, pending = 0;

  function loop(now){
    var dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    lastNow = now;
    clock += dt;
    frame(dt);
    raf = requestAnimationFrame(loop);
  }

  // Без цикла кадр всё равно нужен: слот сдвигается при прокрутке
  function redraw(){
    if(running || pending) return;
    pending = requestAnimationFrame(function(){ pending = 0; frame(0); });
  }

  function sync(){
    var shouldRun = !document.hidden && !reduceQuery.matches && !paused;
    if(shouldRun && !running){
      running = true;
      lastNow = 0;
      raf = requestAnimationFrame(loop);
    }else if(!shouldRun && running){
      running = false;
      cancelAnimationFrame(raf);
    }
    if(!running) redraw();
  }

  var pauseBtn = document.getElementById('constellationPause');
  if(pauseBtn){
    pauseBtn.addEventListener('click', function(){
      paused = !paused;
      pauseBtn.setAttribute('aria-pressed', String(paused));
      sync();
    });
  }

  measure();
  scrollPrev = window.pageYOffset || 0;
  if(reduceQuery.matches) clock = INTRO + 1;
  sync();

  window.addEventListener('scroll', redraw, {passive:true});
  document.addEventListener('visibilitychange', sync);
  if(reduceQuery.addEventListener){
    reduceQuery.addEventListener('change', function(){
      if(reduceQuery.matches) clock = Math.max(clock, INTRO + 1);
      sync();
    });
  }

  var resizeTimer = 0, observed = false;
  function onResize(){
    // ResizeObserver сообщает размер сразу при подписке — это не ресайз
    if(!observed){ observed = true; return; }
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      measure();
      // После ресайза форма уже собрана — не повторяем вступление
      clock = Math.max(clock, INTRO + 1);
      redraw();
    }, 120);
  }
  if('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas);
  else { observed = true; window.addEventListener('resize', onResize); }
})();
