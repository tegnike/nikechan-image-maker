# Thumbnail Studio

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
- 素材ライブラリ用の書き込み可能なディレクトリ
- ChatGPTでログイン済みのCodexアプリまたはCodex CLI

素材ライブラリの保存先は利用者が選び、Git管理外の `.env` に `THUMBNAIL_LIBRARY_ROOT` として設定します。用途、生成文字、キャラクター、生成サイクルもセットアップ時に決め、Git管理外の `studio.config.json` へ保存します。リポジトリには作者固有の値を含めません。

## Codexにセットアップを任せる

リポジトリ直下の [`AGENTS.md`](AGENTS.md) には、Codexが自動で読むプロジェクト固有の指示を用意しています。クローン後、このフォルダをCodexアプリまたはCodex CLIで開き、次のように依頼してください。

```text
AGENTS.mdとdocs/SETUP.mdを読み、現在の環境を調べて、このアプリをセットアップしてください。安全に実行できる作業は進め、最後に素材の保存先、起動URL、Codex画像修正の利用可否、検証結果を報告してください。OpenAI Platform APIは使わないでください。
```

Codexが環境確認、用途・生成文字・キャラクター・生成頻度の確認、ローカル設定作成、依存関係の導入、起動、ヘルスチェックまで対話的に進めます。詳しい項目は [`docs/SETUP.md`](docs/SETUP.md) を参照してください。

## 起動

### 開発モード

```bash
npm ci
cp .env.example .env
# .envのTHUMBNAIL_LIBRARY_ROOTを自分の保存先へ変更
cp studio.config.example.json studio.config.json
# studio.config.jsonを自分の用途・文字・キャラクターへ変更
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

常用環境では `com.nikechan.thumbnail-studio` LaunchAgentを使ってログイン時に起動できます。公開されているplistはテンプレートなので、`__PROJECT_DIR__`、`__LOG_DIR__`、`__NODE_BIN__` を自分の環境に合わせて置換してから登録してください。

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
- 1280×720 PNGの素材ライブラリ保存とブラウザダウンロード

### テーマキット

1テーマは次の素材を同じ `theme_id` でまとめます。

- 背景1点
- 生成文字2点
- 部分フレーム1点

テーマ一覧は新しい順で表示し、パステル、ポップ、クール、ウォーム、ダーク、かわいい、コミック、紙もの、自然、スタイリッシュなどの重複可能な雰囲気タグで絞り込めます。

主題文字の構成は次の3方式です。

- `split-character`: 設定した2文字を別々に生成し、`文字1｜人物｜文字2`へ配置
- `side-by-side`: 設定した主文字の一体ロゴと、生成した補助文字1点
- `diagonal-pair`: 同じ透過PNG内で文字1を左上、文字2を右下へ組んだ一体ロゴと、生成した補助文字1点

主文字、分割文字、補助文字は `studio.config.json` で利用者が決めます。すべて画像生成素材を使い、OSフォント、Webフォント、Canvas文字、SVG文字で代用しません。結合済みロゴを切断して分割文字を作る処理も行いません。

旧テーマの `diagonal-impact` は互換表示用です。新規テーマでは使用しません。

### キャラクターと頭部アンカー

キャラクター素材は `head-anchors.json` に頭部中心と頭部サイズを0〜1の正規化座標で保持します。完成テンプレートは画像全体の中心ではなく、このアンカーを基準に顔寄せ配置します。

キャラクターを選択すると、水色の頭部枠とピンクの中心点を表示します。調整欄からプロジェクト単位で補正できます。

既存素材のアンカーを補修するスクリプトも用意しています。

```bash
python3 scripts/backfill-head-anchors.py --library-root /your/own/absolute/path/to/thumbnail-library
python3 scripts/repair-head-anchors.py --library-root /your/own/absolute/path/to/thumbnail-library
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

次の構成は `.env` の `THUMBNAIL_LIBRARY_ROOT` で指定したディレクトリ内に作成されます。

```text
$THUMBNAIL_LIBRARY_ROOT/
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

任意の旧完成画像を参照する場合は、リポジトリへパスを書かず、ローカル環境の `LEGACY_IMAGE_ROOT` で指定します。

## 素材生成スケジューラ

Git管理上の正本は [`automations/ai-t7-10/workflow.md`](automations/ai-t7-10/workflow.md) と [`automations/ai-t7-10/automation.toml`](automations/ai-t7-10/automation.toml) です。

自動処理は1回につき1素材だけを生成します。1サイクルのテーマ数、キャラクター数、実行間隔はセットアップ時に利用者が決め、`studio.config.json` とCodex automationへ設定します。失敗したスロットは索引へ成功行を追加せず、次回も同じ位置から再開します。

### テーマ生成の品質契約

- 各背景runで実在VTuberの公開YouTube配信サムネイルを調査し、構図、密度、色の役割、部分フレーム文法を文章と正規化比率で記録
- Webから取得したサムネイル画像は一時的な目視分析だけに使い、`image_gen`には渡さず、永続保存もしない
- 画像生成には、保存した構成分析から固有名・実際の文字・ロゴ・画風模倣を除いたテキストの `generation_brief` だけを使用
- 背景には人物、可読文字、疑似文字、小窓、空パネル、ダミータイトル形状を入れない
- 主題文字と補助文字は背景と同じパレット・質感で生成
- 任意小物と四辺フレームは生成しない
- 部分フレームは角飾りまたは上下帯だけ
- 4素材を1280×720で機械合成し、完成構図を目視確認してからテーマを公開
- 文字の誤字、余白過多、疑似文字、過密背景、小窓風構図があれば不採用

ソースURL、動画情報、構成分析Markdownは、素材ライブラリの `prompts/YYYY/MM/DD/` に保存します。候補サムネイルはrun固有の一時ディレクトリでだけ確認し、画像生成前に削除します。過去のワークフローが `references/vtuber-thumbnails/` に保存した既存画像は、新しい生成では参照せず、新規追加もしません。

リポジトリ内の `automation.toml` は公開用テンプレートです。利用時はCodexアプリのautomation機能で、自分のCodexプロジェクト、クローン先、決定した生成間隔を設定してください。個人環境のパス、プロジェクトID、指定文字、キャラクター条件はコミットしません。

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
- [`server/storage.ts`](server/storage.ts): 素材・プロジェクト・テーマの保存
- [`server/studio-config.ts`](server/studio-config.ts): 利用者固有設定の読込と検証
- [`server/codex-edits.ts`](server/codex-edits.ts): ChatGPTサブスクリプション限定のCodex画像修正
- [`automations/ai-t7-10/workflow.md`](automations/ai-t7-10/workflow.md): 素材生成契約

## ライセンス

ソースコードは [MIT License](LICENSE) で公開します。

ただし、次のものはMIT Licenseの対象外です。

- `references/` 以下のAIニケちゃんモデルシートと画像
- AIニケちゃんのキャラクターデザイン、名称、ロゴ、ブランド要素
- 利用者の素材ライブラリ内の生成画像、プロンプト記録、完成画像
- 過去のワークフローが `references/vtuber-thumbnails/` へ取得した外部VTuber／YouTubeサムネイル（新しい生成では参照・追加しません）

これらの画像・キャラクター・第三者コンテンツには、それぞれの権利者の権利が残ります。再利用や再配布の許諾をMIT Licenseから得ることはできません。
