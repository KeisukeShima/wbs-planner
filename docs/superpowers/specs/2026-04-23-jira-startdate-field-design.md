# JIRA 開始日フィールドを選択可能にする

**Date:** 2026-04-23

## 概要

JIRA プロジェクトによって開始日フィールドのキーが異なる（例: T4DEV では `customfield_10015`）。「フィールド取得」ボタン実行時に日付型フィールドを自動取得し、どのフィールドをガントチャートの開始日に使うか UI で選択できるようにする。

現在の実装では `startDate` という固定キーで送信しているが、このキーが存在しないプロジェクトでは開始日が設定されない。本機能でこれを解消する。

## UX フロー

```
フィールド取得ボタン押下
  → 課題タイプ一覧取得（既存）
  → 全フィールド取得（既存）
  → 必須フィールド UI 更新（既存）
  → 日付型フィールド（type: "date"、duedate 除く）を抽出
  → 「開始日フィールド」ドロップダウンを表示・更新
```

ドロップダウンは「フィールド取得」実行前は非表示。実行後に表示される。

## UI 変更

`#jira-custom-fields` の下（「JIRA に登録」ボタンの前）に以下を追加：

```html
<div class="fg" id="j-startdate-wrap" style="display:none;margin-top:10px">
  <label>開始日フィールド <span style="font-weight:400;color:#9CA3AF">（任意）</span></label>
  <select id="j-startdate-field">
    <option value="">(設定しない)</option>
    <!-- フィールド取得後に動的生成 -->
  </select>
</div>
```

## 設定保存

`DEFAULT_JIRA_CONFIG` に `startDateFieldId: ''` を追加。`#j-startdate-field` の変更時に `JC.startDateFieldId` を更新し、`saveJiraConfig()` を呼ぶ。

## `loadFieldsForSelected()` への追加処理

既存の必須フィールド取得処理の後に以下を追加：

1. `allFields` から日付型フィールドを抽出：
   ```js
   const dateFields = allFields.filter(f =>
     f.schema?.type === 'date' && (f.fieldId ?? f.key) !== 'duedate'
   );
   ```
2. `#j-startdate-field` のオプションを再構築（先頭に「設定しない」を残す）
3. 保存済みの `JC.startDateFieldId` を pre-select
4. `#j-startdate-wrap` を表示（`display:block`）

## JIRA 送信時の動作

| 条件 | 動作 |
|---|---|
| `startDateFieldId` 設定済み＋日付あり | `{ [startDateFieldId]: "YYYY-MM-DD" }` を送信 |
| `startDateFieldId` 未設定 | 開始日フィールドを送信しない |
| 日付が null | 開始日フィールドを省略 |

`duedate`（期限）は引き続き固定キーで送信する。

## 変更ファイル

### `wbs-planner.html`

1. `DEFAULT_JIRA_CONFIG` に `startDateFieldId: ''` を追加
2. `#jira-custom-fields` の下に `#j-startdate-wrap` / `#j-startdate-field` を追加
3. `loadFieldsForSelected()` に日付フィールド抽出＋ドロップダウン更新処理を追加
4. `initJiraTab()` に `#j-startdate-field` の change イベントリスナーを追加
5. `pushToJira()` 内の `taskBody` / `subBody` で `startDate` 固定キーを `JC.startDateFieldId` の動的キーに変更

### `tests/lib/jira.js`

6. `buildTaskBody`: `startDate` 固定キーを `jc.startDateFieldId` 動的キーに変更
7. `buildSubTaskBody`: 同上

### `tests/unit/jira.test.js`

8. `buildTaskBody` の既存日付テストに `startDateFieldId: 'startDate'` を `jc` に追加
9. `startDateFieldId: 'customfield_10015'` を指定したとき正しいキーで送信されることのテストを追加
10. `startDateFieldId` が未設定のとき開始日フィールドが省略されることのテストを追加
11. `buildSubTaskBody` も同様に更新

## 非対象

- `duedate`（期限）フィールドの設定は変更しない（標準フィールドとして固定）
- Sub-task と Task で別々の開始日フィールドIDを設定することはできない（同一フィールドIDを使う）
