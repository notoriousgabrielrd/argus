# Plano — worktrees lado a lado (fases 1 e 2)

> **Estado: implementado.** As fases 1 e 2 foram entregues num commit só, a pedido — não nos cinco
> descritos em "Ordem de merge" abaixo, que ficam como registro do desenho. O que a entrega cobre e
> o que ficou de fora está resumido na pendência 6 do [`PENDENCIAS.md`](./PENDENCIAS.md).

Objetivo: abrir duas ou mais worktrees em colunas na mesma janela, para trabalhar em vários
projetos ao mesmo tempo.

**Princípio que governa o plano:** com uma coluna só, o comportamento tem de ser idêntico ao de
hoje. Todo estado novo nasce com `length === 1`, e todo predicado novo colapsa no atual quando o
conjunto tem um elemento. Isso é o que torna cada fase mergeável sozinha e reversível.

---

## O que já existe (e por que isso não é refactor de fundação)

O renderer **já monta N worktrees ao mesmo tempo**. `Terminal.tsx:2432`:

```tsx
workspaceSurfaces
  .filter((workspace) => mountedWorktreeIdsRef.current.has(workspace.id))
  .map((workspace) => {
    const isVisible = activeView === 'terminal' && workspace.id === renderedActiveWorktreeId
    return <WorktreeSplitSurface worktreeId={workspace.id} isVisible={isVisible} … />
  })
```

- `mountedWorktreeIds` é um **Set** — plural desde sempre.
- `WorktreeSplitSurface` (`Terminal.tsx:2715`) é uma superfície completa e autocontida,
  parametrizada por `worktreeId`: recebe seu `layout`, `focusedGroupId`, panes de terminal,
  browser, emulador e o drop layer.
- `workspaceSurfaces` (`Terminal.tsx:297`) já inclui **worktrees e folder workspaces**, então
  folder workspaces entram de graça.
- O que esconde as outras é uma classe CSS (`Terminal.tsx:2755`): `absolute inset-0 flex` para a
  visível, `hidden` para as demais. Elas estão **empilhadas**, não dispostas.
- `shouldKeepPaintable` / `measurableBackgroundWorktreeIds` já renderiza worktree oculta **com
  geometria real** (`opacity-0`) quando precisa medir. Dimensionar surface não-ativa é problema
  já resolvido.

Ou seja: o trabalho é de **disposição e foco**, não de modelo de dados.

### O que está no caminho

Duas coisas, e a segunda é a que importa.

1. **O predicado de visibilidade está triplicado** em `Terminal.tsx` — linhas 921, 2440 e 2490 —
   e o parking recebe o ativo por outra via (`activeWorktreeId: renderedActiveWorktreeId`, linha
   1208). Pluralizar em três lugares independentes é receita para divergência.

2. **`isVisible` e "focada" estão conflados.** O `isVisible` é passado adiante como
   `isWorktreeActive`, e esse valor dirige coisas que significam foco:

   ```ts
   // use-terminal-pane-global-effects.ts:189 — claim do viewport do PTY
   const ptyId = isActive && isVisible && isWorktreeActive ? activeLeafPtyId : null

   // TerminalPaneOverlayLayer.tsx:62 — atalho de teclado
   useNativeChatToggleShortcut(worktreeId, isWorktreeActive)
   ```

   Com duas colunas, **visível vira plural e focada continua singular**. Sem separar, as duas
   colunas disputam o viewport do PTY e os atalhos.

---

## Fase 1 — colunas

Meta: renderizar N surfaces lado a lado. Ainda sem tocar em foco — a coluna focada continua
sendo `activeWorktreeId`, e as demais aparecem mas não recebem teclado.

### 1.1 Unificar o predicado *antes* de pluralizar

**Faça isso primeiro, como commit separado, sem mudança de comportamento.**

Extrair um helper único em `Terminal.tsx` e roteá-lo pelos três pontos:

```ts
const isWorktreeVisible = useCallback(
  (worktreeId: string) => activeView === 'terminal' && worktreeId === renderedActiveWorktreeId,
  [activeView, renderedActiveWorktreeId]
)
```

