# Gantt Chart Generator

## リソース制約付き自動スケジューリングのガントチャート生成ツール

ファイル1つ、インストールなし。タスク・工数・担当者を入力するだけで、空き状況を考慮しながら自動でスケジュールを組み、ガントチャートを描画します。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)](gantt-generator.html)
[![Single File](https://img.shields.io/badge/delivery-single%20HTML-orange)](gantt-generator.html)

**[→ gantt-generator.html をダウンロードして開くだけで使えます](gantt-generator.html)**

---

## Mermaid・PlantUML との違い

Mermaid や PlantUML のガントチャートは「すでに決まったスケジュールを図にする」ツールです。このツールは「**誰が・いつ・何日かけてやるか**を自動で決める」ところから始めます。

### 機能比較

| 機能 | このツール | Mermaid | PlantUML |
| ---- | :---------: | :-------: | :--------: |
| インストール不要 | ✅ | ✅ (CDN利用時) | ❌ Java必須 |
| GUI エディタ | ✅ | ❌ コード記述 | ❌ コード記述 |
| **担当者の自動割り当て** | ✅ | ❌ | ❌ |
| **リソース競合の自動回避** | ✅ | ❌ | ❌ |
| **担当可能工程の制約** | ✅ | ❌ | ❌ |
| **稼働率・参画開始日の考慮** | ✅ | ❌ | ❌ |
| **並行バックグラウンドタスク** | ✅ | ❌ | ❌ |
| **営業日カレンダー（祝日対応）** | ✅ | ❌ | ❌ |
| **リリース評価超過の警告** | ✅ | ❌ | ❌ |
| リアルタイムプレビュー | ✅ | △ (要ビルド) | ❌ |
| 日 / 週 / 月 ズーム切替 | ✅ | ❌ | ❌ |
| PNG / HTML エクスポート | ✅ | △ | △ |
| JSON で設定保存・復元 | ✅ | △ (コード自体) | △ (コード自体) |
| テキストベースでバージョン管理 | △ (JSON) | ✅ | ✅ |

### 具体的なシナリオで比較

Mermaid では担当者を**手動でスケジュールに当てはめる**必要があります。

```
%%{Mermaid でやろうとすると…}%%
gantt
    section Alice（企画）
    要件定義A :a1, 2026-04-20, 10d
    要件定義B :a2, after a1, 5d   ← 手動で順番を決める必要がある
    section Bob（開発）
    設計開発A :b1, after a1, 20d  ← Aliceが終わったら、と手動で指定
    設計開発B :b2, after b1, 10d
    ← 「Bobが80%稼働で5月から参画」「Carolが設計開発しかできない」は表現不可
```

このツールでは担当者の制約を設定するだけで、日付や順序は自動で決まります。

```jsonc
// 担当者の制約を定義するだけでOK
"people": [
  { "name": "Alice", "phases": ["要件定義"], "utilization": 1.0 },
  { "name": "Bob",   "phases": ["設計開発"], "availableFrom": "2026-05-01", "utilization": 0.8 },
  { "name": "Carol", "phases": ["設計開発"], "utilization": 1.0 }
],
"items": [
  {
    "name": "機能A",
    "phases": [
      { "type": "要件定義", "days": 10 },   // → Aliceが自動で担当
      { "type": "設計開発", "days": 20 }    // → BobまたはCarolが自動で担当
    ]
  }
]
// スケジュールは自動計算。担当者の空き・稼働率・参画日を全部考慮。
```

### Mermaid・PlantUML が適しているケース

- **バージョン管理で差分を追いたい**（テキストファイルなので git diff が使いやすい）
- **CI/CD パイプラインに組み込みたい**（コードとして扱える）
- **すでにスケジュールが確定していて図にしたいだけ**

このツールは「**スケジュールを計画する**」フェーズに特化しています。

---

## 主な機能

### 自動スケジューリング（LPT アルゴリズム）

残りパイプライン工数が多いタスクを優先的に割り当てる LPT（Longest Processing Time）方式で、全体の完了を最短化します。担当者の空き状況を1営業日単位でシミュレーションします。

```
優先度 = 自タスク以降のフェーズ工数の合計

例: [要件定義 5日] → [設計開発 20日] → [テスト 3日]
  └ 要件定義の優先度 = 5+20+3 = 28日
  └ より長いパイプラインを持つタスクが先に担当者を確保
```

### リソース制約

| 設定 | 説明 |
| ---- | ---- |
| `allowedPeople` | フェーズを担当できる人を限定（省略時は適任者を自動選択） |
| `requireAll` | 指定した全員が同時着手（ペアプロ・共同作業に） |
| `background` | 工数を消費しない並行進行タスク（調達待ち・外注など） |
| `fixedStart` | 特定日に強制開始（外部依存がある場合） |
| `availableFrom` | 参画開始日（中途合流メンバーに） |
| `utilization` | 稼働率（0.8 = 80%稼働） |

### 営業日カレンダー

- 土日を自動除外
- 国民の祝日をバンドル済み（2024〜2028年）
- [holidays-jp API](https://holidays-jp.github.io) からワンクリックで最新データに更新
- 会社独自の休業日（年末年始・創立記念日など）を別途登録可能

### 表示・エクスポート

- **3段階ズーム**: 日 / 週 / 月 単位を切替（3ヶ月プロジェクトは週単位、1年超は月単位など）
- **リアルタイムプレビュー**: 設定変更のたびに即時反映
- **HTML 出力**: スタンドアロン HTML として保存・共有
- **PNG 出力**: スライド・ドキュメントに貼り付け可能な画像として保存
- **JSON 保存 / 読込**: 設定ファイルをチームで共有・バージョン管理

---

## クイックスタート

### 1. ファイルを開く

[`gantt-generator.html`](gantt-generator.html) をダウンロードし、ブラウザでダブルクリックします。  
サーバー不要、ネット接続不要で即起動します。

### 2. 工程タイプを定義する

左サイドバーの「**工程タイプ**」タブで、プロジェクトで使う工程の種類・担当チーム・色を設定します。

### 3. アイテムとフェーズを入力する

「**アイテム**」タブで開発項目を追加し、各アイテムにフェーズ（工程の種類・工数・担当者制約）を設定します。

### 4. 担当者を登録する

「**担当者**」タブで担当者ごとに担当可能な工程・参画開始日・稼働率を設定します。

### 5. プロジェクト設定を調整する

「**プロジェクト設定**」タブで開始日・リリース日・評価期間・表示単位・休日を設定します。

> 設定は `localStorage` に自動保存されます。ブラウザを閉じても次回開いたときに復元されます。  
> チームで共有する場合は「JSON 保存」でファイルに書き出してください。

---

## 設定ファイル（JSON）の形式

```jsonc
{
  "projectName": "プロジェクト名",
  "startDate": "2026-04-20",
  "releaseDate": "2026-07-15",
  "evalPeriod": { "value": 4, "unit": "weeks" },  // "days" | "weeks" | "months"
  "ganttUnit": "weeks",                            // "days" | "weeks" | "months"

  "holidays": {
    "national": ["2026-04-29", "2026-05-03"],      // 国民の祝日
    "company":  ["2026-12-29", "2026-12-30"]       // 会社指定休業日
  },

  "phaseTypes": [
    { "name": "要件定義", "team": "企画", "color": "#3B82F6" },
    { "name": "設計開発", "team": "開発", "color": "#10B981" }
  ],

  "people": [
    {
      "name": "Alice",
      "team": "企画",
      "phases": ["要件定義"],          // 担当可能な工程タイプ
      "availableFrom": null,           // null = プロジェクト開始から参画
      "utilization": 1.0,              // 稼働率（0.5 = 50%稼働）
      "note": ""
    },
    {
      "name": "Bob",
      "team": "開発",
      "phases": ["設計開発"],
      "availableFrom": "2026-05-01",   // 5月から参画
      "utilization": 0.8,              // 80%稼働
      "note": "兼務あり"
    }
  ],

  "items": [
    {
      "name": "機能A開発",
      "category": "コア機能",
      "note": "",
      "phases": [
        { "type": "要件定義", "days": 5 },
        {
          "type": "設計開発",
          "days": 10,
          "allowedPeople": ["Bob"],    // Bobのみ担当可
          "requireAll": false,         // true = 全員同時着手
          "background": false,         // true = 工数消費なし（並行進行）
          "fixedStart": null           // "YYYY-MM-DD" で強制開始日指定
        }
      ]
    }
  ],

  "evalPhase": { "name": "リリース評価", "color": "#8B5CF6" }
}
```

サンプル設定ファイル（全機能を使ったデモ）: [`examples/sample-config.json`](examples/sample-config.json)

---

## 技術仕様

| 項目 | 内容 |
| ---- | ---- |
| 配布形式 | 単一 HTML ファイル（約54KB） |
| 外部依存 | なし（PNG出力時のみ html2canvas を CDN から遅延ロード） |
| 動作環境 | モダンブラウザ（Chrome / Firefox / Safari / Edge） |
| データ保存 | localStorage（ブラウザ内） |
| スケジューリング | LPT アルゴリズム、1営業日単位シミュレーション |
| 祝日データ | 2024〜2028年バンドル済み + [holidays-jp API](https://holidays-jp.github.io) 対応 |

---

## ライセンス

[MIT License](LICENSE)
