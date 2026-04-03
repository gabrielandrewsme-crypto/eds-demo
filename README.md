# EDS System

Aplicacao web para operacao das barracas da Explosao de Sabor, agora preparada para Supabase e deploy em Vercel.

## Ambiente

1. Crie o arquivo `.env` na raiz.
2. Copie o conteudo de [`.env.example`](c:\projects\EDS System\.env.example).
3. Preencha:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
```

## Supabase

Antes de usar o sistema, rode o script [schema.sql](c:\projects\EDS System\supabase\schema.sql) no `SQL Editor` do Supabase.

Esse script cria:

- tabela `shifts`
- tabela `incidents`
- bucket `machine-reports`
- politicas de acesso para ambiente demo

Importante: as politicas atuais sao abertas para facilitar homologacao. Antes de producao, o ideal e migrar para autentificacao real com perfis e RLS restritivo.

## Desenvolvimento

Instalar dependencias:

```bash
npm install
```

Rodar local:

```bash
npm run dev
```

Gerar build:

```bash
npm run build
```

## Fluxos cobertos

- login operacional por unidade
- acesso ADM direto pela tela de login
- ponto de abertura e fechamento
- bloqueio operacional sem start de ponto
- estoque inicial e final
- faltas e pedidos de reposicao
- fechamento de caixa com foto da maquininha
- auditoria administrativa centralizada
- relatorios financeiros em PDF por dia, semana, mes e ano

## Deploy

Para Vercel:

1. Suba o projeto para GitHub.
2. Importe no Vercel.
3. Configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` nas variaveis de ambiente.
4. Faça o deploy.

Checklist rapido de publicacao em [DEPLOY_CHECKLIST.md](c:\projects\EDS System\DEPLOY_CHECKLIST.md).
