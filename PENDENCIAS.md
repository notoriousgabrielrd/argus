# Pendências do Argus

Estado em 2026-08-12. Branch `argus/fase-1-de-orca`, base Orca v1.4.178-rc.2.

## Concluído

| Fase | Commit | O quê |
|---|---|---|
| 1 | `9123239d70` | "De-Orca": auto-updater, telemetria, crash/observability upload, nuvem `onorca.dev` e star-nag desligados |
| 2 | `547d428a99` | Rebrand visual e de identidade (logo, ícones, `appId`, artefatos) |
| 3 | `2f4c3a0ab8` | Hierarquia e roster de agentes importados do cockpit |
| — | `7302f31587` | Correções do rebrand (regras do codemod que foram longe demais) |
| — | `0f958fa85f`, `e3374de752` | CLI renomeada de `orca` para `argus` |

Suíte: **4 falhas em 50.807 testes**, todas pré-existentes do upstream (3 presas ao locale
pt-BR da máquina, 1 de zsh dependente de ambiente).

---

## Pendências

### 1. Distribuição — bloqueia qualquer release

Sem isso o app roda em dev, mas não dá para distribuir:

- **Assinatura macOS**: certificado Developer ID + notarização. O Orca usava os da Stably.
- **Assinatura Windows**: o Orca usa certificado da SignPath (patrocínio). O Argus precisa do próprio.
- **Feed de auto-update**: hoje **desligado** por guarda de env (`ARGUS_ENABLE_UPDATER`).
  Para religar, repontar o feed para o repo do Argus **antes** de qualquer build distribuído —
  senão o app se atualiza de volta para um build do Orca.
- **Casks do Homebrew**: `Casks/argus.rb` e `argus@rc.rb` já renomeados, mas apontam para
  URLs de release que ainda não existem.

### 2. App mobile

`mobile/` é um segundo produto (Expo/React Native). Continua com identidade do Orca e
depende do relay hospedado da Stably (desligado). Funciona por conexão direta na LAN.
Publicar exige conta própria na App Store / Play Store.

### 3. Nomes dos tópicos de skill

`orca-cli`, `orca-linear`, `orca-emulator`, `orca-per-workspace-env` seguem com o nome antigo.
São **identificadores**, não texto de exibição, e o gerador mantém um ledger de compatibilidade
(`GUIDE_ALIASES` em `config/scripts/generate-bundled-skill-guides.mjs`) que diz explicitamente:
*adicione entradas em renomeações, nunca remova*. Renomear exige mexer em lockstep nos diretórios
`skills/`, nos `.md`, nos verificadores e nas env vars `ORCA_*_SKILL_NAME`. Merece fase própria.

### 4. Documentação

`README.md`, `docs/` e `.github/CONTRIBUTING.md` ainda descrevem o Orca, com links para
`onorca.dev` e para o Discord deles.

### 5. UI para a hierarquia de agentes

A Fase 3 trouxe os dados (`resources/argus/*.json`, `src/shared/argus/`, `src/main/argus/`),
mas nada os renderiza ainda. É aqui que entraria o escritório virtual do cockpit, se um dia
você quiser — ele já era uma camada de projeção só de leitura, então portaria bem.

### 6. Loop fechado BOSS → AUDITOR

O cockpit orquestrava via prompt-contrato + polling de `reports/loop/*.json` por mtime.
O Argus tem runtime de orquestração estruturado (runs, tasks em DAG, gates), então isso
deve ser **reimplementado** em cima dele, não portado.

---

## Regras que não podem ser quebradas

Coisas que parecem renomeáveis mas quebram silenciosamente se mudarem:

| Item | Por quê |
|---|---|
| Env vars `ORCA_*` (~650) | Contrato com shims instalados e com a própria CLI |
| `orca://` | Esquema de URL de pareamento — token de protocolo |
| `orca.yaml` | Arquivo escrito pelo usuário em cada repo consumidor |
| `~/.orca`, `Application Support/orca`, `orca-dev` | Diretórios de userData — renomear órfã perfis existentes |
| `X-Orca-Agent-Hook-Token` | Header HTTP; renomear um lado só deu 403 em 38 testes |
| `orca-mobile-e2ee` | Protocolo E2EE do app mobile |
| `stablyai/orca` em URLs de issue | Referências reais ao upstream |
| Nome "GNOME Orca" | É o leitor de tela do GNOME, produto de terceiros |
| `orca` como valor legado no RPC | Um par antigo ainda pode enviá-lo |

## Merge do upstream

O fork é consciente (hard fork), mas os merges seguem viáveis porque o rebrand é um script:

```bash
git fetch upstream && git merge upstream/main
node config/scripts/argus-rebrand.mjs
python3 config/argus-brand/generate-icons.py
pnpm test
```

O codemod é idempotente e tem guardas documentadas para tudo na tabela acima. A `SKIP_FILES`
dele lista arquivos onde "orca" é **dado de teste** (slugs `acme/orca`, ids `local-orca`) e não
texto de exibição — renomear ali quebra a igualdade que o próprio teste existe para provar.

**Licença:** o `LICENSE` (MIT, copyright da Stably) tem que continuar no repo. Nome, marca,
ícones e telemetria são seus; a atribuição legal não.
