#!/usr/bin/env bash
# Diagnostic et remise en route de l'application, exécuté sur le VPS.
#
# ── Pourquoi ce fichier ──
#
# 2026-08-11, le site est tombé et je n'avais plus aucune main : SSH banni
# depuis le poste, journaux GitHub inaccessibles sans droits d'administration
# du dépôt, et le déploiement échouait sans dire pourquoi. On répare à
# l'aveugle, ce qui est la pire situation possible pendant une panne.
#
# Ce script rend l'état du VPS lisible depuis l'extérieur, puis tente la
# remise en route. Sa sortie est rapatriée dans le dépôt.
#
# ── Le dépôt est PUBLIC : rien de secret ne doit sortir d'ici ──
#
# Interdits absolus : `pm2 describe` et `pm2 env` (ils impriment toutes les
# variables d'environnement), `cat .env.local`, `printenv`. Les journaux
# d'erreur passent par un filtre qui masque toute suite de 24 caractères ou
# plus — une clé d'API y ressemble, une phrase française non.

echo "═══════════ DIAGNOSTIC VPS $(date -u +%Y-%m-%dT%H:%M:%SZ) ═══════════"
cd /opt/keiro || { echo "✗ /opt/keiro introuvable"; exit 1; }

echo
echo "── version du code sur le disque ──"
git log --oneline -2 2>&1 | head -2

echo
echo "── build présent ? ──"
if [ -f .next/BUILD_ID ]; then
  echo "✓ .next/BUILD_ID = $(cat .next/BUILD_ID)"
  echo "  routes serveur : $(find .next/server/app -name 'route.js' 2>/dev/null | wc -l)"
  echo "  fichiers statiques : $(find .next/static -type f 2>/dev/null | wc -l)"
else
  echo "✗ .next/BUILD_ID ABSENT — le build sur le disque est inutilisable"
fi

echo
echo "── pm2 (sans variables d'environnement) ──"
pm2 jlist 2>/dev/null | node -e "
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    try {
      for (const p of JSON.parse(s)) {
        const e = p.pm2_env || {};
        console.log([
          p.name, 'status=' + e.status, 'mode=' + e.exec_mode,
          'restarts=' + e.restart_time, 'unstable=' + e.unstable_restarts,
          'listen_timeout=' + (e.listen_timeout ?? '-'),
          'wait_ready=' + (e.wait_ready ?? '-'),
        ].join(' '));
      }
    } catch (err) { console.log('illisible:', err.message); }
  });
" 2>&1 || echo "pm2 muet"

echo
echo "── qui écoute le port 3000 ──"
(ss -ltn 2>/dev/null | grep -E ':3000' || echo "personne sur 3000")

echo
echo "── réponse locale ──"
echo "127.0.0.1:3000/api/version → $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/api/version || echo injoignable)"

echo
echo "── ce qui sert le HTTPS ──"
for s in nginx caddy apache2; do
  printf '%s: %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null || echo absent)"
done

echo
echo "── ressources ──"
df -h / | tail -1
free -m | head -2 | tail -1

echo
echo "── 40 dernières lignes d'erreur (secrets masqués) ──"
tail -40 /opt/keiro/logs/*error*.log 2>/dev/null \
  | sed -E 's/[A-Za-z0-9_-]{24,}/[MASQUE]/g' \
  || echo "(aucun journal d'erreur lisible)"

echo
echo "═══════════ REMISE EN ROUTE ═══════════"

# Un build inutilisable rend toute relance vaine : c'est le seul cas où ce
# script compile.
if [ ! -f .next/BUILD_ID ]; then
  echo "▶ reconstruction (le disque ne porte pas de build utilisable)"
  npm ci --no-audit --no-fund 2>&1 | tail -3
  rm -rf .next
  npm run build 2>&1 | tail -12
fi

echo "▶ pm2 : on recrée l'application"
# ── Le processus parasite « ecosystem.app » ──
#
# Cause de la panne du 11 août, lue dans ce diagnostic même. pm2 ne reconnaît
# un fichier de configuration qu'au suffixe `.config.js` / `.config.cjs`. Le
# fichier s'appelait `ecosystem.app.cjs` : pm2 ne l'a pas lu comme une
# configuration, il l'a lancé comme un SCRIPT ordinaire, en mode fork, sous le
# nom `ecosystem.app`. Ce script n'est qu'un module qui exporte un objet — il
# ne sert rien. pm2 l'affichait « online », personne n'écoutait le port 3000,
# et `pm2 delete keiro-app` ne trouvait rien à supprimer.
#
# Le fichier s'appelle maintenant `app.config.cjs`. On nettoie l'ancien nom,
# sans quoi il resterait à traîner et « Script already launched » bloquerait
# toute relance.
pm2 delete keiro-app >/dev/null 2>&1 || true
pm2 delete ecosystem.app >/dev/null 2>&1 || true
pm2 start app.config.cjs 2>&1 | tail -6

# On vérifie que pm2 a bien créé ce qu'on croit : le bon nom, le bon mode.
# Sans ce contrôle, la panne d'aujourd'hui se rejouerait à l'identique — pm2
# annonçait un succès en ayant lancé tout autre chose.
pm2 jlist 2>/dev/null | node -e "
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    try {
      const l = JSON.parse(s).filter(x => x.name === 'keiro-app');
      if (!l.length) { console.log('✗ ALERTE : aucun processus nommé keiro-app — pm2 n\'a pas lu la configuration'); return; }
      const cluster = l.every(x => x.pm2_env.exec_mode === 'cluster_mode');
      console.log((cluster ? '✓' : '✗ ALERTE :') + ' keiro-app × ' + l.length + ' en mode ' + l[0].pm2_env.exec_mode);
    } catch { console.log('✗ état pm2 illisible'); }
  });
"
pm2 reload keiro-worker --update-env >/dev/null 2>&1 || pm2 start worker/ecosystem.config.cjs >/dev/null 2>&1 || true
pm2 save --force >/dev/null 2>&1 || true

echo "▶ on laisse Next démarrer"
code=000
for i in $(seq 1 24); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/api/version || echo 000)
  echo "  tentative $i : $code"
  [ "$code" = "200" ] && break
  sleep 5
done

echo
echo "── état final ──"
pm2 jlist 2>/dev/null | node -e "
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    try { for (const p of JSON.parse(s)) console.log(p.name, p.pm2_env.status, 'restarts=' + p.pm2_env.restart_time); }
    catch { console.log('illisible'); }
  });
"
echo "local  → $code"
echo "public → $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://keiroai.com/api/version || echo injoignable)"

# Si l'application ne répond toujours pas localement, les toutes dernières
# lignes d'erreur sont ce qui manque le plus — masquées, elles aussi.
if [ "$code" != "200" ]; then
  echo
  echo "── elle ne démarre pas : dernières erreurs (masquées) ──"
  tail -30 /opt/keiro/logs/*error*.log 2>/dev/null \
    | sed -E 's/[A-Za-z0-9_-]{24,}/[MASQUE]/g' || true
  pm2 logs keiro-app --nostream --lines 25 --err 2>/dev/null \
    | sed -E 's/[A-Za-z0-9_-]{24,}/[MASQUE]/g' || true
fi
