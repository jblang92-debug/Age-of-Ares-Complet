// Son : bruitages et voix par Web Audio (courts, joués à la volée), musique par un lecteur audio (lue en continu).
// Le navigateur n'autorise le son qu'après un premier geste du joueur : `unlock()` est appelé au clic du menu.
import { BASE } from '../render/assets';

const SFX = ['shot1', 'shot2', 'shot3', 'shotbig', 'boom1', 'boom2', 'boombig', 'place', 'shield', 'click', 'error', 'ok', 'age'];
const VOICES = ['select1', 'select2', 'move1', 'move2', 'attack1', 'attack2', 'built', 'ready', 'alert', 'lack', 'pop', 'era2', 'era3', 'win', 'lose'];
/** Familles de sons à variantes (fichiers nom_1.mp3 … nom_n.mp3, packs CC0 Kenney, CoMiGo, Kronbits, NenadSimic). */
const GROUPS: Record<string, number> = { mort_inf: 4, expl_veh: 6, expl_air: 3, expl_bat: 4, debris: 5, tourelle: 4, tir_lourd: 3, champ: 2,
  /** Âges anciens (StarNinjas et Kenney RPG Audio, CC0) : épées, flèches, catapultes, chocs sur le bois. */ epee: 6, fleche: 4, catapulte: 3, bois: 2,
  /** Âge de la poudre (synthétisés, scripts/powder.py) : mousquet et canon. */ mousquet: 3, poudre: 3 };
const CALM = ['deep_space_watch', 'silent_orbits', 'silent_orbits_2'], TENSE = 'command_room_tension';
/** Musique propre à chaque âge, si les fichiers existent : musique/age1_1.mp3, age1_2.mp3 … age6_3.mp3 (sinon, les morceaux spatiaux). */
const AGE_TRACKS = Array.from({ length: 6 }, (_, a) => [1, 2, 3].map((i) => `age${a + 1}_${i}`));
/** Voix propres à chaque faction, si les fichiers existent : voix/<faction>/<réplique>.mp3 (sinon, les voix communes). */
export const FACTION_VOICE_DIRS = ['ares', 'boreale', 'australe', 'solaris'];

export class GameAudio {
  muted = false;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private sfxOut: GainNode | null = null;
  private voiceOut: GainNode | null = null;
  /** Volumes réglables (0 à 1) : musique, bruitages, voix. */
  vol = { musique: 1, effets: 1, voix: 1 };
  private buffers = new Map<string, AudioBuffer>();
  private last = new Map<string, number>();
  private voiceUntil = 0;
  private music: HTMLAudioElement | null = null;
  private track = '';
  private tenseUntil = 0;
  /** Âge du joueur (musique) et dossier de voix de sa faction. */
  private age = 1;
  private ageOk = new Set<string>();
  faction = '';
  /** Faction du joueur : ses voix propres sont chargées si elles existent. */
  setFaction(dir: string) { if (dir === this.faction) return; this.faction = dir; if (this.ctx) for (const n of VOICES) void this.load(`voix/${dir}/${n}`); }

