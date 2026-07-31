# Automations

このディレクトリには、Thumbnail Studioと一緒に運用するCodexスケジューラの公開用テンプレートを保存します。

- `ai-t7-10/automation.toml`: automation登録用テンプレート
- `ai-t7-10/workflow.md`: `studio.config.json` に従って背景・文字・部分フレーム・キャラクターを生成する共通契約
- ライブ設定: 各利用者のCodexアプリ内automation（リポジトリには保存しない）

セットアップ時に、用途、生成文字、キャラクター、検索語、1サイクルの素材数、実行間隔を利用者と決めます。公開サムネイルは一時的な構成分析にだけ使い、画像生成へ直接渡しません。Codexアプリでautomationを登録するときは、テンプレートの `project_id`、`cwds`、`rrule` をローカル設定に合わせます。個人環境の値はリポジトリへコミットしません。
