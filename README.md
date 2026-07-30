# AIニケちゃん Thumbnail Studio

背景と「朝活」文字を一つのテーマセットとして選び、キャラクターを組み合わせるローカル専用のVTuberサムネイル制作アプリです。

## 起動

T7を接続した状態で、プロジェクトディレクトリから実行します。

```bash
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:4178` を開きます。

常用環境では `com.nikechan.thumbnail-studio` LaunchAgent がログイン時に起動し、終了時には自動再起動します。T7が外れている間は待機し、再接続後に自動で配信を再開します。

```bash
launchctl kickstart -k gui/$(id -u)/com.nikechan.thumbnail-studio
launchctl print gui/$(id -u)/com.nikechan.thumbnail-studio
```

## できること

- 1280×720キャンバス上で画像・文字レイヤーを移動、ホイール／四隅ドラッグで拡大縮小、回転、反転
- レイヤーの並び替え、表示切替、固定、複製、削除
- 日本語文字のフォント、色、縁取り、影、揃えを編集
- 生成文字画像にも対応した3種類の完成テンプレート（配置と仕上げを同時適用）
- キャラクターごとの頭部アンカーを使った、全身／縦長素材でも顔が小さくならない人物配置
- 同じ配色・形状・質感で生成した背景と文字をまとめて適用するテーマキット
- 背景のぼかし、明るさ、彩度、色被せ
- 人物・文字画像の輪郭線、影、透明余白の自動除去
- やわらか／くっきりのVTuber向け一括仕上げ
- 320×180の縮小プレビューと7項目の構成チェック
- プロジェクトJSONの保存と再読込
- 1280×720 PNGのT7保存とダウンロード
- 現在のキャンバスとブラウザ入力の指示をCodexへ送り、修正結果をBEFORE／AFTERで確認・保存
- キャラクターPNG/JPEG/WebPのライブラリ登録
- スケジューラが追加した素材を10秒以内に自動反映
- 背景素材は常に1枚だけ保持し、新しい背景を選ぶと自動で差し替え

## 保存先

標準では `/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker` を使います。

```text
thumbnail-maker/
├── assets/
│   ├── characters/
│   ├── backgrounds/
│   ├── texts/
│   └── decorations/
├── prompts/
├── projects/
├── exports/
├── codex-edits/
├── head-anchors.json
├── theme-kits.json
└── index.jsonl
```

## Codexで画像を修正

ヘッダーの「Codexで修正」を開くと、現在の1280×720キャンバスを編集元として固定し、ブラウザ上で修正指示を入力できます。処理中の状態と過去10件の履歴を表示し、完成後は編集元と修正結果を並べて確認できます。完成PNGは自動でロック済みの最前面画像レイヤーとして追加され、過去の結果も「最前面へ配置」から重複なく戻せます。結果PNGはブラウザで開くか、そのまま保存できます。

この機能はローカルの`codex exec`とbuilt-in image generationだけを使います。起動時と実行直前に`codex login status`を検査し、ChatGPTログインでない場合は実行しません。Codex子プロセスには`OPENAI_API_KEY`、`CODEX_API_KEY`、`CODEX_ACCESS_TOKEN`を渡さず、OpenAI Platform APIへのフォールバックも行いません。サブスクリプション枠を予測しやすくするため、画像生成は1依頼につき1回だけに制限し、追加修正はブラウザから新しい依頼として送ります。

```bash
codex login status
```

常用のLaunchAgentでは、まずCodexアプリ同梱の互換ランタイムを使い、見つからない場合だけ実行中のNode.jsと同じbinディレクトリからCodexを解決します。別のCodex実行ファイルを使う場合だけ、サーバー起動時に`CODEX_BIN`で絶対パスを指定できます。

`head-anchors.json` は、キャラクターPNG全体に対する頭部中心と頭部サイズを0〜1の正規化座標で保持します。キャラクターを選択すると、水色の頭部枠とピンクの中心点をキャンバス上で確認でき、調整欄からプロジェクト単位で補正できます。既存素材のアンカーを再構築する場合は次を実行します。

```bash
python3 scripts/backfill-head-anchors.py
```

別の保存先で試す場合は、起動時に `THUMBNAIL_LIBRARY_ROOT` を指定できます。

## 素材生成

Codexスケジューラ「AIニケちゃん サムネイル素材 10分」は、20runで背景＋文字のテーマ9セットとキャラクター2点を補充します。文字の生成対象は正確な二文字「朝活」だけです。

背景と文字は独立素材として生成せず、同じ `theme_id` の2点セットとして2run連続で作ります。最初に共通パレット、締め色、形状、質感、文字処理、構図を決め、文字生成では実際に完成した背景PNGをスタイル参照として渡します。簡易合成でも一体に見えることを確認してから `theme-kits.json` へ公開します。小物・前景は生成せず、必要な枠・帯・コーナー・文字台座は背景へ統合します。

アプリの素材ライブラリは「テーマ」と「キャラクター」の2タブだけです。「テーマ」では背景と生成文字の重なりを確認でき、「セットで追加」で一括配置します。

人物素材では透過処理後のPNGを確認し、主な頭部領域の中心と大きさを `head-anchors.json`、prompt記録、索引へ保存します。完成テンプレートは画像全体の中心ではなく、この頭部アンカーを基準に人物を拡大・配置します。

旧完成画像 `/Volumes/EXTERNAL_VOLUME/ニケ/imagegen` は移行後も変更しません。

### スケジューラ定義の管理

稼働中のCodexスケジューラ定義は [`automations/ai-t7-10/automation.toml`](automations/ai-t7-10/automation.toml) に保存し、アプリ本体と一緒にGitでバージョン管理します。ライブ設定は `/Users/your-name/.codex/automations/ai-t7-10/automation.toml` にあります。スケジューラを変更するときはCodexアプリ側の更新機能を使い、同じ内容をリポジトリ側にも反映してください。
