---
name: clickup-tracker-bigboss
description: Registra automaticamente atividades de desenvolvimento do projeto BigBoss no ClickUp. Use ao final de cada interação, ao resolver bugs, fazer commits, ou quando pedirem para registrar progresso no ClickUp. Detecta commits via git, calcula tempo, cria tarefas/subtarefas e adiciona evidências. Ativado quando mencionar ClickUp, registrar, logar, tracker, ou ao concluir uma tarefa de desenvolvimento.
---

# ClickUp Tracker - BigBoss

## Configuração

| Campo | Valor |
|---|---|
| **Projeto** | BigBoss - Plataforma de Gestão de Tarefas Corporativa |
| **ClickUp List ID** | `901326476080` |
| **Parent Task ID** | `86aga193n` |
| **Space ID** | `90136539332` |
| **Responsável ID** | `94076032` (Bruno Brasil) |
| **MCP Server** | `user-clickup` |

## Quando Ativar

- Ao final de cada sessão de desenvolvimento
- Quando um bug/problema for resolvido
- Quando commits forem realizados
- Quando o usuário pedir para registrar/logar atividade
- Quando houver evidências (screenshots, logs) para documentar

## Workflow

### 1. Coletar dados da sessão

```bash
git log --oneline --since="2 hours ago" --format="%h|%s|%ai"
git diff --stat HEAD~1
git status --short
```

### 2. Criar subtarefa no ClickUp

MCP tool: `manage_task` (server: `user-clickup`)

```json
{
  "action": "create",
  "listId": "901326476080",
  "parent": "86aga193n",
  "name": "🔧 [Tipo]: Descrição breve",
  "assignees": [94076032],
  "status": "complete",
  "time_estimate": "Xh",
  "markdown_description": "ver template abaixo"
}
```

**Prefixos por tipo:**
| Emoji | Tipo | Quando usar |
|---|---|---|
| 🐛 | `[Bug]` | Bug corrigido |
| ✨ | `[Feature]` | Nova funcionalidade |
| 🔧 | `[Fix]` | Correção geral |
| ♻️ | `[Refactor]` | Refatoração |
| 🚀 | `[Deploy]` | Deploy/CI/CD |
| 📝 | `[Docs]` | Documentação |
| 🧪 | `[Test]` | Testes |

### 3. Registrar tempo

MCP tool: `task_time_tracking` (server: `user-clickup`)

```json
{
  "action": "add_entry",
  "taskId": "<id_retornado>",
  "duration": "Xh Ym",
  "description": "Descrição do trabalho",
  "start": "<datetime ISO do primeiro commit>"
}
```

Estimar duração por:
- Commits simples (fix typo, config): **30min-1h**
- Correções médias (bug fix, ajuste): **1h-3h**
- Features novas: **3h-8h**
- Refatorações grandes: **4h-12h**

### 4. Adicionar evidências

**Texto/código** → MCP tool: `task_comments`
```json
{
  "action": "create",
  "taskId": "<id>",
  "commentText": "**Evidência:**\n\nArquivos alterados:\n- file.js (+45, -12)\n\nErro corrigido:\n```\nstack trace\n```\n\nSolução:\n```js\ncódigo\n```"
}
```

**Screenshots/arquivos** → MCP tool: `attach_file_to_task`
```json
{
  "taskId": "<id>",
  "attachmentUrl": "<url_ou_path>"
}
```

### 5. Tags (opcional)

MCP tool: `operate_tags`
```json
{
  "scope": "task",
  "action": "add",
  "taskId": "<id>",
  "tagName": "backend"
}
```

Tags: `backend`, `frontend`, `ia`, `whatsapp`, `telegram`, `pwa`, `security`

## Template da Descrição

```markdown
## Resumo
[1-2 frases do que foi feito]

## Problema / Contexto
[Descrição do problema ou contexto da feature]

## Solução
[O que foi implementado]

## Commits
- `hash` - mensagem do commit

## Arquivos alterados
- `path/file.js` (+X, -Y)

## Checkpoints
- [x] Item realizado
- [ ] Item pendente

## Evidências
[Screenshots, logs, código relevante]
```

## Regras

1. **SEMPRE** crie subtarefas sob o parent `86aga193n`
2. **SEMPRE** atribua ao responsável `94076032`
3. **SEMPRE** registre tempo baseado nos commits
4. **SEMPRE** inclua hashes dos commits na descrição
5. **SEMPRE** use a list `901326476080`
6. **NUNCA** misture com atividades de outros projetos
7. Se houver imagem/screenshot disponível, anexe como evidência
8. Se o status da tarefa ainda está em andamento, use `"status": "in progress"`
