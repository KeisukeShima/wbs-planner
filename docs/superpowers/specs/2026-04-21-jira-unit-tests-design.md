# JIRA連携 単体テスト設計

**日付:** 2026-04-21
**ブランチ:** feat/test-jira
**目的:** 本番JIRAを書き換えることなく、JIRA連携の純粋関数ロジックを単体テストでカバーする。

---

## 背景

`wbs-planner.html` はVanilla JSの単一ファイルアプリ。既存テストは `tests/lib/core.js` に純粋関数を抽出し、`tests/unit/*.test.js` でVitestにより検証するパターンを採用している。JIRA連携関数（`makeADF`、`pushToJira` 内のbody構築、`jiraApi` など）は現在テストなし。

---

## アーキテクチャ

既存パターンに従い、以下2ファイルを追加する。

```text
tests/lib/jira.js        ← HTMLから純粋関数を抽出・パラメータ化
tests/unit/jira.test.js  ← Vitestテスト（vi.stubGlobal でfetchをモック）
```

HTMLの `wbs-planner.html` は**変更しない**。`tests/lib/jira.js` はHTMLの実装を参照コピーとして保持し、`tests/lib/core.js` と同様に「HTMLと同期を保つ」コメントを付ける。

---

## `tests/lib/jira.js` に抽出する関数

### そのまま抽出（グローバル依存なし）

| 関数 | 元のHTML行 | 説明 |
| --- | --- | --- |
| `makeADF(text)` | 2104 | テキストをAtlassian Document Format (ADF) に変換 |
| `cfSchemaKind(schema)` | 1854 | カスタムフィールドのスキーマタイプを判別 |
| `cfPayloadValue(field)` | 1864 | カスタムフィールドをJIRAペイロード形式に変換 |

### パラメータ化（グローバル依存を引数化）

| 関数 | 変更内容 |
| --- | --- |
| `getAccountId(personName, people)` | グローバル `C.people` → 引数 `people` |
| `buildTaskBody(item, phaseTasks, release, jc, people)` | `pushToJira` 内のtaskBody構築ロジックを切り出し。グローバル `JC`/`C` → 引数 |
| `buildSubTaskBody(task, taskKey, phaseType, jc, people)` | 同上、subBody構築部分。`phaseType` は `{ name, team }` オブジェクト（または `null`） |
| `jiraApiWith(path, opts, jc)` | グローバル `JC` → 引数 `jc`。`fetch` をそのまま呼び出す（テスト時にモック） |

---

## `tests/unit/jira.test.js` のテスト仕様

### `makeADF`

- `null` / 空文字列 → `undefined` を返す
- 改行のみの文字列 → `undefined` を返す
- 1行テキスト → `paragraph` に `text` ノード1つ
- 複数行テキスト → `hardBreak` で区切られた複数 `text` ノード

### `cfSchemaKind`

- `null` / `undefined` → `'string'`
- `{ type: 'option' }` → `'option'`
- `{ type: 'user' }` → `'user'`
- `{ type: 'array', items: 'user' }` → `'user_array'`
- `{ type: 'array', items: 'option' }` → `'option_array'`
- `{ type: 'string' }` → `'string'`
- `{ type: 'datetime' }` → `'raw'`

### `cfPayloadValue`

- 空値 (`null` / `undefined` / `''`) → `undefined`
- `kind=option` → `{ id: v }`
- `kind=user` → `{ accountId: v }`
- `kind=user_array` → `[{ accountId: v }]`
- `kind=option_array` → `[{ id: v }]`
- `kind=raw` で有効なJSON → パース結果
- `kind=raw` で無効なJSON → 文字列そのまま
- `kind=string` → 値そのまま

### `getAccountId`

- `people` に一致する名前があり `jiraUser` が設定済み → accountId を返す
- 一致する名前がない → `null`
- 名前は一致するが `jiraUser` が空文字 → `null`

### `buildTaskBody`

- 基本ケース → `project.key`、`summary`、`issuetype.name`、`description` を含む
- `epicKey` あり → `customfield_10014` がセットされる
- `epicKey` なし → `customfield_10014` が存在しない
- `assignee` あり（firstPhaseの担当者にjiraUser設定済み）→ `assignee.accountId` がセットされる
- 担当者マッピングなし → `assignee` フィールドが存在しない
- `customFields` に値あり → extraFields がマージされる
- `customFields` が空 → extraFields は空（余分なフィールドなし）

### `buildSubTaskBody`

- 基本ケース → `parent.key`、`issuetype: 'Sub-task'`、`description` を含む
- `subAccountId` あり → `assignee.accountId` がセットされる
- `isBackground=true` → descriptionに `（バックグラウンドタスク）` が含まれる
- `requireAll=true` かつ複数担当者 → descriptionに全担当者名が含まれる

### `jiraApiWith`（fetchをモック）

- 設定未入力（siteUrl空）→ `Error('接続設定が未入力です')` をthrow
- `fetch` が200を返す → レスポンスJSONをresolve
- `fetch` が401を返す → `Error('HTTP 401')` をthrow
- エラーレスポンスに `errorMessages` あり → そのメッセージでthrow
- proxyUrl設定時 → URLがproxyUrl経由になり `X-Jira-Site` ヘッダーが付く
- proxyUrl未設定 → 直接siteUrlに向かうURLになる

---

## 技術メモ

- **fetchモック:** `vi.stubGlobal('fetch', vi.fn())` を使用。各テストで `vi.resetAllMocks()` する
- **環境:** `vitest.config.js` の `environment: 'node'` のまま変更不要（Node 18以降はfetchが組み込み）
- **HTMLとの同期:** `tests/lib/jira.js` の先頭に「wbs-planner.htmlと同期を保つこと」を明記
