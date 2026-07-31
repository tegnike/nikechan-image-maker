# AIニケちゃん Thumbnail Studio

背景、生成文字、部分フレーム、キャラクターを別レイヤーで組み合わせる、ローカル専用のVTuberサムネイル制作アプリです。

> [!IMPORTANT]
> このプロジェクトはOpenAI Codex前提で設計・開発しています。動作確認はmacOS上のCodexアプリとCodex CLIでのみ行っており、他のAIエージェント、画像生成基盤、OSでは未検証・未サポートです。基本エディタだけを起動できる可能性はありますが、素材生成スケジューラと「Codexで修正」を含む完全なワークフローはCodexなしでは動作しません。

完成一枚絵を直接量産するのではなく、次の構成を基本にしています。

- シンプルな背景1枚
- 頭部アンカー付きキャラクター1人
- テーマと配色を合わせた生成文字、最大2点
- 角飾りまたは上下帯の部分フレーム1点

制作方針は「背景シンプル、キャラでっかく、文字でっかく、小物少々」です。

## 必要なもの

- macOS
- Node.js 22系とnpm
- 素材ライブラリを保存したT7ボリューム
- ChatGPTでログイン済みのCodexアプリまたはCodex CLI

標準の素材ライブラリは `/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker` です。T7が未接続の場合、別のローカルディスクへ自動退避せず起動を停止します。

このリポジトリにはマスターのローカル環境向け絶対パス、LaunchAgent、T7構成が含まれます。別環境で使う場合は、保存先、Node.jsパス、参照画像パス、automation targetを環境に合わせて変更してください。

## 起動

### 開発モード

```bash
npm install
npm run dev
```

### 本番モード

```bash
npm run build
npm start
```

