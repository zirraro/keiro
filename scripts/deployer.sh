#!/usr/bin/env bash
# Déployer : SSH d'abord, GitHub Actions en repli.
#
# ── Pourquoi cet ordre ──
#
# Le 6 août, le pare-feu d'entreprise a tué tout SSH sortant : le déploiement
# est passé par GitHub Actions, seul chemin qui restait. On y est resté par
# habitude, alors que le blocage, lui, a disparu — vérifié le 20 août, la
# poignée de main root aboutit.
#
# Or passer par GitHub coûte cher en aveuglement. Le 19 août, trois choses se
# sont empilées sans qu'aucune ne lève d'erreur :
#   · un hook pre-push lançant un typecheck complet faisait lâcher la connexion
#     GitHub en plein envoi (send-pack: unexpected disconnect) ;
#   · le push échouait donc en silence, trois tentatives pour faire passer un
#     commit de 319 lignes ;
#   · et le VPS avait DÉJÀ le code sans le servir — arbre de travail sur un
#     commit, production sur un autre, parce que la compilation n'allait pas au
#     bout et que GitHub marque « cancelled », ni succès ni échec, donc aucune
#     alerte.
#
# En SSH on voit la compilation échouer à la seconde où elle échoue. C'est la
# seule raison de le préférer : pas la vitesse, la visibilité.
#
# ── Ce que le script garantit ──
#
# Il ne dit JAMAIS « déployé » sans avoir relu la version réellement servie par
# la production. C'est le contrôle qui manquait : on a passé une journée à
# croire des déploiements faits parce que la commande était partie sans erreur.

set -uo pipefail

VPS="root@51.68.226.25"
CLE="${HOME}/.ssh/id_ed25519"
DEPOT="/opt/keiro"
URL="https://keiroai.com/api/version"

attendu=$(git rev-parse --short HEAD)
echo "→ commit à mettre en ligne : ${attendu}"

# ── Le code doit d'abord être sur GitHub, quel que soit le chemin ──
# Le VPS tire depuis origin : sans ça, SSH déploierait du code périmé en
# annonçant un succès. Le hook pre-push est contourné SCIEMMENT — le typecheck
# tourne juste avant, hors bande, parce que c'est lui qui fait tomber la
# connexion quand il s'exécute pendant l'envoi.
echo "→ typecheck…"
if ! npx tsc --noEmit -p tsconfig.json 2>&1 | grep -q "error TS"; then
  echo "  0 erreur"
else
  echo "  ✗ ERREURS TYPESCRIPT — rien ne part"; exit 1
fi

echo "→ envoi vers GitHub (le push casse sur certains réseaux : jusqu'à 3 essais)…"
for i in 1 2 3; do
  timeout 200 git push --no-verify origin main >/dev/null 2>&1
  [ "$(git rev-parse --short origin/main)" = "${attendu}" ] && break
  echo "  essai ${i} incomplet"
done
if [ "$(git rev-parse --short origin/main)" != "${attendu}" ]; then
  echo "  ✗ GitHub n'a pas reçu ${attendu} — on s'arrête plutôt que de déployer du périmé"; exit 1
fi
echo "  GitHub à jour"

# ── Chemin 1 : SSH ──
deployer_par_ssh() {
  timeout 30 ssh -o BatchMode=yes -o ConnectTimeout=15 -i "${CLE}" "${VPS}" true 2>/dev/null || return 1
  echo "→ SSH disponible, déploiement direct"
  timeout 900 ssh -o BatchMode=yes -o ServerAliveInterval=30 -i "${CLE}" "${VPS}" "
    set -e
    cd ${DEPOT}
    git fetch origin main -q && git reset --hard origin/main -q
    npm install --no-audit --no-fund >/tmp/npm.log 2>&1
    npm run build >/tmp/build.log 2>&1 || { echo BUILD_KO; tail -30 /tmp/build.log; exit 1; }
    pm2 reload all --update-env >/dev/null 2>&1
  "
}

# ── Chemin 2 : GitHub Actions, quand le pare-feu bloque SSH ──
deployer_par_actions() {
  local jeton="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  [ -z "${jeton}" ] && { echo "  ✗ pas de jeton GitHub : impossible de déclencher le workflow"; return 1; }
  echo "→ SSH indisponible, bascule sur GitHub Actions"
  curl -s -X POST -H "Authorization: Bearer ${jeton}" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/zirraro/keiro/actions/workflows/deploy-vps.yml/dispatches" \
    -d '{"ref":"main"}' >/dev/null || return 1
  echo "  workflow déclenché — 7 à 36 min d'après l'historique"
}

deployer_par_ssh || deployer_par_actions || { echo "✗ AUCUN CHEMIN DE DÉPLOIEMENT"; exit 1; }

# ── La seule preuve qui compte : ce que la production sert ──
echo "→ vérification de la version servie…"
for _ in $(seq 1 40); do
  servi=$(curl -s --max-time 15 "${URL}" | grep -o '"shortSha":"[^"]*"' | cut -d'"' -f4)
  if [ "${servi}" = "${attendu}" ]; then
    echo "✓ EN LIGNE — la production sert ${servi}"; exit 0
  fi
  sleep 30
done

echo "✗ NON CONFIRMÉ — la production sert « ${servi:-?} », on attendait ${attendu}"
echo "  Le code est peut-être sur le VPS sans être servi : c'est le piège du 19 août"
echo "  (arbre de travail à jour, compilation non terminée, production sur l'ancien)."
exit 1
