#!/usr/bin/env bash
# KeiroAI deploy — pull, build, reload, then PROVE it went live from OUTSIDE.
# A deploy is only "done" when https://keiroai.com/api/version returns the SHA
# we just built. Run on the VPS from /opt/keiro: bash scripts/deploy.sh
set -euo pipefail

cd /opt/keiro

# ── Aucun build ne doit tourner quand celui-ci commence ──
#
# 2026-08-11. Deux déploiements de suite ont échoué de deux façons différentes :
# « SyntaxError: Unexpected end of JSON input » pendant la collecte des pages,
# puis « next: not found » après un npm ci criblé de TAR_ENTRY_ERROR.
#
# Même cause : un `next build` lancé la VEILLE tournait encore. Deux builds
# écrivant dans le même .next produisent des fichiers lus à moitié, et un
# npm ci qui remplace node_modules sous un processus qui le lit produit une
# extraction trouée. Le second échec est le plus vicieux : node_modules restait
# cassé, et l'application ne serait pas repartie au redémarrage suivant.
#
# On ne se contente pas de tuer : un build lancé il y a deux minutes est
# probablement un autre déploiement en cours, et lui passer dessus ferait
# exactement le dégât qu'on veut éviter.
echo "▶ vérification qu'aucun build ne tourne déjà"
for pid in $(pgrep -f 'next build' 2>/dev/null || true); do
  age=$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ' || echo 0)
  if [ -n "$age" ] && [ "$age" -gt 1800 ]; then
    echo "  ⚠ build abandonné depuis $((age / 60)) min (pid $pid) — on le termine"
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "✗ un build tourne depuis $((age / 60)) min (pid $pid) : un autre déploiement est probablement en cours."
    echo "  Attendre qu'il finisse. Passer par-dessus corromprait .next et node_modules."
    exit 1
  fi
done

echo "▶ git pull --rebase"
git pull --rebase

# Normalise to 7 chars to match /api/version's shortSha.
EXPECTED_SHA="$(git rev-parse --short=7 HEAD)"
echo "▶ target commit: $EXPECTED_SHA"

echo "▶ npm ci"
npm ci --no-audit --no-fund

# Build PROPRE, jamais incrémental.
#
# Incident 2026-08-05 : un build par-dessus un .next existant a laissé des
# manifestes manquants (route_client-reference-manifest.js). Les routes
# concernées répondaient 500, et le client voyait sa galerie, ses vidéos et
# tous ses brouillons VIDES — alors que rien n'avait été perdu en base. Un
# client ne doit jamais voir ça, et le symptôme ne ressemble en rien à sa
# cause : impossible à diagnostiquer vite.
#
# Reconstruire de zéro coûte une minute de plus par déploiement. C'est le prix
# à payer pour que ce mode de panne n'existe plus.
# ── Les fichiers de l'ANCIENNE version doivent survivre au déploiement ──
#
# Incident 2026-08-10. Le fondateur, en pleine utilisation : « Application
# error: a client-side exception has occurred ». Puis, lui-même : « en fait je
# me rends compte que c'est parce que tu travailles sur le site — quand tu mets
# à jour, ça bloque certaines fonctions. Sur Vercel ça marchait bien. »
#
# Diagnostic exact. Next.js découpe l'application en fichiers JavaScript dont le
# nom contient une empreinte du contenu : à chaque build, de nouveaux noms. Un
# navigateur qui a chargé la page AVANT le déploiement continue de réclamer les
# ANCIENS noms — au premier clic sur un onglet, à l'ouverture d'un éditeur. Le
# "rm -rf .next" les avait effacés : 404, et l'application entière tombe.
#
# Vercel ne connaît pas ce problème parce qu'il garde les versions précédentes
# en ligne et bascule le trafic sans rien supprimer. On reproduit ce
# comportement : on met de côté les fichiers statiques de la version en place,
# on reconstruit proprement, puis on remet les anciens À CÔTÉ des nouveaux.
#
# Les noms contenant une empreinte, aucune collision n'est possible : un ancien
# fichier ne peut pas écraser un nouveau. On garde donc les deux, et une session
# ouverte pendant le déploiement continue de fonctionner.
ANCIENS=/opt/keiro/.next-anciens
mkdir -p "$ANCIENS"
if [ -d .next/static ]; then
  echo "▶ mise de côté des fichiers de la version en place"
  cp -rn .next/static/. "$ANCIENS/" 2>/dev/null || true
fi

echo "▶ build propre (suppression de .next)"
# Une seconde tentative, parce que le build échoue parfois sans raison.
#
# 2026-08-11 : « Build error occurred / SyntaxError: Unexpected end of JSON
# input » pendant la collecte des pages. Le même commit, relancé sans changer
# une ligne, est passé. Le code compilait, les types étaient bons — la collecte
# lit un fichier que le build vient d'écrire, et elle l'a lu vide.
#
# Un échec de cette nature interrompt un déploiement légitime, et on cherche le
# bug pendant vingt minutes dans du code qui n'a rien. Deux tentatives : si la
# seconde échoue aussi, c'est un vrai problème et on s'arrête pour de bon.
rm -rf .next
if ! npm run build; then
  echo "⚠ build en échec — seconde tentative (le build est non déterministe par moments)"
  rm -rf .next
  npm run build
