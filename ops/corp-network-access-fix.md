# Fix accès keiroai.com depuis réseaux corporate (filtres URL)

## Diagnostic 2026-06-08

| Couche | État |
|--------|------|
| TLS protocols | ✅ TLS 1.2/1.3 only (1.0/1.1 désactivés) |
| Cipher suites | ✅ Modern AEAD only (ECDHE + AES-GCM / ChaCha20) |
| Certificat | ✅ Let's Encrypt R12, chain complet |
| Headers sécurité | ✅ HSTS preload + CSP + X-Frame + X-Content-Type-Options |
| HTTP/2 | ✅ Activé |
| Server header | ✅ Pas de version exposée |
| **IP hosting** | ❌ OVH SAS `51.68.226.25` — catégorisée "VPS hosting" / "uncategorized" |

Le rejet corp ne vient PAS de la sécurité. Il vient de **l'IP OVH** que les
firewalls d'entreprise (Fortinet FortiGuard, Cisco Talos, Palo Alto URL
Filtering, Zscaler, Symantec WebPulse, McAfee TrustedSource) flaggent
par défaut comme "VPS Hosting" / "Untrusted Source" parce qu'OVH est
massivement utilisé pour de l'infra C2 / spam / phishing.

Vercel marchait parce que leurs IPs (AWS/Cloudflare edge) sont
universellement whitelistées comme "Content Delivery Network".

## Fix recommandé : Cloudflare en proxy (gratuit)

Cloudflare a 5 effets immédiats :
1. Les IPs Cloudflare sont universellement trusted par les firewalls corp.
2. WAF gratuit + DDoS protection.
3. CDN global → latence client baisse.
4. Cache statique automatique sur les assets Next.js.
5. TLS 1.3 + HTTP/3 par défaut.

### Étapes (30 min, zéro downtime)

1. **Créer un compte Cloudflare** sur cloudflare.com (free plan).
2. **Add a Site** → entrer `keiroai.com`.
3. CF scanne les enregistrements DNS actuels d'OVH ; vérifier que tout
   y est (A, AAAA, MX, TXT pour SPF/DKIM/DMARC, CNAME).
4. CF te donne 2 nameservers (`xxx.ns.cloudflare.com`).
5. Connecter à **OVH Manager → Domaines → keiroai.com → Serveurs DNS**
   et remplacer les NS OVH par les 2 NS Cloudflare.
6. Propagation NS : 5 min à 48h (souvent < 1h).
7. Une fois actif (icône orange "proxied" sur l'enregistrement A
   pointant vers 51.68.226.25), tester sur le navigateur corp.

### Vérifs post-bascule

```bash
# 1. Vérifie que le trafic passe bien par CF (server: cloudflare)
curl -sI https://keiroai.com | head -5
# Attendu : "Server: cloudflare", "CF-RAY: xxx"

# 2. Vérifie que le certificat est CF Universal SSL ou ECC Edge
openssl s_client -connect keiroai.com:443 -servername keiroai.com </dev/null 2>&1 | grep issuer
# Attendu : "Google Trust Services" ou "Cloudflare Inc ECC CA-3"
```

### Important : configuration CF

Aller dans **SSL/TLS → Overview** :
- Encryption mode : **Full (strict)** (le VPS a déjà un cert LE valide)
- Min TLS Version : **TLS 1.2**
- TLS 1.3 : **Enabled**
- Automatic HTTPS Rewrites : **On**

**Speed → Optimization** :
- Brotli : On
- Early Hints : On
- HTTP/3 (QUIC) : On

**Network** :
- WebSockets : **On** (sinon le chat Léna casse)
- gRPC : On
- HTTP/2 to Origin : On

**Caching → Configuration** :
- Caching Level : Standard
- Browser Cache TTL : Respect existing headers

### Page Rule à ajouter (pour empêcher CF de cacher les API)

Page Rules → Create Page Rule :
- URL : `keiroai.com/api/*`
- Setting : **Cache Level: Bypass**

Sinon CF risque de mettre en cache des réponses API personnalisées.

## Plan B (si Cloudflare bloqué chez le réseau corp aussi)

Improbable, mais si CF est lui-même bloqué :
1. Demander à l'IT corp d'**ajouter `keiroai.com` à l'allowlist** — c'est
   souvent un simple ticket interne.
2. Soumettre l'URL à recategorisation chez le fournisseur de filtrage
   utilisé par le corp (chaque vendor a un formulaire) :
   - FortiGuard : https://www.fortiguard.com/webfilter
   - Cisco Talos : https://talosintelligence.com/reputation_center
   - Palo Alto : https://urlfiltering.paloaltonetworks.com/query/
   - Symantec : https://sitereview.symantec.com/
   - Zscaler : https://csi.zscaler.com/
   - McAfee TrustedSource : https://www.trustedsource.org/
   Demander la catégorie : **Business / Marketing & Sales Software**.

## Plan C (fallback ultra-fiable, mais payant)

Si l'IT corp refuse + CF bloqué, racheter de l'hébergement Vercel
juste pour le frontend public et garder OVH pour l'API. Pas
recommandé tant que A et B n'ont pas été tentés.
