# Automations

このディレクトリには、AIニケちゃん Thumbnail Studioと一緒に運用するCodexスケジューラ定義のGit管理用スナップショットを保存します。

- `ai-t7-10/automation.toml`: 「AIニケちゃん サムネイル素材 10分」の現在の定義
- `ai-t7-10/workflow.md`: 背景・「朝活」文字・テーマアクセントを一体で生成する実行手順の正本
- ライブ設定: 各利用者のCodexアプリ内automation（リポジトリには保存しない）

ライブ設定の変更にはCodexアプリのautomation更新機能を使います。リポジトリ内の `automation.toml` は公開用テンプレートであり、`project_id` と `cwds` のプレースホルダーを各自の環境で置き換えて登録します。個人環境の値はリポジトリへコミットしません。
