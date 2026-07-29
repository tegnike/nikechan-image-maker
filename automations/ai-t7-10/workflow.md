# AIニケちゃん サムネイルテーマ生成ワークフロー

この文書を最後まで読み、1回の起動につき以下の生成スロットを1つだけ実行する。

## 固定パス

- 作業場所: `/Users/your-name/WorkSpace/nikechan-image-maker`
- 参照画像A: `/Users/your-name/WorkSpace/nikechan-image-maker/references/nikechan-model-sheet.png`
- 参照画像B: `/Users/your-name/WorkSpace/nikechan-image-maker/references/nikechan-model-sheet-piercing.png`
- 参照画像C: `/Users/your-name/WorkSpace/nikechan-image-maker/references/nikechan-model-sheet-outer-piercing.png`
- 保存ルート: `/Volumes/EXTERNAL_VOLUME/ニケ/thumbnail-maker`
- 素材: `assets/{characters,backgrounds,texts,decorations}/YYYY/MM/DD/`
- プロンプト記録: `prompts/YYYY/MM/DD/`
- 索引: `index.jsonl`
- 完成テーマ正本: `theme-kits.json`
- 頭部アンカー正本: `head-anchors.json`
- 透過処理: `/Users/your-name/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py`
- 旧完成画像: `/Volumes/EXTERNAL_VOLUME/ニケ/imagegen`（読み取り専用）
- 実例サムネイル参照: `references/vtuber-thumbnails/YYYY/MM/DD/`

## 実行前と生成回数

1. `/Volumes/EXTERNAL_VOLUME` が実際にマウントされ、保存ルートと必要な参照画像が利用できることを確認する。不足時はローカルへ代替保存せず失敗終了する。
2. Codex標準imagegenスキルを完全に読み、内蔵`image_gen`を使う。1runにつき呼び出しは1回だけ。生成失敗時は再生成せず失敗終了する。
3. `index.jsonl`の最終`generation_slot`から次の10スロットを循環する。

`theme-a-background → theme-a-title → theme-a-accent → theme-b-background → theme-b-title → theme-b-accent → character-1 → theme-c-background → theme-c-title → theme-c-accent → theme-a-background`

新スロットがなければ`theme-a-background`から始める。10runでテーマ3セットとキャラクター1点を作り、キャラクター比率を10%にする。
4. 途中runが失敗したら索引へ成功行を追記せず、次runで同じスロットを再開する。対応する前工程が索引にない場合、新しいテーマを捏造せず失敗終了する。

## テーマは一つのデザイン案件

背景・「朝活」文字・アクセントを独立した素材として考えない。同じグループの3runは同じ`theme_id`、テーマ仕様、実生成画像を引き継ぐ。

- `background`: Europe/Warsaw日時と英数字slugで新しい`theme_id`を作り、テーマの基準デザインとなる背景を生成する。
- `title`: 同じグループの直前background行を索引から取得し、実背景PNGを参照画像にして、同じ世界観の「朝活」文字だけを生成する。
- `accent`: 同じグループの実背景PNGと実title PNGを両方参照し、同じ世界観の透過アクセント1点を生成する。成功後に3素材の合成を検査し、テーマを公開する。

これは一枚絵の機械的なピクセル分割ではない。最初の背景をデザインマスターとして、後続素材を実画像参照で派生させることで、分割後も色・形・質感を揃える。

## 実在VTuberサムネイルの参照

自由創作だけでテーマを決めない。各`*-background` runでは、画像生成前に実在するVTuberの公開YouTube配信サムネイルを必ず1枚選び、その実画像を`image_gen`の参照画像として使う。