fi

# On remet les anciens fichiers À CÔTÉ des nouveaux, sans jamais écraser (-n) :
# les nouveaux font foi, les anciens ne servent qu'aux sessions déjà ouvertes.
# Purge au-delà de 7 jours — passé ce délai plus aucune session ne les réclame,
# et le disque n'a pas à porter l'historique complet.
#
# ⚠ CETTE ÉTAPE DOIT RESTER AVANT LE `pm2 reload`. Vérifié en production le
# 10 août : Next.js recense les fichiers de .next/static UNE SEULE FOIS, au
# démarrage du serveur. Un fichier déposé après le reload renvoie 404 même
# s'il est bien sur le disque (testé : 404 avant reload, 200 après). Déplacer
# cette restauration après le reload rendrait tout ce dispositif inopérant,
# sans le moindre message d'erreur.
if [ -d "$ANCIENS" ]; then
  echo "▶ conservation des fichiers des versions précédentes"
  cp -rn "$ANCIENS/." .next/static/ 2>/dev/null || true
  find "$ANCIENS" -type f -mtime +7 -delete 2>/dev/null || true
  find "$ANCIENS" -type d -empty -delete 2>/dev/null || true
fi


# Filet de sécurité : si un manifeste manque malgré tout, on arrête AVANT le
# reload plutôt que de mettre en ligne une application aux routes mortes.
echo "▶ vérification des manifestes de routes"
missing=0
while IFS= read -r routedir; do
  if [ ! -f "$routedir/route_client-reference-manifest.js" ]; then
    echo "  ✗ manifeste manquant : $routedir"
    missing=$((missing + 1))
  fi
done < <(find .next/server/app/api -name 'route.js' -exec dirname {} \; 2>/dev/null)
if [ "$missing" -gt 0 ]; then
  echo "✗ $missing manifeste(s) manquant(s) — déploiement interrompu, l'application resterait cassée."
  exit 1
fi
echo "  ✓ manifestes complets"

# pm2 : recharger si le processus existe, le DÉMARRER sinon.
#
# `pm2 reload` échoue quand le processus n'est pas dans la liste — ce qui arrive
# après un redémarrage de la machine, pm2 repartant vide. Le `|| true` sur le
# worker masquait alors l'échec : le déploiement s'annonçait réussi, le site
# revenait, et le worker restait éteint. Aucun cron ne tournait plus, sans la
# moindre alerte, puisque c'est précisément le worker qui les déclenche.
#
# C'est arrivé le 6 août : 57 minutes sans le moindre agent, découvertes par
# hasard en regardant les journaux.
#
# ── Et surtout : le site ne doit pas tomber pendant la mise à jour ──
#
# Fondateur, 2026-08-11 : « quand on met à jour, le site saute, donc pas
# accessible au client, ou alors certaines fonctions non accessibles à ce
# moment-là. » Constat exact.
#
# keiro-app tournait en mode « fork » : UN seul processus. Dans ce mode,
# `pm2 reload` ne peut rien faire d'autre que l'arrêter puis le relancer, et
# Next met plusieurs secondes à démarrer. Pendant tout ce temps, plus personne
# n'est servi — le client tombe sur une erreur de passerelle.
#
# En mode « cluster », pm2 lance plusieurs processus qui se partagent le port
# par le module cluster de Node, et `pm2 reload` les remplace UN PAR UN : il
# reste toujours un processus pour répondre. C'est le principe qui permet à
# Vercel de déployer sans coupure.
#
# Deux instances suffisent : le VPS a quatre cœurs et l'application attend
# surtout des entrées-sorties. Vérifié avant d'oser : `next start` de Next 15
# écoute DANS son processus (aucun enfant), et son unique reprise sur
# EADDRINUSE est réservée au mode développement — rien ne s'oppose au partage
# de port. On lance donc le binaire de Next directement, et non `npm start` :
# le mode cluster a besoin d'un script Node, pas d'un script shell.
INSTANCES=2

# On ne regarde pas seulement le mode, mais aussi le DÉLAI DE GRÂCE.
#
# Le processus en place a pu être lancé en cluster sans ces réglages — c'était
# le cas après la première bascule. Un `pm2 reload` ne les lui appliquerait
# pas : pm2 recharge le code, pas les options d'un processus déjà démarré. On
# resterait donc en cluster, avec la seconde de coupure qu'on cherche à
# supprimer, et rien ne le signalerait.
mode_actuel="$(pm2 jlist 2>/dev/null | node -e "
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    try {
      const app = JSON.parse(s).find(x => x.name === 'keiro-app');
      if (!app) return process.stdout.write('absent');
      const cluster = app.pm2_env.exec_mode === 'cluster_mode';
      const grace = Number(app.pm2_env.listen_timeout || 0) >= 20000;
      // wait_ready attend un signal que Next n'envoie jamais : au rechargement,
      // pm2 déclare les nouveaux processus défaillants et arrête tout. Un
      // processus qui le porte encore doit être recréé, pas rechargé.
      const piege = app.pm2_env.wait_ready === true;
      const sain = app.pm2_env.status === 'online';
      process.stdout.write(cluster && grace && !piege && sain ? 'cluster_mode' : cluster ? 'cluster_a_recreer' : 'fork');
    } catch { process.stdout.write('inconnu'); }
  });