Substituir nas linhas 921, 2440 e 2490. Diff comprovadamente neutro: nenhuma expressão muda de
valor. É a fundação de tudo que vem depois — com um só predicado, a pluralização é uma edição.

### 1.2 Estado

Novo campo no store (`src/renderer/src/store/slices/worktrees.ts`, defaults em `:3276`):

```ts
/** Colunas visíveis, em ordem da esquerda para a direita. A focada é sempre
 *  activeWorktreeId e sempre pertence a este conjunto. */
visibleWorktreeIds: string[]   // default: []  → derivado como [activeWorktreeId]
```

Derivação, para que `[]` signifique "comportamento de hoje" e nada precise migrar:

```ts
const visibleIds = state.visibleWorktreeIds.length > 0
  ? state.visibleWorktreeIds
  : (state.activeWorktreeId ? [state.activeWorktreeId] : [])
```

Ações novas em `worktree-helpers.ts` / `worktrees.ts`, ao lado de `setActiveWorktree` (`:5582`):

- `openWorktreeColumn(worktreeId, { after?: worktreeId })` — abre coluna e foca.
- `closeWorktreeColumn(worktreeId)` — fecha; se era a focada, foca a vizinha.
- `setWorktreeColumnRatios(ratios)`.

Invariantes que os testes têm de fixar:

- `activeWorktreeId ∈ visibleIds` sempre que não for `null`.
- Remoção de worktree tira a coluna (estender os caminhos já existentes em `worktrees.ts:2549`
  e `:2693`, que hoje só limpam `activeWorktreeId`).
- Rename re-chaveia a coluna (mesmo ponto de `:2336`).
- Fechar a última coluna cai para o comportamento de uma coluna, nunca para zero com
  `activeWorktreeId` não-nulo.

### 1.3 Pluralizar o predicado e dispor as colunas

```ts
const isWorktreeVisible = useCallback(
  (worktreeId: string) => activeView === 'terminal' && visibleIds.includes(worktreeId),
  [activeView, visibleIds]
)
```

