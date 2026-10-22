// <croc-game> — the croc-eats-ads parallax runner, ported from the supplied hero.
// Attributes: base (asset folder), autopilot ("on" default). Emits window "croc:score" {ads, gems}.
(function () {
  if (customElements.get('croc-game')) return;
  const KEYS = ['sky','farHills','midHills','ground','cloudLarge','cloudMedium','cloudSmall','brickMed','brickLong','goldBlock','pipe','adLogo','adMountain','adAvatar','adBitten','dust','crocRun1','crocRun2','crocRun3','crocRun4','crocJump','crocChompOpen','crocChompBite','coin1','coin2'];
  const cache = {};
  function load(base) {
    return Promise.all(KEYS.map(k => cache[base + k] || (cache[base + k] = new Promise(r => {
      const i = new Image(); i.onload = () => r([k, i]); i.onerror = () => r([k, null]); i.src = base + k + '.png';
    })))).then(list => Object.fromEntries(list));
  }
  class CrocGame extends HTMLElement {
    connectedCallback() {
      if (this._c) return;
      this.style.display = 'block'; this.style.position = this.style.position || 'relative';
      this.style.width = this.style.width || '100%'; this.style.height = this.style.height || '100%';
      const c = this._c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;display:block;cursor:pointer';
      this.appendChild(c);
      this.ctx = c.getContext('2d');
      this.S = { w: 0, h: 0, scale: 1, groundY: 0, base: 4.2, score: 0, gems: 0, clouds: [], plats: [], ads: [], coins: [], parts: [], dusts: [], sc: { far: 0, mid: 0, ground: 0, total: 0 }, pt: 0, at: 0, manual: 0,
        croc: { x: 180, y: 0, vy: 0, w: 200, h: 174, grounded: true, plat: null, fi: 0, ft: 0, action: 'run', ct: 0 } };
      this._onKey = e => { if (e.code === 'Space' && this._visible && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); this.jump(true); } };
      window.addEventListener('keydown', this._onKey);
      c.addEventListener('pointerdown', () => this.jump(true));
      this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(this);
      this._io = new IntersectionObserver(([e]) => { this._visible = e.isIntersecting; }); this._io.observe(this);
      this._reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.crocJump = () => this.jump(true);
      load(this.getAttribute('base') || 'assets/game/').then(img => { this.img = img; this.resize(); this.initClouds(); this.tick(); });
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); window.removeEventListener('keydown', this._onKey); this._ro?.disconnect(); this._io?.disconnect(); }
    resize() {
      const S = this.S, r = this.getBoundingClientRect(); if (!r.width) return;
      S.w = this._c.width = Math.round(r.width); S.h = this._c.height = Math.round(r.height);
      this.ctx.imageSmoothingEnabled = false;
      S.scale = Math.max(0.6, Math.min(1, S.h / 1050)); // ponytail: capped so tall heroes keep the croc above the fold
      const gh = (this.img?.ground ? this.img.ground.height : 218) * S.scale * 0.75;
      S.groundY = S.h - gh + 20 * S.scale;
      const k = S.croc;
      if (k.grounded && !k.plat) k.y = S.groundY;
      k.w = (S.w < 600 ? 190 : 230) * S.scale; k.h = (S.w < 600 ? 186 : 225) * S.scale;
      k.x = S.w >= 900 ? S.w * 0.56 : S.w < 600 ? 16 : Math.max(60, S.w * 0.08);
    }
    initClouds() {
      const S = this.S;
      S.clouds = [
        { t: 'cloudLarge', x: S.w * .2, y: S.h * .1, sp: .18, s: .9 }, { t: 'cloudMedium', x: S.w * .62, y: S.h * .2, sp: .28, s: .8 },
        { t: 'cloudSmall', x: S.w * .9, y: S.h * .14, sp: .22, s: .85 }, { t: 'cloudLarge', x: S.w * 1.3, y: S.h * .06, sp: .15, s: 1 }];
    }
    jump(manual) {
      const k = this.S.croc; if (manual) this.S.manual = 600;
      if (!k.grounded) return;
      k.vy = -14.5; k.grounded = false; k.plat = null; k.action = 'jump';
      this.dust(k.x + 30, k.y + 10);
    }
    dust(x, y) { this.S.dusts.push({ x, y, s: .6 * this.S.scale, a: .8, life: 25 }); }
    confetti(x, y) {
      const cols = ['#FFD23A', '#FFFFFF', '#3DBA4E', '#F7862A', '#7C4BC8'];
      for (let i = 0; i < 24; i++) this.S.parts.push({ x: x + Math.random() * 40 - 10, y: y + Math.random() * 50 - 20, vx: -(Math.random() * 7 - 2) * 1.2, vy: -Math.random() * 8 - 2, size: Math.random() * 8 + 4, color: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - .5) * .3, a: 1, life: 60 + Math.random() * 30 });
    }
    emit() { window.dispatchEvent(new CustomEvent('croc:score', { detail: { ads: this.S.score, gems: this.S.gems } })); }
    update(sp) {
      const S = this.S, k = S.croc;
      S.pt += sp;
      if (S.pt > 420) {
        S.pt = 0; const long = Math.random() > .55, gold = Math.random() > .4;
        const y = S.groundY - (130 + Math.random() * 80) * S.scale;
        const p = { t: long ? 'brickLong' : 'brickMed', x: S.w + 100, y, w: (long ? 380 : 220) * S.scale, h: (long ? 76 : 74) * S.scale, gold };
        S.plats.push(p);
        if (gold) for (let i = 0; i < 3; i++) S.coins.push({ x: p.x + p.w * (.25 + .25 * i), y: y - (60 + Math.sin(i / 2 * Math.PI) * 40) * S.scale, w: 26 * S.scale, h: 26 * S.scale, bob: Math.random() * 6 });
      }
      for (let i = S.plats.length - 1; i >= 0; i--) { S.plats[i].x -= sp; if (S.plats[i].x + S.plats[i].w < -100) S.plats.splice(i, 1); }
      S.at += sp;
      if (S.at > 260) {
        S.at = 0; const t = ['adLogo', 'adMountain', 'adAvatar'][Math.floor(Math.random() * 3)];
        const ground = Math.random() > .35, h = 120 * S.scale, w = 105 * S.scale;
        const y = ground ? S.groundY - h + 15 * S.scale : S.groundY - h - 140 * S.scale;
        S.ads.push({ t, x: S.w + 80, y, by: y, bob: Math.random() * 6, w, h, eaten: false, bt: 0, air: !ground });
      }
      for (let i = S.ads.length - 1; i >= 0; i--) {
        const a = S.ads[i]; a.x -= sp; a.bob += .05; a.y = a.by + Math.sin(a.bob) * 6;
        if (a.eaten && --a.bt <= 0) { S.ads.splice(i, 1); continue; }
        if (a.x + a.w < -100) S.ads.splice(i, 1);
      }
      const L = k.x + k.w * .15, R = k.x + k.w * .85, T = k.y - k.h, B = k.y;
      for (let i = S.coins.length - 1; i >= 0; i--) {
        const c = S.coins[i]; c.x -= sp; c.bob += .06;
        if (c.x + c.w > L && c.x < R && c.y + c.h > T && c.y < B) { S.gems++; this.confetti(c.x, c.y); S.coins.splice(i, 1); this.emit(); continue; }
        if (c.x + c.w < -50) S.coins.splice(i, 1);
      }
      // autopilot: hop for airborne ads when the visitor isn't playing
      if (S.manual > 0) S.manual--;
      else if (this.getAttribute('autopilot') !== 'off' && k.grounded) {
        const mx = k.x + k.w * .82;
        if (S.ads.some(a => a.air && !a.eaten && a.x - mx > 60 * S.scale && a.x - mx < 150 * S.scale)) this.jump(false);
      }
      // croc physics
      if (!k.grounded) {
        k.vy += .65; k.y += k.vy; k.action = 'jump'; let landed = false;
        if (k.vy > 0) for (const p of S.plats) {
          if (k.x + k.w * .6 > p.x && k.x + k.w * .3 < p.x + p.w && k.y >= p.y - 10 && k.y <= p.y + 25) { k.y = p.y; k.vy = 0; k.grounded = true; k.plat = p; k.action = 'run'; landed = true; this.dust(k.x + 40, k.y + 5); break; }
        }
        if (!landed && k.y >= S.groundY) { k.y = S.groundY; k.vy = 0; k.grounded = true; k.plat = null; k.action = 'run'; this.dust(k.x + 40, k.y + 5); }
      } else if (k.plat) {
        const p = k.plat; if (k.x + k.w * .3 > p.x + p.w || k.x + k.w * .6 < p.x) { k.grounded = false; k.plat = null; }
      }
      if (++k.ft >= 7) { k.ft = 0; k.fi = (k.fi + 1) % 4; }
      const mx = k.x + k.w * .82, my = k.y - k.h * .55; let near = false;
      for (const a of S.ads) {
        if (a.eaten) continue;
        const dx = a.x - mx, dy = Math.abs(a.y + a.h * .5 - my);
        if (dx > 0 && dx < 180 * S.scale && dy < 90 * S.scale) near = true;
        if (dx <= 25 * S.scale && dx >= -50 * S.scale && dy < 80 * S.scale) {
          a.eaten = true; a.bt = 8; a.t = 'adBitten'; k.action = 'chomp_bite'; k.ct = 16;
          this.confetti(a.x + a.w * .3, a.y + a.h * .4); S.score++; this.emit();
        }
      }
      if (k.ct > 0) { if (--k.ct <= 0) k.action = k.grounded ? 'run' : 'jump'; }
      else if (near) k.action = 'chomp_open';
      else if (k.grounded) k.action = 'run';
      for (let i = S.parts.length - 1; i >= 0; i--) { const p = S.parts[i]; p.x += p.vx; p.y += p.vy; p.vy += .35; p.rot += p.vr; p.a = Math.max(0, --p.life / 60); if (p.life <= 0) S.parts.splice(i, 1); }
      for (let i = S.dusts.length - 1; i >= 0; i--) { const d = S.dusts[i]; d.x -= S.base * .4; d.a = Math.max(0, --d.life / 25); d.s += .01; if (d.life <= 0) S.dusts.splice(i, 1); }
    }
    render(sp) {
      const S = this.S, x = this.ctx, I = this.img, k = S.croc;
      if (I.sky) x.drawImage(I.sky, 0, 0, S.w, S.h); else { x.fillStyle = '#1F6FD0'; x.fillRect(0, 0, S.w, S.h); }
      for (const c of S.clouds) {
        c.x -= sp * c.sp; const im = I[c.t]; if (!im) continue;
        const w = im.width * c.s * S.scale, h = im.height * c.s * S.scale; x.drawImage(im, c.x, c.y, w, h);
        if (c.x + w < -50) c.x = S.w + Math.random() * 150;
      }
      const tw = Math.max(S.w, 1400 * S.scale);
      S.sc.far = (S.sc.far + sp * .35) % tw; S.sc.mid = (S.sc.mid + sp * .65) % tw;
      if (I.farHills) { const h = 450 * S.scale, y = S.groundY - h + 120 * S.scale; x.drawImage(I.farHills, -S.sc.far, y, tw, h); x.drawImage(I.farHills, tw - S.sc.far, y, tw, h); }
      if (I.midHills) { const h = 420 * S.scale, y = S.groundY - h + 80 * S.scale; x.drawImage(I.midHills, -S.sc.mid, y, tw, h); x.drawImage(I.midHills, tw - S.sc.mid, y, tw, h); }
      for (const p of S.plats) { if (I[p.t]) x.drawImage(I[p.t], p.x, p.y, p.w, p.h); if (p.gold && I.goldBlock) { const g = 45 * S.scale; x.drawImage(I.goldBlock, p.x + p.w * .45, p.y - g + 4, g, g); } }
      for (const a of S.ads) if (I[a.t]) x.drawImage(I[a.t], a.x, a.y, a.w, a.h);
      for (const c of S.coins) { const im = (Math.floor(c.bob * 3) % 2 ? I.coin2 : I.coin1) || I.coin1; if (im) x.drawImage(im, c.x, c.y + Math.sin(c.bob) * 4, c.w, c.h); }
      if (I.ground) {
        const gw = I.ground.width * S.scale * .75, gh = I.ground.height * S.scale * .75;
        S.sc.ground = (S.sc.ground + sp) % gw;
        for (let gx = -S.sc.ground; gx < S.w + gw; gx += gw) x.drawImage(I.ground, gx, S.groundY - 15 * S.scale, gw, gh);
      }
      if (I.pipe) { const per = S.w + 900 * S.scale, px = per - (S.sc.total % per); x.drawImage(I.pipe, px, S.groundY - 132 * S.scale, 116 * S.scale, 132 * S.scale); S.sc.total += sp; }
      for (const d of S.dusts) if (I.dust) { x.save(); x.globalAlpha = d.a; const w = I.dust.width * d.s, h = I.dust.height * d.s; x.drawImage(I.dust, d.x, d.y - h * .5, w, h); x.restore(); }
      const im = k.action === 'jump' ? I.crocJump : k.action === 'chomp_bite' ? I.crocChompBite : k.action === 'chomp_open' ? I.crocChompOpen : [I.crocRun1, I.crocRun2, I.crocRun3, I.crocRun4][k.fi];
      if (im) x.drawImage(im, k.x, k.y - k.h, k.w, k.h);
      for (const p of S.parts) { x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.globalAlpha = p.a; x.fillStyle = p.color; x.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .7); x.restore(); }
    }
    tick() {
      const sp = this._reduced ? 0 : this.S.base;
      if (this._visible !== false && !document.hidden) { if (sp) this.update(sp); this.render(sp); }
      if (!this._reduced) this._raf = requestAnimationFrame(() => this.tick());
    }
  }
  customElements.define('croc-game', CrocGame);
})();