" 2>/dev/null || echo inconnu)"

# Les réglages qui suppriment la dernière seconde de coupure (wait_ready,
# listen_timeout, kill_timeout) ne s'expriment pas en ligne de commande : ils
# vivent dans ecosystem.app.cjs, versionné avec le reste.
echo "▶ pm2 (keiro-app en mode $mode_actuel)"
if [ "$mode_actuel" = "cluster_mode" ]; then
  # Déjà en cluster et sain : remplacement un par un, délai de grâce respecté.
  #
  # Le repli n'est PAS décoratif. Le 11 août, un rechargement a échoué et a
  # laissé le site indisponible sept minutes : `set -e` a arrêté le script
  # juste après, donc personne n'a relancé l'application. Un déploiement qui
  # échoue doit laisser le service DEBOUT — c'est toute la règle.
  if ! pm2 reload ecosystem.app.cjs --update-env; then
    echo "  ⚠ rechargement en échec — on recrée l'application pour ne pas laisser le site à terre"
    pm2 delete keiro-app >/dev/null 2>&1 || true
    pm2 start ecosystem.app.cjs
  fi
else
  # Bascule ou remise d'aplomb. C'est le SEUL moment où le site se coupe
  # quelques secondes.
  echo "  ▶ (re)création en mode cluster ($INSTANCES instances)"
  pm2 delete keiro-app >/dev/null 2>&1 || true
  pm2 start ecosystem.app.cjs
fi
pm2 reload keiro-worker --update-env 2>/dev/null || pm2 start worker/ecosystem.config.cjs

# Persiste la liste : sans ça, un redémarrage de la machine repart sur une pm2
# vide et plus rien ne se relance tout seul.
pm2 save --force >/dev/null 2>&1 || true

# Contrôle explicite : les deux services DOIVENT être en ligne. Un déploiement
# qui laisse le worker éteint n'est pas un déploiement réussi.
#
# On compte par NOM, pas en additionnant les « online ». Depuis le passage en
# cluster, keiro-app compte pour deux processus : un simple total de 2 serait
# atteint par les deux instances de l'application seules, worker éteint — le
# contrôle validerait exactement la panne qu'il est censé détecter (57 minutes
# sans le moindre agent, le 6 août).
etat="$(pm2 jlist 2>/dev/null | node -e "
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    try {
      const l = JSON.parse(s);
      const enLigne = n => l.filter(x => x.name === n && x.pm2_env.status === 'online').length;
      process.stdout.write(enLigne('keiro-app') + ' ' + enLigne('keiro-worker'));
    } catch { process.stdout.write('0 0'); }
  });
")"
app_online="${etat% *}"; worker_online="${etat#* }"
if [ "${app_online:-0}" -lt 1 ]; then
  # Dernière chance avant d'abandonner : on recrée. Constater que le site est
  # mort et s'arrêter là est la pire des sorties — c'est littéralement ce qui
  # s'est passé le 11 août.
  echo "  ⚠ aucune instance en ligne — tentative de remise en route"
  pm2 delete keiro-app >/dev/null 2>&1 || true
  pm2 start ecosystem.app.cjs || true
  sleep 12
  app_online=$(pm2 jlist 2>/dev/null | node -e "
    let s = '';
    process.stdin.on('data', d => s += d).on('end', () => {
      try { process.stdout.write(String(JSON.parse(s).filter(x => x.name === 'keiro-app' && x.pm2_env.status === 'online').length)); }
      catch { process.stdout.write('0'); }
    });
  ")
fi
if [ "${app_online:-0}" -lt 1 ] || [ "${worker_online:-0}" -lt 1 ]; then
  echo "✗ pm2 : keiro-app=$app_online instance(s), keiro-worker=$worker_online — les deux sont requis"
  pm2 list
  exit 1
fi
echo "  ✓ keiro-app ($app_online instance(s)) et keiro-worker en ligne"

# Give the app a moment to come up, then verify from the PUBLIC URL (apex + www).
sleep 4
fail=0
for host in "https://keiroai.com" "https://www.keiroai.com"; do
  got="$(curl -fsSL --max-time 15 "$host/api/version?ts=$(date +%s)" | grep -oE '"shortSha":"[^"]+"' | cut -d'"' -f4 || echo "ERR")"
  got="${got:0:7}"
  if [ "$got" = "$EXPECTED_SHA" ]; then
    echo "✅ $host serves $got"
  else
    echo "❌ $host serves '$got' — expected '$EXPECTED_SHA' (cache or routing issue)"
    fail=1
  fi
done

if [ "$fail" = "1" ]; then
  echo "🚨 DEPLOY NOT LIVE on the public URL. Investigate cache/proxy/DNS before declaring done."
  exit 1
fi
echo "🎉 Deploy verified live on public URL ($EXPECTED_SHA)."
