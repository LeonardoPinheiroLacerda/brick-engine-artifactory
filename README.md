# Brick Engine Artifactory

Esta é a infraestrutura backend e pipeline de publicação de jogos da Brick Engine, construída em cima do Supabase (Database, Storage e Edge Functions).

## Funcionalidades

- **Database**: Tabelas `game_requests` (solicitações pendentes) e `games` (jogos aprovados disponíveis no catálogo).
- **Storage**: Bucket `game_bundles` configurado para receber os uploads públicos de jogos `.js`.
- **Edge Functions**:
  - `publish`: Recebe o upload do jogo (via FormData), salva no Storage, insere uma requisição pendente e notifica o administrador via email.
  - `approve`: Função restrita (Service Role) que aprova uma requisição, move o jogo para o catálogo oficial e notifica o desenvolvedor.
  - `reprove`: Função restrita que recusa uma requisição e envia o motivo da recusa para o desenvolvedor.
  - `list`: Retorna a lista dos jogos aprovados para serem consumidos pela engine.

## Notificações por E-mail

O envio de e-mails de notificação é feito pela API do [Resend](https://resend.com).

---

## 🚀 Passo a Passo de Implantação (Deploy para Produção)

Para levar esse ambiente local para a nuvem da Supabase, siga os passos abaixo no seu terminal:

### 1. Crie o projeto no Supabase

Acesse o painel do [Supabase](https://app.supabase.com) e crie um novo projeto. Aguarde o banco de dados ser provisionado e anote o **Reference ID** do projeto (encontrado na URL do painel ou nas configurações do projeto).

### 2. Autentique o Supabase CLI (se necessário)

Caso ainda não tenha feito login na sua conta pela linha de comando:

```bash
npx supabase login
```

### 3. Conecte o repositório local ao projeto remoto

Vincule a sua pasta local ao projeto criado na nuvem:

```bash
npx supabase link --project-ref <SEU_PROJECT_REF_AQUI>
```

_(Ele pode pedir a senha do seu banco de dados de produção que você definiu no Passo 1)._

### 4. Envie o Banco de Dados (Migrações)

Este comando vai criar toda a estrutura das tabelas (`game_requests`, `games`), os buckets do storage (`game_bundles`) e as políticas de segurança (RLS) no seu projeto de produção:

```bash
npx supabase db push
```

### 5. Configure as Variáveis de Ambiente (Secrets)

Suas _Edge Functions_ precisam de chaves reais para enviar os e-mails e gerar as URLs corretas. Envie os _secrets_ para a nuvem rodando:

```bash
npx supabase secrets set RESEND_API_KEY="sua_chave_real_do_resend"
npx supabase secrets set ADMIN_EMAIL="email_do_admin_que_vai_receber_avisos"
npx supabase secrets set EXTERNAL_SUPABASE_URL="https://<SEU_PROJECT_REF_AQUI>.supabase.co"
```

_(Lembre-se de substituir `<SEU_PROJECT_REF_AQUI>` na URL pelo ID real do seu projeto)._

### 6. Faça o Deploy das Edge Functions

Por fim, envie o código das 4 Edge Functions para a nuvem:

```bash
npx supabase functions deploy
```

_Como o arquivo `supabase/config.toml` já está configurado, o Supabase CLI saberá exatamente quais funções subir e configurará o `verify_jwt = true` para proteger os endpoints restritos automaticamente._

### 7. Atualize o seu Cliente / Motor de Jogo

Após a implantação, lembre-se de trocar as credenciais (Localhost) apontadas no seu código cliente / Postman para as chaves reais de Produção, que ficam em `Project Settings -> API` no painel do Supabase:

- **Project URL:** `https://<SEU_PROJECT_REF>.supabase.co`
- **Anon Key:** (Usada para a função `publish` e `list`)
- **Service Role Key:** (Usada exclusivamente nas funções administrativas `approve` e `reprove`, proteja essa chave!)
