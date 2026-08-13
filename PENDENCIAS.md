# Pendências do Argus

Estado em 2026-08-13. Branch `argus/fase-1-de-orca`, base Orca v1.4.178-rc.2.

## Concluído

| Fase | Commit | O quê |
|---|---|---|
| 1 | `9123239d70` | "De-Orca": auto-updater, telemetria, crash/observability upload, nuvem `onorca.dev` e star-nag desligados |
| 2 | `547d428a99` | Rebrand visual e de identidade (logo, ícones, `appId`, artefatos) |
| 3 | `2f4c3a0ab8` | Hierarquia e roster de agentes importados do cockpit |
| 4 | não commitado | Cadeiras de agente de projeto: atribuir um terminal a um AUDITOR/BOSS/ENGINEER pela CLI |
| — | `7302f31587` | Correções do rebrand (regras do codemod que foram longe demais) |
| — | `0f958fa85f`, `e3374de752` | CLI renomeada de `orca` para `argus` |

Suíte, medida na fase 3: **4 falhas em 50.807 testes**, todas pré-existentes do upstream
(3 presas ao locale pt-BR da máquina, 1 de zsh dependente de ambiente).

A fase 4 não rodou a suíte inteira. Verificado nela: typecheck node/cli/web limpos, `oxlint`
sem erros, 861 testes das áreas afetadas (51 novos), ratchet de `max-lines`, verificadores de
skill guide e o teste cross-version de wire. Uma falha apareceu em
`terminal-output-frame-chunks-equivalence` por timeout de 30 s sob paralelismo — passa sozinha
em 21 s e não toca nada da fase.

### Fase 4 — o que ela adicionou

Duas coisas se chamavam "agente" no Argus e viviam misturadas na palavra. Agora são eixos
separados, e um pane pode ser as duas ao mesmo tempo:

| | Agente do Argus | Agente do projeto |
|---|---|---|
| O que é | a ferramenta rodando no pane | o papel que o repo define |
| Valores | `claude`, `codex`, `opencode`… (`TuiAgent`) | `AUDITOR`, `BOSS`, `ENGINEER`… |
| Flag na CLI | `--agent` (inalterado) | `--seat` (novo) |
| Onde persiste | `launchAgent`, por aba | `seatAssignmentsByWorktree`, por worktree |

Comandos: `terminal seats`, `terminal assign --seat <NOME> [--force]`, `terminal unassign`.
O selector `seat:AUDITOR` vale em todo comando que aceita `--terminal`, resolvido por
`terminal.resolveSeat` — espelhando o `terminal.resolveActive` que já existia.

Fonte de verdade dos nomes: `<workspace>/.claude/agents/*.md`, lido pelo frontmatter `name:`
e não pelo filename (a caixa varia entre projetos: `auditor.md` no AgendaPower, `BOSS.md` no
beefans). Isso faz o beefans funcionar sem config, e `assign` recusa um nome que o projeto não
define. Ver [`how-to-use.md`](./how-to-use.md).

Nomes que **não** usei, e por quê: `--agent` já significa binário em
`worktree create --agent codex`; e `--role` colidiria com o campo `role` do roster, que guarda
a *descrição* do agente (`"Guardião das regras de negócio…"`), não o nome.

Um efeito colateral que vale saber: o `workspace-session-schema.ts` estava exatamente no teto
de 300 linhas do `max-lines`. Como o AGENTS.md proíbe silenciar essa regra, o bloco de layout
de pane saiu para `workspace-session-terminal-layout-schema.ts`, seguindo o que já era feito
com o schema de browser e de sleeping agents.

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
`onorca.dev` e para o Discord deles. O que é do Argus tem doc própria:
[`how-to-use.md`](./how-to-use.md) (cadeiras e agentes) e este arquivo.

### 5. UI para as cadeiras e a hierarquia

A fase 4 deu consumidor à metade dos dados: as cadeiras são atribuíveis, resolvíveis e
persistidas, e o campo `seat` já viaja em `terminal list`/`show`. Falta a UI.

O que ainda não existe:

- **Nada renderiza a cadeira.** O pane não mostra que é o AUDITOR; só a CLI sabe. O campo está
  no payload e classificado em `workspace-session-host-field-ownership.ts` como `worktreeKeyed`,
  então o renderer pode ler sem mudança de contrato.
- **A hierarquia continua sem consumidor.** `resources/argus/*.json` e
  `src/shared/argus/agent-hierarchy.ts` seguem código morto com testes verdes: os `.md` do
  projeto não expressam quem manda em quem, então o organograma (`CEO` → `BOSS`/`ENGINEER`/…)
  só existe naqueles JSONs. Quando a UI precisar dele, é de lá que sai.
- **`agent-roster-loader.ts` segue sem chamador.** A validação de cadeira lê os `.md` direto,
  que cobre qualquer workspace; o loader resolve `argus.agents.json` + roster bundled e só
  passa a valer a pena quando alguém precisar do organograma.

É aqui que entraria o escritório virtual do cockpit — ele já era projeção só de leitura, então
portaria bem, e agora teria de onde tirar quem está sentado onde.

### 6. Worktrees lado a lado na UI — fases 1 e 2 feitas

Entregue (não commitado junto da fase 4): até 3 worktrees em colunas, com divisor arrastável.
Abrir/fechar pelo menu de contexto da sidebar ("Open Beside Current" / "Close Column").

O desenho está em [`plano-split-worktrees.md`](./plano-split-worktrees.md). O que sustenta tudo:
**visível virou plural, focada continua singular**. `activeWorktreeId` segue sendo a única
worktree que recebe teclado, o chrome e o claim de input do PTY; as demais colunas pintam e são
medidas. Coluna única é o caso `visibleWorktreeIds: []`, byte a byte o comportamento anterior.

O que ficou de fora, de propósito:

- **O chrome segue a coluna focada.** Sidebar, painel direito e tab bar continuam lendo
  `activeWorktreeId`. Movê-los para dentro de cada coluna é a fase 3, e só vale se incomodar no
  uso — são 360 arquivos lendo esse campo, 263 só no `SourceControl.tsx`.
- **A superfície legada (sem tab groups) continua em uma coluna.** Ela empilha tudo em
  `absolute inset-0`, então duas visíveis se sobreporiam. Colunas são um recurso do modelo de
  tab groups.
- **Custo de render não foi medido em campo.** Cada coluna visível paga xterm + WebGL + viewport
  de PTY. Se pesar, o teto (`MAX_VISIBLE_WORKTREE_COLUMNS`) e o deferral por aba
  (`planColdActivationTabDeferral`) já estão prontos para segurar.

### 7. Loop fechado BOSS → AUDITOR

O cockpit orquestrava via prompt-contrato + polling de `reports/loop/*.json` por mtime.
O Argus tem runtime de orquestração estruturado (runs, tasks em DAG, gates), então isso
deve ser **reimplementado** em cima dele, não portado.

A fase 4 resolveu o endereçamento, que era um pré-requisito: `seat:AUDITOR` é um endereço
estável, então o loop não precisa mais carregar handles nem descobrir qual pane é qual. Falta a
orquestração em si — quem dispara, o que conta como pronto, e o gate entre as pontas.

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