ブラウザで [http://127.0.0.1:4178](http://127.0.0.1:4178) を開きます。

ポートまたは保存先を変える場合は、起動時に環境変数を指定できます。

```bash
PORT=4179 THUMBNAIL_LIBRARY_ROOT=/absolute/path/to/library npm run dev
```

## 常用LaunchAgent

常用環境では `com.nikechan.thumbnail-studio` LaunchAgentがログイン時に起動し、停止時も自動再起動します。T7が外れている間は10秒間隔で待機し、再接続後に配信を開始します。

```bash
launchctl kickstart -k gui/$(id -u)/com.nikechan.thumbnail-studio
launchctl print gui/$(id -u)/com.nikechan.thumbnail-studio
```

定義は [`ops/com.nikechan.thumbnail-studio.plist`](ops/com.nikechan.thumbnail-studio.plist)、起動処理は [`scripts/serve-production.zsh`](scripts/serve-production.zsh) にあります。

ログは次へ保存されます。

```text
~/Library/Logs/nikechan-thumbnail-studio/output.log
~/Library/Logs/nikechan-thumbnail-studio/error.log
```

## 基本ワークフロー

1. 左側の「テーマ」から、色や雰囲気でテーマキットを選びます。
2. 「キャラクター」から1人を選びます。別のキャラクターを選ぶと現在の1人を置き換えます。
3. 完成テンプレート、主題構成、補助文字、仕上げを調整します。
4. キャンバスまたはレイヤー一覧から素材を選び、位置、拡大率、回転、表示順を調整します。
5. プロジェクトを保存するか、1280×720 PNGを書き出します。
6. 必要なら「Codexで修正」から、現在の完成状態をベースに追加修正します。

テーマ適用時は、現在の背景とテーマ由来の文字・部分フレームを置き換えます。配置済みのキャラクターは保持します。

## 主な機能

### レイヤー編集

- 1280×720固定キャンバス
- ドラッグ移動、ホイールまたは四隅ハンドルで拡大縮小
- 回転、左右・上下反転、不透明度変更
- 前面・背面移動、表示切替、ロック解除、複製、削除
- 元に戻す・やり直し、矢印キー移動、Delete／Backspace削除
- 背景とキャラクターは常に各1点。新しい素材で既存素材を置換
- UI内の文字サイズは最小11px
- 320×180縮小プレビュー
- 人物、主題文字、背景、分離、密度、大きさを確認する7項目の構成チェック
- プロジェクトJSONの保存・再読込
- 1280×720 PNGのT7保存とブラウザダウンロード

### テーマキット

1テーマは次の素材を同じ `theme_id` でまとめます。

- 背景1点
- 生成文字2点
- 部分フレーム1点

テーマ一覧は新しい順で表示し、パステル、ポップ、クール、ウォーム、ダーク、かわいい、コミック、紙もの、自然、スタイリッシュなどの重複可能な雰囲気タグで絞り込めます。

主題文字の構成は次の3方式です。

- `split-character`: 「朝」と「活」を別々に生成し、`朝｜人物｜活`へ配置
- `side-by-side`: 一体の「朝活」ロゴと、生成した補助文字1点
- `diagonal-pair`: 同じ透過PNG内で「朝」を左上、「活」を右下へ組んだ一体ロゴと、生成した補助文字1点

補助文字は「配信」「するよ！」「あさかつ」「MORNING STREAM」のいずれか1点です。すべて画像生成素材を使い、OSフォント、Webフォント、Canvas文字、SVG文字で代用しません。結合済みの「朝活」を切断して「朝」「活」にする処理も行いません。

旧テーマの `diagonal-impact` は互換表示用です。新規テーマでは使用しません。

### キャラクターと頭部アンカー

キャラクター素材は `head-anchors.json` に頭部中心と頭部サイズを0〜1の正規化座標で保持します。完成テンプレートは画像全体の中心ではなく、このアンカーを基準に顔寄せ配置します。

キャラクターを選択すると、水色の頭部枠とピンクの中心点を表示します。調整欄からプロジェクト単位で補正できます。

既存素材のアンカーを補修するスクリプトも用意しています。

```bash
python3 scripts/backfill-head-anchors.py
python3 scripts/repair-head-anchors.py
```

### 画像の仕上げ

- 背景のぼかし、明るさ、彩度、色被せ
- キャラクターと生成文字の輪郭、影
- 透明余白の除去
- 「やわらか」「くっきり」の一括仕上げ

## Codexで画像を修正

ヘッダーの「Codexで修正」から、現在の1280×720キャンバスとブラウザ入力の指示をCodexへ送れます。

- 修正指示は最大4,000文字
- 同時実行は1件
- 最大実行時間は20分
- 最近の10件を履歴表示
- 編集元と修正結果をBEFORE／AFTER表示
- 完成PNGをブラウザ表示または保存
- 完成PNGをロック済みの画像レイヤーとして自動的に最前面へ追加
- 過去の結果も「最前面へ配置」から重複なく再配置
- モーダルを閉じても進行中のジョブを監視

Codex結果は全体が1枚に統合された画像なので、内部の人物・文字・背景を個別編集することはできません。画像レイヤーとして表示切替、削除、並び替え、ロック解除はできます。元の編集可能なレイヤーは下に残ります。

### ChatGPTサブスクリプションのみを使う

この機能はローカルの `codex exec` とbuilt-in image generationを使います。

- 実行前に `codex login status` を確認
- ChatGPTログイン以外では失敗終了
- 子プロセスから `OPENAI_API_KEY`、`CODEX_API_KEY`、`CODEX_ACCESS_TOKEN` を除外
- OpenAI Platform APIやAPIキー方式へフォールバックしない
- built-in image generationは1依頼につき1回だけ
- 生成結果は正確な1280×720 PNGだけを採用

```bash
codex login status
```

Codex実行ファイルは、Codexアプリ同梱版、実行中Node.jsと同じディレクトリ、通常の `PATH` の順で解決します。明示的に固定する場合は `CODEX_BIN` に絶対パスを指定します。

## 保存先

```text
/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker/
├── assets/
│   ├── characters/YYYY/MM/DD/
│   ├── backgrounds/YYYY/MM/DD/
│   ├── texts/YYYY/MM/DD/
│   └── decorations/YYYY/MM/DD/
├── prompts/YYYY/MM/DD/
├── projects/
├── exports/
├── codex-edits/
│   └── <job-id>/
│       ├── input.png
│       ├── output.png
│       ├── job.json
│       └── final.txt
├── head-anchors.json
├── theme-kits.json
└── index.jsonl
```

- `theme-kits.json`: 公開済みテーマの正本
- `head-anchors.json`: キャラクターの頭部アンカー正本
- `index.jsonl`: 素材生成履歴と現在の生成スロット判定
- `prompts/`: 生成条件、参照元、ハッシュ、検証記録
- `projects/`: 保存した編集プロジェクト
- `exports/`: 書き出した完成PNG
- `codex-edits/`: Codex画像修正の入力、結果、状態、最終回答

旧完成画像 `/Volumes/EXTERNAL_VOLUME/ニケ/imagegen` は読み取り専用として扱い、このアプリから変更しません。

## 素材生成スケジューラ

Git管理上の正本は [`automations/ai-t7-10/workflow.md`](automations/ai-t7-10/workflow.md) と [`automations/ai-t7-10/automation.toml`](automations/ai-t7-10/automation.toml) です。

自動処理は1回につき1素材だけを生成し、次の13スロットを循環します。

```text
theme-a-background
→ theme-a-title-primary
→ theme-a-title-secondary
→ theme-a-accent
→ theme-b-background
→ theme-b-title-primary
→ theme-b-title-secondary
→ theme-b-accent
→ character-1
→ theme-c-background
→ theme-c-title-primary
→ theme-c-title-secondary
→ theme-c-accent
→ theme-a-background
```

13runで、背景・生成文字2点・部分フレームからなるテーマ3セットと、キャラクター1点を作ります。失敗したスロットは索引へ成功行を追加せず、次回も同じ位置から再開します。

定義名は互換上「AIニケちゃん サムネイル素材 10分」ですが、現行の `automation.toml` は5分間隔です。

### テーマ生成の品質契約

- 各背景runで実在VTuberの公開YouTube配信サムネイルを1枚だけ参照
- キャラクター、文字、ロゴ、固有マークはコピーせず、構図、密度、色の役割、部分フレーム文法だけを抽象化
- 背景には人物、可読文字、疑似文字、小窓、空パネル、ダミータイトル形状を入れない
- 主題文字と補助文字は背景と同じパレット・質感で生成
- 任意小物と四辺フレームは生成しない
- 部分フレームは角飾りまたは上下帯だけ
- 4素材を1280×720で機械合成し、完成構図を目視確認してからテーマを公開
- 文字の誤字、余白過多、疑似文字、過密背景、小窓風構図があれば不採用

参照した公開サムネイルとsource JSONは `references/vtuber-thumbnails/YYYY/MM/DD/` に保存します。このフォルダはスケジューラの作業成果であり、通常のアプリ変更では編集・削除しません。

ライブ設定は `/Users/your-name/.codex/automations/ai-t7-10/automation.toml` にあります。変更時はCodexアプリのautomation更新機能を使い、リポジトリ側のスナップショットも同じ内容へ揃えます。

## 検証

```bash
npm test
npm run build
git diff --check
```

UI変更では、コードやDOMだけでなく、実ブラウザでクリック、ホイール、レイヤー置換、スクロール、保存・再読込まで確認します。

## 主な実装

- [`src/App.tsx`](src/App.tsx): エディタUI、レイヤー操作、テーマ適用、Codex修正画面
- [`src/lib.ts`](src/lib.ts): 配置、置換、正規化、構成チェック
- [`src/types.ts`](src/types.ts): プロジェクト、レイヤー、テーマ、Codexジョブの型
- [`server/index.ts`](server/index.ts): ローカルHTTP API
- [`server/storage.ts`](server/storage.ts): T7素材・プロジェクト・テーマの保存
- [`server/codex-edits.ts`](server/codex-edits.ts): ChatGPTサブスクリプション限定のCodex画像修正
- [`automations/ai-t7-10/workflow.md`](automations/ai-t7-10/workflow.md): 素材生成契約

## ライセンス

ソースコードは [MIT License](LICENSE) で公開します。

ただし、次のものはMIT Licenseの対象外です。

- `references/` 以下のAIニケちゃんモデルシートと画像
- AIニケちゃんのキャラクターデザイン、名称、ロゴ、ブランド要素
- T7素材ライブラリ内の生成画像、プロンプト記録、完成画像
- `references/vtuber-thumbnails/` へ取得する外部VTuber／YouTubeサムネイル

これらの画像・キャラクター・第三者コンテンツには、それぞれの権利者の権利が残ります。再利用や再配布の許諾をMIT Licenseから得ることはできません。