1. `yt-dlp`のYouTube検索を使い、`VTuber 朝活 雑談`、`VTuber 朝活 配信`、`VTuber 雑談 配信`などから候補を8件程度取得する。動画ID、動画URL、サムネイルURL、チャンネル名、動画タイトルを取得する。
2. Shorts、切り抜き、MV、歌ってみた、実写主体、ゲーム画面主体、サムネイルが取得できない動画は除外する。VTuber本人の配信待機枠または配信アーカイブを優先する。
3. 候補サムネイルを最大3枚だけ一時取得して`view_image`で比較する。背景が比較的シンプル、人物が大きい、主要文字が大きい、小物が少ない、16:9であるものを優先する。検索順位1位を無条件に選ばない。
4. `index.jsonl`の直近12件のbackground行で使った`reference_video_id`と同じ動画は再利用しない。同一チャンネルは直近3テーマにあれば避ける。
5. 選んだ1枚を`references/vtuber-thumbnails/YYYY/MM/DD/{video_id}.jpg`へ保存する。同名の`{video_id}.source.json`へ動画URL、サムネイルURL、チャンネル名、動画タイトル、取得日時を保存する。不採用候補は永続保存しない。
6. 選んだ実画像を次の観点で分析する。
   - 人物の位置と画面占有率
   - 顔の位置
   - 主文字の位置と画面占有率
   - 背景の単純さと明暗分布
   - 色の役割とコントラスト
   - 外周・帯・部分フレームの使い方
   - 小物の種類、個数、大きさ
7. 分析から`reference_layout`, `reference_density`, `reference_palette_roles`, `reference_frame_grammar`, `reference_prop_grammar`を作り、テーマ仕様へ保存する。これらのうち構図上重要な2〜3要素を新テーマへ明確に継承する。
8. 元サムネイルのキャラクター、顔、衣装、可読文字、ロゴ、チャンネル固有マーク、透かし、固有パターンはコピーしない。全体を忠実に複製せず、レイアウト文法と情報密度をAIニケちゃん向けに変換する。
9. 実例がシンプルなら、生成背景へ実例にないパネル、窓、細密装飾を追加しない。「新奇なテーマを発明すること」より「実在サムネイルらしい構成を保つこと」を優先する。
10. 有効な実例を取得・保存できない場合、そのbackgroundは生成せず失敗終了する。想像上の参照元やURLを記録しない。

## テーマ仕様

background行のprompt記録と索引へ次を必ず保存し、titleとaccentへ一字一句引き継ぐ。

- `theme_id`, `theme_name`, `category="朝活"`, `mood`
- `palette`: 正確なHEXを4〜5色
- `contrast_anchor`
- `shape_language`
- `texture_language`: 最大2種
- `title_treatment`
- `accent_concept`: モチーフ、役割、想定位置
- `composition_zone`: character, title, accentの安全領域
- `visual_family`
- `reference_video_id`, `reference_video_url`, `reference_thumbnail_url`, `reference_channel`, `reference_video_title`
- `reference_layout`, `reference_density`, `reference_palette_roles`, `reference_frame_grammar`, `reference_prop_grammar`

完成テーマ直近6件を`view_image`で比較し、参照元の違いを活かしながらmood、palette、shape_language、texture_languageの最低2軸を変える。実例との構成類似性を壊してまで差別化しない。単なる色替えは禁止する。visual familyは参照サムネイルの観察結果から決め、抽象的なテーマ名を先に選んで実例を歪めない。

## 共通品質

- 「別々の素材」より「重ねた一枚を使いたくなること」を優先する。
- AIニケちゃんの紫髪、青緑Tシャツ、ピンクの上着と調和または意図的に対比する配色にする。
- パステルだけで薄くせず、必ず強いcontrast anchorを置く。
- プレゼン資料、企業Webバナー、汎用壁紙、素材シート、生成AIの細密イラストにしない。
- 背景はシンプル、人物と文字は大きく、小物は1点を原則とする。160px幅でも人物、文字、テーマの順に読める設計にする。
- 太陽、日の出、光線、黄色を朝らしさの既定表現にしない。sun familyが完成テーマ直近8件にあれば禁止する。
- 空の小窓、モニター、ディスプレイ、UIパネル、配信画面枠、picture-in-picture、空のカード、文字待ちの四角、プレースホルダー領域を作らない。
- 要素を囲うためだけの大きな角丸矩形を作らない。人物や文字を「小窓の中」に収める構図は禁止する。

