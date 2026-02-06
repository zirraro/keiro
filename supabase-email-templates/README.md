# Configuration Supabase

## 1. SMTP via Resend

Dans Supabase Dashboard > Settings > Auth > SMTP Settings :
- Host: `smtp.resend.com`
- Port: `465`
- User: `resend`
- Password: votre clé API Resend (RESEND_API_KEY)
- Sender: `noreply@keiroai.com`

## 2. Email Templates

Dans Supabase Dashboard > Authentication > Email Templates > Confirm signup :
- Coller le contenu de `confirm-signup.html`

## 3. Migration SQL - Profil enrichi

Exécuter dans Supabase Dashboard > SQL Editor :

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_since TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_size TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_networks TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS posting_frequency TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS main_goal TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_budget TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
```

## 4. Migration SQL - Champs enrichis supplémentaires

Exécuter dans Supabase Dashboard > SQL Editor :

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_description TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_tone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS main_products TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS competitors TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS content_themes TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_goals_monthly TEXT;
```
