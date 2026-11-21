// Relais pour les réseaux qui bloquent la connexion directe (souvent en 4G/5G) : serveur TURN gratuit Open Relay de Metered.
// Il faut un compte gratuit Metered : nom de l'appli (xxx.metered.live) et clé d'API, à mettre ici ou dans les réglages.
export const METERED = { app: '', key: '' };
let extra: RTCIceServer[] = [];
export const relayIce = () => extra;
/** Charge les identifiants du relais (une fois). Sans clé, on reste en connexion directe seule. */
export async function loadRelay(): Promise<boolean> {
  let cfg = METERED;
  try { const v = JSON.parse(localStorage.getItem('relais') || 'null'); if (v?.app && v?.key) cfg = v; } catch { /* réglage absent */ }
  if (!cfg.app || !cfg.key || extra.length) return extra.length > 0;
  try {
    const r = await fetch(`https://${cfg.app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(cfg.key)}`);
    if (r.ok) { const a = await r.json(); if (Array.isArray(a)) extra = a; }
  } catch { /* réseau : connexion directe seulement */ }
  return extra.length > 0;
}