## background

- 選定した実在VTuberサムネイル1枚だけを構図・密度の参照画像として使う。16:9横長。人物、文字、ロゴ、小物単体を入れない。
- 完成した部屋や風景ではなく、VTuber配信サムネイルのグラフィック・バックプレートとして作る。
- 後載せする大きな人物、タイトル、アクセントのための余白を持たせるが、淡色無地や薄い幾何図形だけにしない。
- 共通palette、shape language、texture languageを使い、視線誘導、人物側の抜け、タイトル側のコントラストに役割を持たせる。
- 外周全部を囲う太いフレームは背景へ焼き込まない。テーマに必要な縁取りは部分的な角・帯・曲線に留める。
- 最終プロンプトへ、参照画像から継承する構図要素を具体的に列挙する。さらに`use the reference only for layout grammar, visual density, palette roles, and edge treatment; do not copy its character, text, logo, or channel identity`、`graphic design backplate for a VTuber livestream thumbnail, not a presentation slide, website banner, monitor UI, or picture-in-picture layout`、`no character, no readable text, no empty window or placeholder panel`を含める。

## title

- 生成対象は正確な二文字「朝活」だけ。別の文字、数字、英語、ロゴを入れない。
- 同じ`theme_id`の実背景PNGをスタイル参照に使い、palette、shape language、texture language、title treatmentを一致させる。
- 背景と無関係な汎用ステッカーにしない。多重アウトラインは禁止し、輪郭は原則1系統、必要でも2系統まで。
- 二文字の大小差、重なり、分割、傾き、ベースライン、字間までテーマとして設計してよい。ただし最終的な可読文字は「朝活」だけにする。
- 1画像につきロゴ1点。完全に均一な`#00ff00`背景、影・床・反射なし、周囲に余白、ロゴ内に`#00ff00`を使わないと明記する。
- 欠落、重複、誤字、別字、判読不能、指定外文字があれば採用しない。

## accent

- 同じ`theme_id`の実背景PNGと透過title PNGを参照画像に使う。
- 原則は、自由に移動・拡大縮小・削除できる`role="prop"`の中サイズ小物1点とする。
- モチーフはテーマに由来させる。例: マグ、目覚まし時計、ヘッドホン、マイク、ノート、ペン、チャット記号、リボンタグ。ただし履歴とテーマに応じて選び、毎回同じ太陽や時計にしない。
- 細かい小物を大量に散らさず、1〜2モチーフを一つのまとまりとして描く。人物の顔や「朝活」の可読域を塞がない。
- 背景の縁や曲線と呼応する場合のみ`role="foreground-accent"`を選べる。画面全体を閉じ込める額縁ではなく、最大でも2辺の部分的な前景アクセントとし、大きな透明開口部を持たせる。
- 空の小窓、モニター、UIパネル、配信画面枠、文字台座だけの四角、完成サムネイル全体は生成しない。
- 完全に均一な`#00ff00`背景、影・床・反射なし、周囲に余白、素材内に`#00ff00`を使わないと明記する。
- 透過後の見える領域がキャンバスの65%を超える場合、`foreground-accent`以外では採用しない。
- prompt記録と索引へ`accent_role`、`accent_motif`、`default_placement={x,y,width}`を保存する。配置は1280x720キャンバス座標。propの推奨widthは180〜380、foreground-accentは650〜1280。

## character-1

- 参照画像はA→B→C→Aの順で、直近character行の`reference_slot`の次を1枚だけ選び、`view_image`で確認して内蔵image_genへ渡す。
- AIニケちゃん本人の再利用可能な単独カットを1人・1描写だけ生成する。胸上、腰上、膝上、全身、左右向き、表情、手のポーズを履歴と変える。
- 背景、家具、フレーム、吹き出し、小物、複製、反射、ポスター、完成サムネイル構図を入れない。
- 次の固定文言を最終プロンプトへ一字一句含める。

