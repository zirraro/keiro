/**
 * Configuration pm2 de l'application web.
 *
 * ── Pourquoi ce fichier, et pas une ligne de commande ──
 *
 * Le passage en mode cluster (2026-08-11) a supprimé l'essentiel de la coupure
 * au déploiement, mais PAS toute : la mesure faite depuis l'extérieur, une
 * requête par seconde pendant le déploiement, montrait encore une réponse 502
 * juste avant que la nouvelle version prenne la main.
 *
 * Explication. En cluster, `pm2 reload` remplace les processus un par un, ce
 * qui suppose que le nouveau soit capable de répondre avant qu'on arrête
 * l'ancien. Or pm2 considère un processus « prêt » dès qu'il démarre, alors
 * que Next met plusieurs secondes à charger l'application et à écouter. Entre
 * les deux, plus personne n'écoute le port : c'est là que tombait le 502.
 *
 * ── PANNE DU 2026-08-11, ET CE QU'ELLE A APPRIS ──
 *
 * Première version de ce fichier : `wait_ready: true`, en pariant que pm2
 * attendrait le délai puis poursuivrait faute de signal. Faux, et cher payé.
 *
 * Le premier DÉMARRAGE s'est bien passé — `wait_ready` ne joue qu'au
 * rechargement. Au premier `pm2 reload`, pm2 a attendu un signal `ready` que
 * Next n'envoie pas (il n'a jamais été écrit pour pm2), a considéré les
 * nouveaux processus défaillants, et a tout arrêté. Le site est resté
 * indisponible sept minutes, et le déploiement s'est déclaré en échec.
 *
 * La bonne mécanique était là depuis le début, sans rien demander : en mode
 * cluster, pm2 attend l'événement « listening » du processus — celui que Node
 * émet quand le port est réellement pris — avant d'arrêter l'ancien.
 * `listen_timeout` borne cette attente. C'est exactement le délai de grâce
 * qu'on cherchait, et il n'a jamais eu besoin de `wait_ready`.
 *
 * Leçon : un réglage qui améliore le démarrage peut casser le rechargement.
 * Les deux chemins se testent séparément.
 *
 * Ces réglages ne se passent pas en ligne de commande — d'où ce fichier, qui
 * a l'avantage d'être versionné avec le reste.
 */

module.exports = {
  apps: [
    {
      name: 'keiro-app',
      // Le binaire de Next, pas `npm start` : le mode cluster a besoin d'un
      // script Node, un script shell ne peut pas partager le port.
      script: './node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/opt/keiro',

      exec_mode: 'cluster',
      // Deux instances suffisent : quatre cœurs, et une application qui attend
      // surtout des entrées-sorties. Ce qu'on cherche ici est la continuité de
      // service pendant le remplacement, pas la puissance de calcul.
      instances: 2,

      // Le délai de grâce décrit plus haut : pm2 attend que le nouveau
      // processus ÉCOUTE vraiment avant d'arrêter l'ancien. Next démarre en
      // cinq à dix secondes ; vingt-cinq laissent de la marge un jour de
      // charge. Surtout, PAS de `wait_ready` — voir l'en-tête, c'est ce qui a
      // mis le site à terre.
      listen_timeout: 25000,

      // Laisse aux requêtes en cours le temps de se terminer avant l'arrêt.
      // Sans ça, on ne coupe plus le service mais on coupe des réponses.
      kill_timeout: 10000,

      env: { NODE_ENV: 'production' },

      // Un redémarrage en boucle sur une application cassée doit s'arrêter et
      // se voir, pas consommer la machine en silence.
      max_restarts: 10,
      min_uptime: '30s',
    },
  ],
};