No container (`Terminal.tsx:2428`), trocar o empilhamento por linha de colunas. Cada surface sai
de `absolute inset-0` para um item de flex com `flex-basis` do ratio; o `absolute` permanece
**dentro** da coluna, para preservar o motivo original do empilhamento (*"hidden trees don't
reflow the active one"*) entre as ocultas de cada coluna.

Divisor arrastável: **não escreva um novo**. `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`
já tem a peça inteira — `onPointerDown` de arraste (`:34`), clamp por `MIN_RATIO`/`MAX_RATIO`
(`:66-69`) e disposição por flex (`style={{ flex: '${ratio} 1 0%' }}`, `:216` e `:242`). É a mesma
mecânica que as colunas precisam, um nível acima. Extraia o divisor + a matemática de ratio para
um módulo compartilhado e consuma dos dois lados; o token de espessura já existe no styleguide
(`TerminalThemeSections`, "split divider line").

### 1.4 Parking e medição

Este é o ponto de custo. Uma coluna visível **nunca** pode ser parqueada nem tratada como oculta.

- O gate de cold-park já é `!isVisible && …` (`Terminal.tsx:2444`), então segue o predicado novo
  de graça.
- A **passagem de parking** recebe o ativo em `Terminal.tsx:1208` (`activeWorktreeId:
  renderedActiveWorktreeId`). Tem de passar a receber o conjunto visível, senão a segunda coluna
  entra como candidata a parque enquanto está na tela.
- `measurableBackgroundWorktreeIds` deixa de precisar cobrir colunas visíveis — elas passam a ser
  medidas por serem visíveis. Não remova o mecanismo: ele continua valendo para worktree oculta
  que precisa de geometria.

### 1.5 Persistência e clientes pareados

- `WorkspaceSessionState.visibleWorktreeIds?: string[]` — **opcional**, Rule 1 de
  `docs/reference/remote-wire-compatibility.md`: par antigo ignora e continua mostrando uma só.
- `activeWorktreeId` continua sendo a única fonte de "focada". Não mexa nele — é o que mantém
  mobile e clientes antigos corretos sem negociação de capability.
- Schema em `workspace-session-schema.ts` com `salvagedOptional`, e o arquivo está no teto de 300
  linhas do `max-lines`: **extraia para um módulo próprio**, como foi feito com
  `workspace-session-seat-schema.ts`. Não adicione disable.
- Classificar em `workspace-session-host-field-ownership.ts` — o typecheck do web quebra se
  faltar. Vai como `'global'`: descreve a composição da janela, não um dado por worktree.

### Testes da fase 1

| Teste | O que prova |
|---|---|
| `terminal-worktree-columns.test.tsx` | Com uma coluna, o DOM montado é igual ao de hoje (é o teste que autoriza o merge) |
| idem | Duas colunas → duas surfaces visíveis, nenhuma `hidden`, nenhuma `inert` |
| Store: `worktree-columns.test.ts` | `activeWorktreeId ∈ visibleIds`; remoção, rename e fechar-última |
| Parking | Coluna visível nunca entra em `parkedTerminalWorktreeIds` |
| `workspace-session-schema.test.ts` | Sessão sem o campo hidrata como uma coluna |
| Field ownership | Campo classificado (o typecheck já força, mas fixe a intenção) |

---

## Fase 2 — separar visível de focada

Meta: com N colunas na tela, exatamente uma recebe teclado e detém o claim de viewport do PTY.

### 2.1 Quebrar a prop

`WorktreeSplitSurface` passa a receber duas props em vez de uma:

```tsx
isVisible={isWorktreeVisible(workspace.id)}   // pinta e mede
isFocused={workspace.id === renderedActiveWorktreeId}   // recebe input
```

E propaga as duas. Onde hoje há `isWorktreeActive={isVisible}`, decidir caso a caso:

| Consumidor | Passa a usar | Por quê |
|---|---|---|
| `TabGroupSplitLayout` | `isVisible` | é layout |
| `TerminalPaneOverlayLayer` → render/park | `isVisible` | é pintura e custo |
| `useNativeChatToggleShortcut` (`:62`) | `isFocused` | atalho global, um dono só |
| claim de viewport (`use-terminal-pane-global-effects.ts:189`) | `isFocused` | ver 2.2 |
| `terminal-tab-park-candidates.ts:17,20` | `isVisible` | parque é custo de render |
| `RetainedBrowserPaneOverlayLayer` | `isVisible` | guests precisam ficar vivos |
| `AiVaultSessionDropLayer` | `isFocused` | alvo de drop precisa ser único |

Renomear `isWorktreeActive` para `isWorktreeFocused` onde virar foco — a palavra "active" é o que
causou a conflação, e deixá-la significando duas coisas convida à regressão.

### 2.2 Claim de viewport do PTY

O ponto de correção mais delicado. Hoje:

```ts
const ptyId = isActive && isVisible && isWorktreeActive ? activeLeafPtyId : null
```

Decida explicitamente e documente com um comentário "why":

- **Claim de input/foco** → `isFocused`. Duas colunas não podem ambas reivindicar o mesmo papel.
- **Dimensão (cols/rows)** → `isVisible`. Uma coluna visível tem geometria real e o PTY precisa
  ser redimensionado para ela, senão o TUI da segunda coluna renderiza no tamanho errado.

Se hoje as duas coisas saem do mesmo claim, **separe-as** antes de pluralizar. Verifique
`terminal.updateViewport` e `terminal.resizeForClient` no runtime: se o claim é por PTY e único,
a dimensão precisa de caminho próprio que não dependa de foco.

### 2.3 Teclado e comandos

- Atalhos globais (`worktree.palette`, `sidebar.*`, `terminal.*`) continuam agindo sobre a
  **focada**.
- O clique numa coluna não-focada tem de focá-la — é o gesto que o usuário espera. Ligar em
  `setActiveWorktree`, que já existe e já cuida de histórico de navegação.
- `worktree.navigateUp` / `navigateDown` mudam a focada; decidir se também mudam a coluna ou
  trocam o conteúdo da coluna focada. **Recomendo mudar o foco entre colunas abertas** e manter a
  paleta (`⌘J`) como o jeito de trocar o conteúdo — menos ambíguo.

### 2.4 Chrome

Primeiro corte, deliberadamente barato: **o chrome segue a coluna focada**. Sidebar esquerda,
painel direito (Source Control tem 263 referências a `activeWorktreeId`), git polling e a tab bar
continuam lendo `activeWorktreeId` e não mudam em nada.

Isso deixa uma assimetria visível: as colunas mostram só o corpo do workspace, e a tab bar é a da
focada. É aceitável como primeira entrega e evita migrar 360 arquivos. Mover a tab bar para dentro
de cada coluna é fase 3, opcional, e só vale quando o uso provar que incomoda.

### Testes da fase 2

| Teste | O que prova |
|---|---|
| Foco único | Com duas colunas visíveis, exatamente uma tem `isFocused` |
| Claim de PTY | A coluna não-focada não reivindica input; **e ainda assim** é redimensionada |
| Atalhos | Atalho global age na focada, não na primeira visível |
| Clique | Clicar na coluna não-focada chama `setActiveWorktree` |
| Regressão de uma coluna | Com uma coluna, `isVisible === isFocused` em todos os consumidores |

---

## Ordem de merge

Cinco commits, cada um verde sozinho:

1. **Unificar o predicado** (1.1) — sem mudança de comportamento.
2. **Estado + persistência + ownership** (1.2, 1.5) — nada renderiza diferente ainda.
3. **Colunas** (1.3, 1.4) — a feature aparece, ainda com a conflação de foco.
4. **Separar visível de focada** (2.1, 2.2) — a correção.
5. **Teclado e clique** (2.3).

Se for entregar em duas levas, corte entre 3 e 4 apenas se as colunas ficarem atrás de flag —
com a conflação viva, duas colunas disputam viewport e teclado.

---

## Riscos

**Custo de render.** Toda a maquinaria de parking e deferral existe porque pane montado é caro:
xterm + WebGL + replay de scrollback. Duas colunas visíveis dobram o custo de foreground. Não é
especulação — `COLD_ACTIVATION_TAB_DEFER_THRESHOLD` e o comentário em
`background-terminal-worktree-mount.ts:136` documentam um caso de campo com o renderer congelado
por dezenas de segundos.

Como detectar antes do usuário: os gates que já existem —

```bash
pnpm run test:e2e:terminal-perf
npx playwright test tests/e2e/terminal-webgl-atlas-budget.spec.ts --config tests/playwright.config.ts
```

Mitigação, se a medição pedir: teto de colunas visíveis (2 ou 3) e deferral de aba na coluna
não-focada, reusando `planColdActivationTabDeferral` — que já sabe fazer isso.

**Foco é onde os bugs vão morar.** Todo sintoma do tipo "digitei e foi para o terminal errado" ou
"o TUI da direita está com largura errada" sai de 2.1/2.2.

**Não confundir com o painel flutuante.** `FloatingTerminalPanel` usa um worktreeId sintético
(`FLOATING_TERMINAL_WORKTREE_ID`) e é uma superfície companheira, não uma coluna. Ele prova que
duas superfícies coexistem, mas não deve entrar em `visibleWorktreeIds`.

---

## Fora de escopo

- Tab bar e painel direito por coluna (fase 3).
- Segunda janela do SO — o app tem lock de instância única
  (`src/main/startup/single-instance-lock.ts`) e isso não muda aqui.
- Colunas no cliente mobile — o campo é opcional justamente para o mobile continuar em uma só.
- Arrastar aba entre colunas de worktrees diferentes. Um pane pertence a uma worktree
  (`TabGroup.worktreeId`); mover entre worktrees é outro problema, e bem maior.