  /** À appeler dans un gestionnaire de clic. */
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.out = this.ctx.createGain(); this.out.gain.value = this.muted ? 0 : 1; this.out.connect(this.ctx.destination);
      this.sfxOut = this.ctx.createGain(); this.sfxOut.gain.value = this.vol.effets; this.sfxOut.connect(this.out);
      this.voiceOut = this.ctx.createGain(); this.voiceOut.gain.value = this.vol.voix; this.voiceOut.connect(this.out);
      void this.ctx.resume();
      for (const n of SFX) void this.load('sfx/' + n);
      for (const [g, n] of Object.entries(GROUPS)) for (let i = 1; i <= n; i++) void this.load(`sfx/${g}_${i}`);
      for (const n of VOICES) void this.load('voix/' + n);
      if (this.faction) for (const n of VOICES) void this.load(`voix/${this.faction}/${n}`);
      for (const list of AGE_TRACKS) for (const t of list) void fetch(`${BASE}assets/audio/musique/${t}.mp3`).then((r) => { if (r.ok && (r.headers.get('content-type') ?? 'audio').startsWith('audio')) this.ageOk.add(t); }).catch(() => {});
      this.music = new Audio(); this.music.volume = 0.32 * this.vol.musique; this.music.muted = this.muted;
      this.music.addEventListener('ended', () => this.next());
      this.next();
    } catch { /* pas de son sur cet appareil */ }
  }

  private async load(name: string) {
    try {
      const res = await fetch(`${BASE}assets/audio/${name}.mp3`);
      const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
    } catch { /* fichier absent : on joue sans */ }
  }

  private next(tense = false) {
    if (!this.music) return;
    const mine = AGE_TRACKS[this.age - 1]?.filter((t) => this.ageOk.has(t)) ?? [];
    const pool = (mine.length ? mine : CALM).filter((t) => t !== this.track || mine.length === 1);
    this.track = tense ? TENSE : pool[Math.floor(Math.random() * pool.length)];
    this.music.src = `${BASE}assets/audio/musique/${this.track}.mp3`;
    this.music.play().catch(() => {});
  }
  /** Nouvel âge : la musique change au morceau suivant (tout de suite si l'âge a sa propre musique). */
  setAge(n: number) {
    if (n === this.age) return;
    this.age = n;
    if (this.music && AGE_TRACKS[n - 1]?.some((t) => this.ageOk.has(t))) this.next();
  }
  /** Passe sur le morceau de tension quand le joueur est attaqué (au plus une fois toutes les 4 minutes). */
  tension() {
    const now = performance.now();
    if (!this.music || this.track === TENSE || now < this.tenseUntil) return;
    this.tenseUntil = now + 240000;
    this.next(true);
  }

  setVolume(k: 'musique' | 'effets' | 'voix', v: number) {
    this.vol[k] = Math.max(0, Math.min(1, v));
    if (k === 'musique' && this.music) this.music.volume = 0.32 * this.vol.musique;
    const g = k === 'effets' ? this.sfxOut : k === 'voix' ? this.voiceOut : null;
    if (g && this.ctx) g.gain.setTargetAtTime(this.vol[k], this.ctx.currentTime, 0.05);
  }
  setMuted(m: boolean) {
    this.muted = m;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
    if (this.music) { this.music.muted = m; if (!m && this.music.paused) this.music.play().catch(() => {}); }
  }

  private curVoice: AudioBufferSourceNode | null = null;
  private fire(name: string, volume: number): number {
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx || !this.out || this.ctx.state !== 'running') return 0;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; g.gain.value = volume; src.connect(g); g.connect((name.startsWith('voix/') ? this.voiceOut : this.sfxOut) ?? this.out); src.start();
    if (name.startsWith('voix/')) this.curVoice = src;
    return buf.duration;
  }
  // --- Sons synthétisés (aucun fichier) : désintégration, fracas métallique, grondement d'effondrement.
  private noise: AudioBuffer | null = null;
  private noiseBuf(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noise) { const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = b; }
    return this.noise;
  }
  private synthOk(name: string, volume: number, gap: number) {
    const now = performance.now();
    if (!this.ctx || !this.out || this.ctx.state !== 'running' || volume <= 0.02 || now - (this.last.get(name) ?? -1e9) < gap) return false;
    this.last.set(name, now); return true;
  }
  /** Bruit filtré qui décroît : `f0`→`f1` Hz en `dur` secondes. */
  private burst(volume: number, dur: number, f0: number, f1: number, type: BiquadFilterType = 'lowpass', delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxOut ?? this.out!); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  /** Fantassin désintégré : sifflement qui descend et grésillement. */
  zap(volume = 0.4) {
    if (!this.synthOk('zap', volume, 70)) return;
    const c = this.ctx!, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume * 0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); g.connect(this.sfxOut ?? this.out!); o.start(t); o.stop(t + 0.4);
    this.burst(volume * 0.5, 0.3, 6000, 900, 'bandpass');
  }
  /** Sons d'armes synthétisés : laser, plasma, départ de missile, départ d'obus d'artillerie, flak, rayon lourd. */
  arme(kind: 'laser' | 'plasma' | 'missile' | 'mortier' | 'flak' | 'rayon', volume = 0.4) {
    if (!this.synthOk('arme_' + kind, volume, kind === 'laser' ? 50 : 70)) return;
    const c = this.ctx!, t = c.currentTime;
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, v: number, delay = 0) => {
      const o = c.createOscillator(), g = c.createGain(), t0 = t + delay;
      o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(volume * v, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.sfxOut ?? this.out!); o.start(t0); o.stop(t0 + dur + 0.02);
    };
    if (kind === 'laser') { tone('sine', 2400, 320, 0.24, 0.22); tone('sawtooth', 1200, 160, 0.2, 0.06); this.burst(volume * 0.15, 0.12, 9000, 3000, 'highpass'); }
    else if (kind === 'plasma') { tone('square', 820, 140, 0.16, 0.07); tone('sine', 1600, 400, 0.12, 0.12); this.burst(volume * 0.25, 0.1, 3000, 900, 'bandpass'); }
    else if (kind === 'missile') { this.burst(volume * 0.7, 0.55, 500, 2800, 'bandpass'); tone('sawtooth', 160, 90, 0.4, 0.05); }
    else if (kind === 'mortier') { tone('sine', 110, 38, 0.38, 0.5); this.burst(volume * 0.8, 0.25, 900, 120, 'lowpass'); }
    else if (kind === 'flak') { this.burst(volume * 0.6, 0.07, 5000, 1200, 'bandpass'); this.burst(volume * 0.5, 0.07, 5000, 1200, 'bandpass', 0.07); this.burst(volume * 0.5, 0.07, 5000, 1200, 'bandpass', 0.14); }
    else { tone('sawtooth', 300, 60, 0.5, 0.14); tone('sine', 1400, 200, 0.45, 0.16); this.burst(volume * 0.5, 0.4, 2000, 300, 'lowpass'); }
  }
  /** Coup au corps à corps : choc métallique bref (lame), sourd et grave (marteau, poing de mech). */
  clang(volume = 0.4, heavy = false) {
    if (!this.synthOk('clang', volume, 60)) return;
    const c = this.ctx!, t = c.currentTime;
    for (const [f, k] of (heavy ? [[180, 1], [260, 0.6]] : [[1250 + Math.random() * 300, 1], [2380, 0.5], [3460, 0.3]]) as [number, number][]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = heavy ? 'triangle' : 'sine'; o.frequency.setValueAtTime(f, t); if (heavy) o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.25);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume * 0.22 * k, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.3 : 0.45));
      o.connect(g); g.connect(this.sfxOut ?? this.out!); o.start(t); o.stop(t + 0.5);
    }
    this.burst(volume * (heavy ? 0.9 : 0.5), heavy ? 0.22 : 0.08, heavy ? 1800 : 7000, heavy ? 200 : 2500, heavy ? 'lowpass' : 'highpass');
  }
  /** Véhicule détruit : fracas de tôle et pluie de débris. */
  crash(volume = 0.5) {
    if (!this.synthOk('crash', volume, 90)) return;
    this.burst(volume * 0.9, 0.5, 3200, 300, 'bandpass');
    for (let i = 0; i < 4; i++) this.burst(volume * 0.35, 0.12, 5000, 1500, 'highpass', 0.25 + i * 0.13 + Math.random() * 0.08);
  }
  /** Bâtiment effondré : long grondement grave, puis débris qui retombent. */
  rumble(volume = 0.7) {
    if (!this.synthOk('rumble', volume, 400)) return;
    this.burst(volume, 2.6, 420, 40);
    this.burst(volume * 0.6, 1.4, 1800, 200, 'lowpass', 0.3);
    for (let i = 0; i < 7; i++) this.burst(volume * 0.28, 0.14, 4000, 1200, 'bandpass', 0.6 + i * 0.22 + Math.random() * 0.1);
  }

  /** Une variante au hasard d'une famille de sons ; renvoie faux si rien n'a été joué (fichier absent). */
  sfxVar(group: string, volume = 0.5, gap = 60): boolean {
    const n = GROUPS[group], now = performance.now();
    if (!n || volume <= 0.02 || now - (this.last.get('g:' + group) ?? -1e9) < gap) return false;
    const d = this.fire(`sfx/${group}_${1 + Math.floor(Math.random() * n)}`, volume);
    if (d > 0) this.last.set('g:' + group, now);
    return d > 0;
  }
  /** Pluie de débris après une explosion. */
  debris(volume = 0.4, count = 4) {
    for (let i = 0; i < count; i++) setTimeout(() => { const now = performance.now(); this.last.set('g:debris', now - 1000); this.sfxVar('debris', volume * (0.6 + Math.random() * 0.4), 0); }, 250 + i * 160 + Math.random() * 120);
  }

  /** Bruitage ; `gap` = délai minimal en ms entre deux lectures du même son. */
  sfx(name: string, volume = 0.5, gap = 60) {
    const now = performance.now();
    if (volume <= 0.02 || now - (this.last.get(name) ?? -1e9) < gap) return;
    this.last.set(name, now);
    this.fire('sfx/' + name, volume);
  }
  /** Réplique. Une seule voix à la fois ; `force` coupe la file pour les annonces importantes. */
  voice(key: string | string[], force = false, gap = 2500) {
    const now = performance.now();
    const name = Array.isArray(key) ? key[Math.floor(Math.random() * key.length)] : key;
    const group = Array.isArray(key) ? key[0] : key;
    if ((!force && now < this.voiceUntil) || now - (this.last.get('v:' + group) ?? -1e9) < gap) return;
    // Une réplique forcée (ordre, annonce) coupe celle en cours : la sélection ne masque plus la réponse à l'ordre.
    if (force && now < this.voiceUntil) { try { this.curVoice?.stop(); } catch { /* déjà finie */ } }
    const d = this.fire(this.faction && this.buffers.has(`voix/${this.faction}/${name}`) ? `voix/${this.faction}/${name}` : 'voix/' + name, 0.95);
    if (d > 0) { this.last.set('v:' + group, now); this.voiceUntil = now + d * 1000 + 250; }
  }
}
