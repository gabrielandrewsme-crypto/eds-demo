# Deploy Checklist

## Antes do GitHub

- confirmar que o `.env` local nao sera commitado
- confirmar que `npm run build` passa
- confirmar que o script [schema.sql](c:\projects\EDS System\supabase\schema.sql) ja foi executado no Supabase
- confirmar que o bucket `machine-reports` existe

## GitHub

1. Criar um repositorio novo.
2. Rodar:

```bash
git init
git add .
git commit -m "Initial EDS System app"
git branch -M main
git remote add origin SEU_REPOSITORIO_GITHUB
git push -u origin main
```

## Vercel

1. Importar o repositorio.
2. Confirmar:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Adicionar variaveis:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Fazer deploy.

## Pos deploy

- testar login operacional
- testar start de ponto
- testar registro de falta
- testar fechamento com foto
- testar painel ADM
- testar exportacao de PDF
