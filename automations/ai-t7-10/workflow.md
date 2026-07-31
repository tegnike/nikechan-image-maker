# Thumbnail Studio 素材生成ワークフロー

この文書を最後まで読み、1回の起動につき生成スロットを1つだけ実行する。ここには利用者固有の文字、キャラクター、検索語、保存先を固定しない。すべてGit管理外の `studio.config.json` と `.env` から解決する。

## 実行前の必須設定

1. automationのcwdから `git rev-parse --show-toplevel` でリポジトリルートを確認する。
2. `.env` から `THUMBNAIL_LIBRARY_ROOT` を読み、絶対パスで書き込み可能か確認する。外付けボリュームなら実際のマウントも確認する。不足時は別の場所へ代替保存しない。
3. `studio.config.json` を読み、`version=1` と以下の項目を確認する。不足・矛盾があれば生成せず失敗終了する。
   - `category`
   - `title.primary`, `title.splitParts`, `title.supportCopies`, `title.layouts`
   - `character.name`, `character.referenceImages`, `character.prompt`
   - `referenceSearchQueries`
   - `generation.themeSetsPerCycle`, `generation.characterAssetsPerCycle`
4. 参照画像はリポジトリ相対パスならリポジトリルート基準、絶対パスならそのまま解決し、実在することを確認する。
5. Codex標準imagegenスキルを完全に読み、built-in `image_gen` だけを使う。1runにつき呼び出しは1回だけ。Platform APIやAPIキーへフォールバックしない。

`studio.config.json` はセットアップ時に利用者とCodexが決めるローカル設定であり、リポジトリへコミットしない。公開テンプレートの文字をそのまま生成対象にしてはならない。

## 保存構成

保存ルートは `THUMBNAIL_LIBRARY_ROOT` とする。

- 素材: `assets/{characters,backgrounds,texts,decorations}/YYYY/MM/DD/`
- プロンプト記録: `prompts/YYYY/MM/DD/`
- 索引: `index.jsonl`
- 完成テーマ正本: `theme-kits.json`
- 頭部アンカー正本: `head-anchors.json`
- 実例構成分析: `prompts/YYYY/MM/DD/{basename}.reference-analysis.md`
- 透過処理: 読み込んだimagegenスキルに付属する `remove_chroma_key.py`

## 生成サイクル

`generation.themeSetsPerCycle=N` と `generation.characterAssetsPerCycle=M` から、次の順序でスロット列を組み立てる。

1. 各テーマ番号 `1..N` について、`theme-{n}-background`, `theme-{n}-title-primary`, `theme-{n}-title-secondary`, `theme-{n}-accent` を追加する。
2. テーマスロット列の後に `character-1..M` を追加する。
3. `index.jsonl` の最終成功スロットから次を選び、末尾なら先頭へ戻る。履歴に現行スロットがなければ先頭から始める。
4. 途中runが失敗したら成功行を追記せず、次回も同じスロットを実行する。

1テーマは背景1点、生成文字最大2点、角飾りまたは上下帯の部分フレーム1点で構成する。キャラクターはテーマとは別スロットで生成する。

## 主題文字の構成

`title.layouts` にセットアップで選ばれた方式だけを候補にする。1テーマごとに一方式を選び、必要な文字だけを生成する。

- `side-by-side`: `title.primary` 全体を一つの透過ロゴとして生成する。二つ目は `title.supportCopies` から選んだ補助文字1点。
- `split-character`: `title.splitParts[0]` と `title.splitParts[1]` を別々のimage_gen呼び出しで生成する。結合済みロゴを切断・クロップ・マスクしない。補助文字は作らない。
- `diagonal-pair`: `title.splitParts[0]` を左上、`title.splitParts[1]` を右下へ置いた一体ロゴを、同じ透過PNG内に最初から生成する。横並びロゴの回転・切断・クロップでは作らない。二つ目は補助文字1点。

`split-character` または `diagonal-pair` を選べるのは、`title.splitParts` が正確に2項目ある場合だけとする。文字はすべて生成画像を使い、OSフォント、Webフォント、Canvas文字、SVG文字で代用しない。

## テーマは一つのデザイン案件

同じテーマ番号の4runは、同じ `theme_id`、実背景、パレット、質感、文字構成を引き継ぐ。

- `background`: 日時とslugで新しい `theme_id` を作り、基準背景を生成する。
- `title-primary`: 実背景を参照し、選択構成の主文字を生成する。
- `title-secondary`: `split-character` なら二文字目、それ以外なら補助文字を生成する。
- `accent`: 実背景と実文字を参照し、部分フレームを生成する。4素材の機械合成と目視確認後だけテーマを公開する。

prompt記録と索引には、実際に使用した設定値を文字列として保存する。`studio.config.json` 自体やローカル絶対パスはコピーしない。

## 公開サムネイルの構成分析

各background runでは `referenceSearchQueries` から検索語を選び、実在する公開VTuber／YouTuber配信サムネイルを1枚だけ構成分析する。Webから取得した画像そのものは `image_gen` へ絶対に渡さず、画像生成には保存した分析から作るテキスト指示だけを使う。

