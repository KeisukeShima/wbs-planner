# JIRA登録時にガントチャートの日程を設定する

**Date:** 2026-04-22

## 概要

JIRA登録機能において、ガントチャートのスケジューラが計算した開始日・終了日を、JIRAチケットの `startDate`（開始日）および `duedate`（期限）フィールドに自動設定する。

## 対象

- **Task**（親チケット）と **Sub-task**（フェーズチケット）の両方に日付を設定する。

## 日付フォーマット

JIRA REST API は `YYYY-MM-DD` 形式の文字列を要求する。ガントチャートのタスクは `new Date(y, m-1, d)`（ローカル時刻）で生成されているため、`toISOString()` ではタイムゾーンズレが発生する可能性があり、専用ヘルパーを使用する。

```js
const toJiraDate = d =>
  [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
```

## 日付の決定ルール

| チケット種別 | startDate フィールド | duedate フィールド |
|---|---|---|
| **Task** | `phaseTasks` 全体の最早 `startDate` | `phaseTasks` 全体の最遅 `endDate` |
| **Sub-task** | `task.startDate` | `task.endDate` |

- 日付が `null` の場合はフィールドを省略し、そのまま登録する（エラーにしない）。

## 変更ファイル

### `tests/lib/jira.js`

テスト対象のビルダー関数（`wbs-planner.html` から抽出済み）を更新する。

1. `toJiraDate(d)` を追加してエクスポートする。
2. `buildTaskBody`: phaseTasks から最早 `startDate` と最遅 `endDate` を計算し、フィールドに追加する。
3. `buildSubTaskBody`: `task.startDate` / `task.endDate` をそれぞれ `startDate` / `duedate` フィールドに追加する。

### `wbs-planner.html`

`pushToJira()` 内の inline コードを `tests/lib/jira.js` と同様に更新する。

1. `toJiraDate` ヘルパー関数を script 内に追加する。
2. `taskBody` 組み立て部分：phaseTasks から最早/最遅を計算して `startDate` / `duedate` を追加する。
3. `subBody` 組み立て部分：`t.startDate` / `t.endDate` を `startDate` / `duedate` として追加する。

### `tests/unit/jira.test.js`

ユニットテストを追加する。

1. `buildTaskBody` に `startDate` / `duedate` が正しく含まれること。
2. `buildSubTaskBody` に `startDate` / `duedate` が正しく含まれること。
3. 日付が `null` の場合は両フィールドが省略されること（`undefined` にならないこと）。

## 非対象

- JIRA側で `startDate` フィールドが有効でないプロジェクト構成への対応は行わない（JIRA側の設定はユーザーが管理する）。
- 日付のUIへの表示変更は行わない。
