# Codexとセットアップする

このプロジェクトは、リポジトリをクローンしたあとにCodexアプリまたはCodex CLIで開き、Codexとの対話で環境確認から起動まで進める使い方を想定しています。

Codexはリポジトリ直下の `AGENTS.md` を作業開始時に自動で読みます。そこに、このアプリ固有のセットアップ手順、変更時の制約、検証方法を記載しています。

`AGENTS.md` はセッション開始時に読み込まれます。内容を変更した直後に反映を確認したい場合は、このリポジトリで新しいCodexセッションを開始してください。

## いちばん簡単な始め方

1. リポジトリをクローンします。

   ```bash
   git clone https://github.com/tegnike/nikechan-image-maker.git
   cd nikechan-image-maker
   ```

2. このフォルダをCodexアプリで開くか、フォルダ内でCodex CLIを開始します。
3. 最初のメッセージとして、次を送ります。

   ```text
   AGENTS.mdとdocs/SETUP.mdを読み、現在の環境を調べて、このアプリをセットアップしてください。安全に実行できる作業は進め、最後に素材の保存先、起動URL、Codex画像修正の利用可否、検証結果を報告してください。OpenAI Platform APIは使わないでください。
   ```

Codexは環境を確認し、不足している依存関係の導入、素材保存先の決定、アプリ起動、ヘルスチェックを進めます。外付けボリューム、LaunchAgent、素材生成automationの登録は環境固有なので、必要性を確認せず勝手に設定しません。

## 対応環境

動作確認済みの構成は次のとおりです。

- macOS
- Node.js 22系とnpm
- ChatGPTでログイン済みのCodexアプリまたはCodex CLI
- ローカルの書き込み可能な素材ライブラリ

他のOS、AIエージェント、画像生成基盤では動作確認していません。基本エディタはCodexなしでも起動できる可能性がありますが、「Codexで修正」と素材生成スケジューラを含む完全なワークフローはCodex前提です。

OpenAI Platform APIキーは不要です。画像修正はChatGPTサブスクリプションで認証されたローカルCodexとbuilt-in image generationを使い、APIキー方式へフォールバックしません。

## Codexが確認する項目

セットアップ依頼を受けたCodexは、概ね次を確認します。

```bash
git status --short --branch
node --version
npm --version
codex login status
```

`codex` がPATHにない場合でも、macOSのCodexアプリ同梱CLIを利用できる場合があります。画像修正機能は、ログイン状態に `Logged in using ChatGPT` が確認できるときだけ有効になります。

## 素材ライブラリを選ぶ

保存先に既定の作者パスはありません。書き込み可能な任意の絶対パスを、Git管理外の `.env` へ `THUMBNAIL_LIBRARY_ROOT` として設定します。

```bash
cp .env.example .env
```

作成した `.env` のプレースホルダーを、自分の環境で選んだ保存先へ変更してください。

```dotenv
THUMBNAIL_LIBRARY_ROOT=/your/own/absolute/path/to/thumbnail-library
```

外付けボリュームを指定した場合は、実際にマウントされているときだけ起動します。未接続時に別の場所へ自動退避することはありません。`.env` は `.gitignore` の対象であり、他人の絶対パスをREADMEや設定テンプレートへコピーしません。

初回起動時に、`assets`、`projects`、`exports`、`codex-edits`、`prompts` の各ディレクトリが作成されます。空のライブラリでもエディタは起動できますが、テーマやキャラクターは自分で追加する必要があります。

## 手動でセットアップする場合

新しいクローンでは、lockfileどおりに依存関係を導入します。

```bash
npm ci
```

`.env` へ自分の保存先を設定してから起動します。

```bash
npm run dev
```

一時的に別の保存先を使う場合は、起動コマンドで環境変数を上書きできます。

```bash
THUMBNAIL_LIBRARY_ROOT="/absolute/path/to/library" npm run dev
```

起動後に次を確認します。

```bash
curl http://127.0.0.1:4178/api/health
```

ブラウザでは [http://127.0.0.1:4178](http://127.0.0.1:4178) を開きます。本番相当で起動する場合は次を使います。

```bash
npm run build
THUMBNAIL_LIBRARY_ROOT="/absolute/path/to/library" npm start
```

## Codex画像修正を確認する

アプリ起動後、ヘッダーの「Codexで修正」を開きます。利用可能と表示されれば、現在の1280×720キャンバスとブラウザで入力した指示がローカル `codex exec` へ渡されます。

結果はBEFORE／AFTERでブラウザ表示され、完成PNGはロック済みの画像レイヤーとして最前面へ追加されます。元の編集可能なレイヤーは下に残ります。

利用不可の場合は、まず次を確認します。

```bash
codex login status
```

- Codexが見つからない: Codexアプリをインストールするか、CLIのPATH／`CODEX_BIN`を確認します。
- APIキー認証になっている: ChatGPTアカウントでCodexへログインし直します。APIキーを設定して回避しません。
- 出力されない: 素材ライブラリの `codex-edits/` が書き込み可能か確認します。

## 常駐起動と素材生成automation

`ops/com.nikechan.thumbnail-studio.plist` は公開用テンプレートです。`__PROJECT_DIR__`、`__LOG_DIR__`、`__NODE_BIN__` を自分の環境に合わせて置換してから登録してください。常駐化する場合はCodexへ環境に合わせたコピーの作成と内容確認を依頼できます。

同様に、`automations/ai-t7-10/automation.toml` はプレースホルダーだけを含む公開用テンプレートです。素材生成を有効にしたい場合は、先に `automations/ai-t7-10/workflow.md` を確認し、Codexアプリから自分のプロジェクトとクローン先を対象にautomationを作成してください。

## セットアップ後の検証

コードを変更した場合は次を実行します。

```bash
npm test
npm run build
git diff --check
```

UI変更はこれだけで完了にせず、実ブラウザで対象操作も確認します。