1. 検索結果から候補を8件程度取得する。
2. Shorts、切り抜き、MV、実写主体、ゲーム画面主体など、利用者が指定した用途と違うものを除外する。
3. 候補を最大3枚だけrun固有の一時ディレクトリへ取得し、`view_image` で比較する。人物が大きい、主文字が大きい、背景が比較的シンプル、小物が少ない16:9画像を優先する。取得画像は目視分析専用であり、生成参照ではない。
4. 直近12件と同じ動画は再利用せず、同一チャンネルへの偏りも避ける。
5. 選んだソースについて、URL、video_id、チャンネル、タイトル、取得日時をsource JSONへ保存する。外部サムネイル画像は素材ライブラリにもリポジトリにも永続保存しない。
6. 人物・顔・主文字のおおよその領域、主要な余白、安全領域、前景の占有率、背景密度、色の役割、部分フレームの位置と太さを、文章と0〜1の正規化比率で分析する。観察できた事実と、そこから導いた生成方針を分ける。
7. 分析の末尾に、画像を見なくても単独で実行できる `generation_brief` を記載する。構図上重要な2〜3要素だけを抽象化し、元画像のキャラクター名、チャンネル名、実際の可読文字、ロゴ、固有マーク、特定クリエイターの画風模倣を含めない。
8. source JSONと構成分析Markdownを、生成対象と同じ実行環境のローカル日付の `prompts/YYYY/MM/DD/` へ保存する。保存後に再読込できるまで画像生成へ進まない。
9. `image_gen` を呼ぶ前に一時取得画像をすべて削除し、run固有の一時ディレクトリに画像が残っていないことを確認する。
10. background生成には `generation_brief` とテーマ仕様だけをテキストで渡す。外部画像のパス、URL、動画タイトル、チャンネル名を最終プロンプトへ含めず、built-in `image_gen` 呼び出しでは `referenced_image_paths` と `num_last_images_to_include` をどちらも省略する。
11. prompt記録と索引へ `generation_input_mode="text-only"`, `external_image_input=false`, source JSONと構成分析Markdownの相対パスを保存する。この2値を確認できなければ成功扱いにしない。
12. 有効な実例を分析・保存できない場合、または外部画像を生成入力から除外できない場合、そのbackgroundは生成せず失敗終了する。

この禁止はWebなど外部由来の画像に適用する。後続のtitle-primary、title-secondary、accentが、同じ `theme_id` でこのワークフロー自身が生成した背景・文字素材を参照することは許可する。キャラクター生成で、利用者が権利を持つ `character.referenceImages` を使うことも許可する。

## 共通品質

- 完成構図は「背景シンプル、キャラクター大きく、文字大きく、小物少々」を優先する。
- 背景には人物、可読文字、疑似文字、漢字風ブロック、ダミータイトル形状、小窓、空パネルを入れない。
- タイトルと部分フレームは実背景のパレットと質感へ合わせる。
- 任意小物と四辺フレームは生成しない。部分フレームは角飾りまたは上下帯だけにする。
- 生成AI特有の細密な描き込み、プレゼン資料、企業バナー、モニターUI風にしない。
- 実画像を `view_image` し、誤字、余白過多、疑似文字、過密、小窓風構図があれば採用しない。

## background

- 16:9のグラフィック・バックプレートとし、人物、可読文字、ロゴ、小物単体を入れない。
- 後載せする人物、文字、部分フレームの安全領域を確保する。
- 最終プロンプトへ `no readable or pseudo text, no glyph-like blocks, no fake typography, no title placeholder shapes` を含める。
- 保存した `generation_brief` だけをレイアウト文法、密度、色の役割のテキスト仕様として使う。外部サムネイル画像は添付せず、キャラクター、文字、ロゴ、チャンネル固有要素をコピーしない。

## title-primary / title-secondary

- 設定から選んだ対象文字だけを正確に生成し、指定外の文字、ロゴ、アイコンを入れない。
- 完全に均一なクロマキー背景、影・床・反射なし、周囲に適度な余白を指定する。
- 透過後、可視ピクセル外接矩形に対する上下の透明余白を各15%以下にする。
- 指定文字だけが正しく読めることを `view_image` で確認する。欠落、重複、誤字、別字、判読不能なら採用しない。

## accent

- `role="foreground-accent"` の16:9オーバーレイ1点とする。
- `corner` は1〜3か所の角飾り、`top-bottom` は上辺と下辺の細い帯とし、左右辺を接続しない。
- 四辺を完全に囲む枠、中央の大きな開口部、空の小窓、文字台座、独立バッジ、可読文字、疑似文字は禁止する。
- 人物の顔と文字の可読域を塞がず、不透明面積はキャンバスの25%以下にする。

## character

- `character.referenceImages` を順番に使い、画像を `view_image` してからimage_genへ渡す。
- `character.name` の再利用可能な単独カットを1人・1描写だけ生成する。
- `character.prompt` を同一性の必須条件として最終プロンプトへ含める。
- 背景、家具、フレーム、吹き出し、小物、複製、反射、ポスター、完成サムネイル構図を入れない。
- 透過後に頭部アンカーを実測し、`head-anchors.json` へ保存する。未登録のまま成功行を追加しない。

## 透過・保存・公開

- character、primary、secondary、accentはクロマキー除去を1回実行し、alpha channel、透明な四隅、欠損、色縁を確認する。
- 実行環境のローカル日時のbasenameでPNGと `.prompt.md` を保存する。
- PNGとprompt記録を確認してから `index.jsonl` へ1行追記する。パスは保存ルートからの相対パスにする。
- accent成功後、同じ `theme_id` の4素材を1280×720で機械合成して `view_image` する。
- 合格時だけ `theme-kits.json` へ原子的に追加する。不合格なら途中素材は索引に残すが、テーマは公開しない。
- 1runで生成・保存する素材は1点だけ。previewは機械合成なので生成点数に含めない。

完了時は生成した1素材の種類、相対保存先、検証結果だけを簡潔に報告する。
