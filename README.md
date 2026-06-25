# Knowledge Search Discord Bot

Discord のフォーラム投稿をナレッジとしてキャッシュし、質問・バグ報告・機能要望が既出かどうかを Gemini で判定する Bot です。

## できること

- 指定した複数のフォーラムチャンネルをナレッジとして同期
- `/search-knowledge` で既出候補を検索し、Gemini で重複かどうかを判定
- 既出なら関連フォーラム投稿へのリンクを返す
- 未既出なら投稿先フォーラムへのリンクを案内
- 新しいフォーラム投稿が作られたとき、似た投稿があればスレッド内に返信

## 必要なもの

- Node.js 20 以上
- npm
- Discord Bot token
- Gemini API key
- Discord Developer Portal で有効化した Bot 権限

Bot には少なくとも以下の権限が必要です。

- View Channels
- Send Messages
- Read Message History
- Use Slash Commands

フォーラム投稿本文まで読むには、Discord Developer Portal の Bot 設定で Message Content Intent も有効にしてください。

## セットアップ

```bash
npm install
cp .env.example .env
```

`.env` を編集します。

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
GEMINI_API_KEY=...
KNOWLEDGE_FORUMS=[{"id":"...","name":"質問","kind":"question"}]
SYNC_ALLOWED_USER_IDS=111111111111111111,222222222222222222
```

コマンドを登録します。

```bash
npm run register
```

開発起動します。

```bash
npm run dev
```

開発起動時だけ、起動後に一度だけ設定サマリのログを出します。Discord token や Gemini API key は出力しません。

本番起動します。ビルドは不要です。

```bash
npm start
```

動作確認用のテストも用意しています。

```bash
npm test
```

ローカルキャッシュに対して検索候補が出るか確認できます。Discord API や Gemini API は呼ばず、キャッシュ済みナレッジだけを使います。

```bash
npm run debug:search -- "ログインできない"
```

## 使い方

### `/sync-knowledge`

設定したフォーラムから投稿を読み込み、ローカルキャッシュへ保存します。初回起動後や過去投稿を取り込みたいときに実行してください。`limit` を指定しない場合、または `0` を指定した場合は、取得できる全フォーラム投稿を同期します。

このコマンドを実行できるのは `SYNC_ALLOWED_USER_IDS` に Discord ユーザー ID を設定したユーザーだけです。複数ユーザーはカンマ区切りで指定します。

### `/search-knowledge query:...`

入力した内容が既出か検索します。既出なら候補リンク、未既出なら `KNOWLEDGE_FORUMS` で設定したフォーラムへの案内を返します。

## 仕様

### 対象フォーラム

`KNOWLEDGE_FORUMS` に設定した Discord フォーラムチャンネルだけを対象にします。想定している分類は `question`、`bug`、`feature`、`other` です。

```json
[
  { "id": "123456789012345678", "name": "質問", "kind": "question" },
  { "id": "234567890123456789", "name": "バグ報告", "kind": "bug" },
  { "id": "345678901234567890", "name": "機能要望", "kind": "feature" }
]
```

### ナレッジとして保存する内容

フォーラム投稿ごとに、スレッド ID、フォーラム名、分類、タイトル、最初の投稿本文、タグ、投稿 URL、作成日時、更新日時を保存します。保存先は `KNOWLEDGE_STORE_PATH` で指定し、デフォルトは `data/knowledge-store` です。

大量のフォーラムスレッドが溜まっても扱いやすいように、デフォルトでは 1 スレッドを 1 JSON ファイルとして保存します。全件同期時も巨大な単一 JSON を毎回丸ごと書き換えず、更新されたスレッド単位で保存します。過去互換用に `KNOWLEDGE_STORE_PATH` が `.json` で終わる場合は単一 JSON ファイルとして扱えますが、大量データではディレクトリ保存を推奨します。

### 同期仕様

`/sync-knowledge` を実行すると、設定済みフォーラムからアクティブスレッドと公開アーカイブスレッドを取得し、ローカルキャッシュへ upsert します。取得数はコマンドの `limit`、未指定時は `SYNC_THREAD_LIMIT` で制御します。`SYNC_THREAD_LIMIT=0` の場合は、Discord API のページングを `has_more` がなくなるまで辿って全件同期します。

Bot を後からサーバーに追加した場合でも、対象フォーラムを見る権限と `Read Message History` 権限があれば、既存の公開フォーラム投稿を取得できます。ローカルキャッシュに存在する投稿だけが対象になるわけではありません。ただし、削除済み投稿、Bot に見えないチャンネル、権限不足の投稿、取得時に本文を読めない投稿は同期できません。

対象フォーラム内のスレッドに新しい投稿があった場合も、そのスレッドを自動でローカルキャッシュへ同期します。新規スレッド作成時は同期に加えて既出チェックも行い、似ている投稿が見つかった場合だけスレッドへ案内を返信します。

開発モードでは、同期時にフォーラムチャンネルの検出結果、アクティブスレッド数、アーカイブスレッドのページ取得数、保存件数、本文が空の件数をログ出力します。フォーラムが拾えていないときは、まず `npm run dev` で起動して `/sync-knowledge limit:0` を実行し、`forum channel lookup failed` や `active forum threads fetched` のログを確認してください。

### 検索仕様

`/search-knowledge` は入力文を既存ナレッジと照合します。まずローカルで候補を絞り込み、その上位候補だけを Gemini に渡して、同じ質問・同じバグ・同じ機能要望として扱えるかを判定します。返信は本人だけに見える ephemeral response です。

検索候補の切り分けには `npm run debug:search -- "検索語"` を使えます。ここで候補が出ない場合はローカルキャッシュまたはローカル検索の問題です。ここで候補が出るのに `/search-knowledge` の結果が期待と違う場合は、Gemini 判定やプロンプト側の問題として確認できます。

検索結果はユーザーに見せる前提で、内部スコアや機械的な判定文は表示しません。可能性があるスレッドを抜き出し、短い要約と確認すると良さそうな理由だけを返します。

### 既出判定の返答

既出と判定した場合は、関連する既存投稿のタイトル、URL、フォーラム名、関連度、理由を返します。既出ではない場合は、設定済みフォーラムのリンクを返し、新規投稿先を案内します。

### 新規フォーラム投稿時の自動判定

`ENABLE_THREAD_DUPLICATE_REPLY=true` の場合、対象フォーラムに新しい投稿が作られたタイミングで既出検索します。似ている投稿が見つかった場合だけ、そのスレッドに既存投稿リンクを返信します。見つからない場合は返信せず、投稿をナレッジとして保存します。

### AI 判定に失敗した場合

Gemini API の呼び出しに失敗した場合は、ローカル検索スコアによる暫定判定にフォールバックします。その場合、返信内に暫定結果であることを表示します。

## 公開リポジトリ向けの注意

- `.env` は絶対にコミットしないでください。
- `data/knowledge-store` にはサーバー内の投稿内容が保存されるため `.gitignore` に入れています。
- Bot を配布する場合、README に必要な Discord intent と権限を明記してください。
- `KNOWLEDGE_FORUMS` はサーバーごとに異なるため、`.env.example` の形式だけ共有します。

## Gemini モデル

デフォルトは `gemini-3.1-flash-lite` です。Google の公式 Gemini API docs では、Gemini 3.1 Flash-Lite のモデルコードとしてこの文字列が掲載されています。

## 設計メモ

検索は二段階です。

1. ローカルで語彙ベースの軽い候補抽出を行う
2. 上位候補だけ Gemini に渡し、JSON で重複判定を受け取る

これにより、フォーラム全件を毎回 Gemini に送らず、API コストとレイテンシを抑えます。

## Discord API について

Discord の公開アーカイブスレッド取得 API は、`Read Message History` 権限があれば公開アーカイブスレッドを取得でき、レスポンスの `has_more` で追加ページの有無を確認できます。フォーラムチャンネルはスレッドを含むチャンネル種別なので、この Bot はアクティブスレッドと公開アーカイブスレッドを同期対象にしています。