```text
女の子の特徴を以下に示す。
- 金色のヘアピンは「AI」という文字の形をしています。
- 黒いシュシュを使って高めの位置でポニーテールをまとめている。
- Tシャツの胸の部分には、「AITuber」という文字が書かれている。
- ジーンズのショートパンツを履いている。
- 瞳は淡い琥珀色。
- 数種類の小さなピアスを両耳に付けている。
```

- 完全に均一な`#00ff00`クロマキー背景、影・床・反射なし、被写体の周囲に余白、被写体内に`#00ff00`を使わないと明記する。

## 透過と頭部アンカー

- character、title、accentは生成元を`tmp/imagegen/`へコピーし、`remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`を1回実行する。
- alpha channel、透明な四隅、欠損なし、緑縁なしを確認する。細い緑縁だけなら`--edge-contract 1`を加えた透過処理だけを1回再実行してよい。欠損時は採用しない。
- characterは透過PNGを`view_image`で確認し、頭蓋・前髪・側頭部の髪を含む主な頭部領域（首、手、長いポニーテールは除外）の中心と外接矩形を決める。
- `centerX`, `centerY`, `width`, `height`を元PNG全体に対する0〜1で`head-anchors.json`へ原子的に保存する。`sourceWidth`, `sourceHeight`, `method="manual-reviewed"`, `confidence`も記録する。

## 保存・索引・テーマ公開

- Europe/Warsaw日時のbasenameでカテゴリ別PNGと対応する`.prompt.md`を保存する。
- prompt記録にはasset_type、generation_slot、theme_id、テーマ仕様、最終プロンプト全文、参照画像、参照動画の全メタデータと分析、透過処理、dimensions、alpha、sha256、head_anchor、accent metadataを残す。
- PNGとprompt記録を確認してから`index.jsonl`へ既存スキーマの全フィールドを1行JSONで追記する。該当しない値はnull。assetとpromptは保存ルートからの相対パスにする。
- accent成功後、同じtheme_idのbackground、title、accentの存在、sha256、画像内容を確認する。1280x720で3素材を機械的に合成し、`view_image`で色・形・質感の一体感、人物と文字の安全領域、小窓不在を確認する。
- 合格時だけ`theme-kits.json`へ既存テーマを保持して次を原子的に追加する。
- `theme-kits.json`のルート形式は必ず`{"version":1,"updatedAt":"ISO-8601","themes":[...]}`のJSONオブジェクトを維持する。ルートを配列にしてはならない。既存オブジェクトを読み、`manifest["themes"]`配列へテーマオブジェクトを追加または同じidで置換する。
- 書き込み前に元ファイルを同じディレクトリの一時バックアップへコピーする。書き込み後に、ルートがobject、`version===1`、`themes`がarrayであることを再読込して検証する。検証失敗時は即座に元ファイルへ戻して失敗通知する。

```json
{
  "id": "theme_id",
  "name": "theme_name",
  "category": "朝活",
  "concept": "...",
  "palette": ["#..."],
  "shapeLanguage": "...",
  "backgroundAssetPath": "backgrounds/...png",
  "titleAssetPath": "texts/...png",
  "accentAssets": [
    {
      "assetPath": "decorations/...png",
      "role": "prop",
      "placement": { "x": 850, "y": 430, "width": 260 }
    }
  ],
  "createdAt": "ISO-8601"
}
```

- 合成不合格ならテーマを公開せず失敗通知する。途中素材は索引に残るため、同じスロットから再開できる。
- 1runで生成・保存する素材は1点だけ。previewは既存素材の機械合成なので生成点数に含めない。プロジェクトJSONやexport PNGは作らない。
- automation memoryは創作判断や重複回避に使わない。正本は`index.jsonl`、prompt記録、`theme-kits.json`。

## 通知

成功時の最終出力は`DONT_NOTIFY`のみ。失敗時だけ、失敗箇所、保持した成果物、再開点を日本語で簡潔に通知する。
