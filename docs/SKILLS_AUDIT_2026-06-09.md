# Skills audit — 2026-06-09

Audit time-boxé d'un skill candidat côté dev (Claude Code) avant
décision d'install. Source la plus fiable = repo officiel
`anthropics/skills` (pas la registry communautaire skills.sh).

## Candidat audité : `webapp-testing`

URL : https://github.com/anthropics/skills/tree/main/skills/webapp-testing

**Contenu** :
- `SKILL.md` (3 913 octets)
- `scripts/with_server.py` (3 693 octets)
- `LICENSE.txt`

Aucun autre fichier — surface d'attaque minimale.

### Audit SKILL.md

| Critère                                | Verdict | Note |
|----------------------------------------|---------|------|
| Commandes shell exécutées              | ⚠️      | `python scripts/with_server.py --server "..."` accepte un shell-command arbitraire |
| Env vars / fichiers hors cwd lus       | ✅      | Aucun |
| Réseau externe (hors localhost)        | ✅      | Aucun — strictement localhost |
| Écritures hors /tmp                    | ✅      | Seul `/tmp/inspect.png` |
| Tokens/secrets requis                  | ✅      | Aucun |
| Install pip/npm                        | ⚠️      | Suppose `playwright` déjà installé + npm dispo |
| Prompt-injection vector                | ⚠️      | Le `--server` arg = self-inflicted si on y met une chaîne sale |

### Audit `with_server.py`

```python
# Line 65 — flagged
subprocess.Popen(server['cmd'], shell=True, ...)
```

`shell=True` est dangereux quand l'input vient d'une source non-fiable.
Dans notre usage (Claude Code dev en local), c'est NOUS qui rédigeons
le `--server` arg → risque self-inflicted contrôlable.

- Ligne 18 : `socket.create_connection('localhost', port)` — localhost only ✓
- Ligne 80 : `subprocess.run(args.command)` — utilise list (pas shell=True) ✓
- Pas de pickle / yaml.load
- Pas de lecture env vars

### Verdict global

✅ **Skill safe à installer** sur la couche dev, **sous conditions** :

1. Ne JAMAIS le lancer avec `.env.local` accessible (variables Supabase/
   Stripe/Meta exposées au sous-process via env hérité)
2. Ne JAMAIS passer une chaîne externe dans `--server`
3. Run dans un dev environment séparé de la prod (déjà le cas chez nous)

## Décision pour KeiroAI

**N'install pas pour l'instant.** Le skill est techniquement safe MAIS :

- Notre Next.js dev workflow n'utilise pas playwright actuellement
- Notre QA agents passe par `/api/meta-review/agent-checks` (scénarios
  canoniques Hugo + Théo) — pattern qui marche déjà
- L'install ajouterait une dépendance Python + Playwright à maintenir
- ROI marginal vs. l'effort

Si on veut un jour ajouter du browser testing : **on l'installera
manuellement et explicitement**, en isolant l'env Python du process
qui a accès aux `.env.local`. Pas par défaut.

## Skills SKIPPÉS (registry communautaire skills.sh)

Pas audités. Catégoriquement écartés sans audit ligne-par-ligne du
`SKILL.md` ET de tous les `scripts/`. Justification :

- Source non vérifiée → risque exfiltration de secrets via call
  réseau "innocent" dans un script
- Anthropic doc explicite : "Skills malveillants peuvent invoquer
  des outils ou exécuter du code d'une manière qui ne correspond
  pas à l'objectif affiché"
- Notre attack surface (PAT Supabase, CRON_SECRET, Meta secrets,
  Stripe webhook) = compromission totale si fuite

## Règle générale appliquée

| Source                          | Auto-install | Audit requis | Notes |
|--------------------------------|--------------|--------------|-------|
| `anthropics/skills` officiel    | ❌ jamais auto | ✅ ligne-par-ligne | Bonne base de confiance |
| skills.sh communautaire         | ❌ jamais       | ✅ + scrutin scripts | Risque élevé |
| Skill interne (lib/validators/) | ✅              | N/A          | C'est notre code, on contrôle |

## Notre approche actuelle

Pas besoin de skills externes — nos `lib/validators/*` couvrent le
même pattern fonctionnel (validation déterministe post-LLM) :
- caption.ts
- visual-coherence.ts
- image-prompt.ts (pre-Seedream)
- video-prompt.ts (pre-Kling/Seedance)
- media-output.ts (post-gen)

26/26 tests passent, déployé, économise des appels API ratés, et
zéro dépendance externe / zéro container Anthropic / zéro risque
sécurité.
