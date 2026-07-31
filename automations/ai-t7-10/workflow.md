# AIニケちゃん サムネイルテーマ生成ワークフロー

この文書を最後まで読み、1回の起動につき以下の生成スロットを1つだけ実行する。

## 実行時に解決するパス

- 作業場所: automationに設定されたcwd。`git rev-parse --show-toplevel`でリポジトリルートを確認する。
- 参照画像A: `references/nikechan-model-sheet.png`
- 参照画像B: `references/nikechan-model-sheet-piercing.png`
- 参照画像C: `references/nikechan-model-sheet-outer-piercing.png`
- 保存ルート: 環境変数`THUMBNAIL_LIBRARY_ROOT`で指定された絶対パス。未exportならGit管理外の`.env`から同名設定を読む。
- 素材: `assets/{characters,backgrounds,texts,decorations}/YYYY/MM/DD/`
- プロンプト記録: `prompts/YYYY/MM/DD/`
- 索引: `index.jsonl`
- 完成テーマ正本: `theme-kits.json`
- 頭部アンカー正本: `head-anchors.json`
- 透過処理: 現在読み込んだimagegenスキルに付属する`remove_chroma_key.py`
- 旧完成画像: `LEGACY_IMAGE_ROOT`が設定されている場合だけ読み取り専用で参照する
- 実例サムネイル参照: `references/vtuber-thumbnails/YYYY/MM/DD/`

## 実行前と生成回数

1. `THUMBNAIL_LIBRARY_ROOT`が設定された絶対パスで、保存ルートと必要な参照画像が利用できることを確認する。外付けボリューム上なら実際にマウントされていることも確認する。不足時は別の場所へ代替保存せず失敗終了する。
2. Codex標準imagegenスキルを完全に読み、内蔵`image_gen`を使う。1runにつき呼び出しは1回だけ。生成失敗時は再生成せず失敗終了する。
3. `index.jsonl`のうち、下記13スロットのいずれかを持つ最終行から次のスロットを循環する。現行外の旧title、title-asa、title-katsu、support系スロットは履歴としては保持するが、現在位置判定から除外する。

`theme-a-background → theme-a-title-primary → theme-a-title-secondary → theme-a-accent → theme-b-background → theme-b-title-primary → theme-b-title-secondary → theme-b-accent → character-1 → theme-c-background → theme-c-title-primary → theme-c-title-secondary → theme-c-accent → theme-a-background`

新スロットがなければ`theme-a-background`から始める。13runで、背景・生成文字2点・部分フレームからなるテーマ3セットとキャラクター1点を作る。旧形式の最終成功行が`theme-*-accent`または`character-1`なら、対応する次グループへ進める。旧形式のテーマが途中なら、同じtheme_idのbackgroundを引き継いで`title-primary`から作り直し、旧途中素材はテーマへ混ぜない。
4. 途中runが失敗したら索引へ成功行を追記せず、次runで同じスロットを再開する。対応する前工程が索引にない場合、新しいテーマを捏造せず失敗終了する。

## 1テーマで生成する文字は最大2点

各background runで、実例の余白対策に基づいて`title_layout`を一つだけ選ぶ。候補を全部作らず、採用構成に必要な文字だけを2点生成する。

- `split-character`: `title-primary`で正確な一文字「朝」、`title-secondary`で正確な一文字「活」を別々に生成する。結合版「朝活」は作らない。
- `side-by-side`: `title-primary`で正確な二文字「朝活」、`title-secondary`で選択した補助文字1点を生成する。
- `diagonal-pair`: `title-primary`で正確な二文字「朝活」を一つの透過ロゴとして生成する。ただし横並びにはせず、同じ画像内で「朝」を左上、「活」を右下へ段違いに組む。`title-secondary`では選択した補助文字1点を生成する。

旧テーマにある`diagonal-impact`は、横並びの結合タイトルをアプリで回転する互換用レイアウトである。新しいテーマでは選択・生成せず、必ず`diagonal-pair`を使う。

補助文字は`配信`、`するよ！`、`あさかつ`、`MORNING STREAM`から実例に最も合う一つだけを選ぶ。OSフォント、Webフォント、Canvas文字、SVG文字で代用しない。結合版「朝活」を切断、クロップ、マスクして「朝」「活」を作ることは絶対に禁止する。

背景と部分フレームは構造素材であり、この文字2点とは別に生成する。任意小物は生成しない。

## テーマは一つのデザイン案件

同じグループの4runは同じ`theme_id`、テーマ仕様、実生成画像を引き継ぐ。

- `background`: Europe/Warsaw日時と英数字slugで新しい`theme_id`を作り、テーマの基準デザインとなる背景を生成する。
- `title-primary`: 実背景PNGを参照し、採用構成の主文字を透過PNGとして生成する。
- `title-secondary`: 実背景PNGと実primary PNGを参照し、採用構成の二つ目の文字を独立した透過PNGとして生成する。
- `accent`: 実背景PNGと実primary/secondary PNGを参照し、同じ世界観の透過部分フレーム1点を生成する。成功後に4素材の存在と合成を検査し、テーマを公開する。

## 実在VTuberサムネイルの参照

自由創作だけでテーマを決めない。各background runでは、画像生成前に実在するVTuberの公開YouTube配信サムネイルを必ず1枚選び、その実画像を`image_gen`の参照画像として使う。

1. `yt-dlp`のYouTube検索を使い、`VTuber 朝活 雑談`、`VTuber 朝活 配信`、`VTuber 雑談 配信`などから候補を8件程度取得する。
2. Shorts、切り抜き、MV、歌ってみた、実写主体、ゲーム画面主体は除外する。VTuber本人の配信待機枠または配信アーカイブを優先する。
3. 候補を最大3枚だけ一時取得して`view_image`で比較する。背景が比較的シンプル、人物が大きい、主要文字が大きい、小物が少ない16:9画像を優先する。
4. 直近12件のbackground行と同じ動画は再利用しない。同一チャンネルは直近3テーマにあれば避ける。
5. 選んだ1枚を`references/vtuber-thumbnails/YYYY/MM/DD/{video_id}.jpg`へ保存し、同名source JSONへURL、チャンネル、タイトル、取得日時を保存する。
6. 人物と顔の位置、主文字の占有率、二文字タイトルの余白対策、背景密度、色の役割、部分フレームを分析する。
7. `reference_layout`, `reference_density`, `reference_palette_roles`, `reference_frame_grammar`を保存し、構図上重要な2〜3要素を新テーマへ継承する。
8. 元画像のキャラクター、可読文字、ロゴ、固有マークはコピーしない。レイアウト文法と情報密度だけをAIニケちゃん向けに変換する。
9. 実例がシンプルなら、実例にないパネル、窓、細密装飾を追加しない。
10. 有効な実例を取得・保存できない場合、そのbackgroundは生成せず失敗終了する。

## テーマ仕様

background行のprompt記録と索引へ次を必ず保存し、後続3runへ一字一句引き継ぐ。

- `theme_id`, `theme_name`, `category="朝活"`, `mood`
- `palette`: 正確なHEXを4〜5色
- `contrast_anchor`, `shape_language`, `texture_language`, `title_treatment`
- `title_layout`: `side-by-side`、`split-character`、`diagonal-pair`のいずれか
- `primary_text_verbatim`: `split-character`なら`朝`、それ以外は`朝活`
- `secondary_kind`: `title-part-katsu`または`support-copy`
- `secondary_text_verbatim`: `活`、`配信`、`するよ！`、`あさかつ`、`MORNING STREAM`のいずれか
- `split-character`では`secondary_kind="title-part-katsu"`、`secondary_text_verbatim="活"`、`support_copy="none"`とする。`side-by-side`と`diagonal-pair`では`secondary_kind="support-copy"`とし、`support_copy`を`stream`、`casual`、`reading`、`english`から選ぶ。
- `support_copy_zone`, `gap_accent_mode`, `accent_concept`, `composition_zone`, `visual_family`
- 参照動画情報と`reference_layout`, `reference_density`, `reference_palette_roles`, `reference_frame_grammar`

完成テーマ直近6件と比較し、実例との構成類似性を壊さない範囲でmood、palette、shape_language、texture_languageの最低2軸を変える。主題構成は直近テーマから`split-character → diagonal-pair → side-by-side → split-character`の順に進め、同じ構成へ偏らせない。履歴上の`diagonal-impact`は構成順の判定時だけ`diagonal-pair`相当として扱う。補助文字を使う構成では`stream → casual → reading → english → stream`の順を目安にしつつ、参照実例に合わなければ最も近い一つを選ぶ。

## 共通品質

- 「単品素材の美しさ」より「4素材を重ねた一枚を使いたくなること」を優先する。
- 背景はシンプル、人物と文字は大きく、前景は部分フレーム1点だけにする。
- AIニケちゃんの紫髪、青緑Tシャツ、ピンクの上着と調和または意図的に対比する配色にする。
- パステルだけで薄くせず、必ず強いcontrast anchorを置く。
- プレゼン資料、企業Webバナー、汎用壁紙、素材シート、生成AIの細密イラストにしない。
- 太陽、日の出、光線、黄色を朝らしさの既定表現にしない。sun familyが直近8件にあれば禁止する。
- 空の小窓、モニター、UIパネル、picture-in-picture、空のカード、文字待ちの四角を作らない。
- 人物や文字を大きな角丸矩形の中へ収めない。

## background

- 選定した実在VTuberサムネイル1枚だけを構図・密度の参照に使う16:9グラフィック・バックプレートとする。人物、可読文字、ロゴ、小物単体を入れない。
- タイトル領域は色面、余白、穏やかな方向線だけで確保する。文字の代用品に見えるブロック、漢字風シルエット、疑似字形、判読不能なタイポグラフィ、タイトルのダミー形状を絶対に入れない。
- Olive Arrow Noteのように、大きな不定形ブロックを文字位置へ並べて「読めない文字」に見せる設計は禁止する。
- 後載せする人物、生成文字、部分フレームの安全領域を持たせる。タイトル素材と競合する巨大な前景形状を背景へ焼き込まない。
- 外周全部を囲う太いフレームは焼き込まない。縁取りは部分的な角・帯・曲線に留める。
- 最終プロンプトに`no readable or pseudo text, no glyph-like blocks, no fake typography, no title placeholder shapes`を明記する。
- さらに`use the reference only for layout grammar, visual density, palette roles, and edge treatment; do not copy its character, text, logo, or channel identity`、`graphic design backplate for a VTuber livestream thumbnail, not a presentation slide, website banner, monitor UI, or picture-in-picture layout`、`no character, no readable text, no empty window or placeholder panel`を含める。

## title-primary / title-secondary

- `title-primary`は仕様の`primary_text_verbatim`だけを正確に生成する。
- `title-secondary`は仕様の`secondary_text_verbatim`だけを正確に生成する。
- `split-character`の「朝」と「活」は別々のimage_gen呼び出しで作る。「活」は実背景と実「朝」を参照し、文字面、筆致、輪郭、影、装飾密度、可視サイズを揃える。
- `diagonal-pair`は一度のimage_gen呼び出しで「朝」と「活」を同じ透過素材内へ生成する。「朝」の可視中心を素材中心より左上、「活」の可視中心を右下へ置き、二文字の外接矩形が左上から右下へ流れる階段状のロゴにする。二文字を普通に横並びにしてはならない。
- `diagonal-pair`は完成した横並び「朝活」を後処理で回転、切断、クロップ、マスクして作らない。また、素材全体や各文字を強く傾けることで斜めに見せない。「斜め」は同じ画像内の二文字の位置関係を指す。
- 補助文字は主題より一段弱くするが、160px幅でも読める太さにする。主題と同じ輪郭・影・質感を使う。
- 生成対象以外の漢字、仮名、英字、数字、ロゴ、アイコンを入れない。1画像につき文字ロゴ1点だけにする。
- 完全に均一な`#00ff00`背景、影・床・反射なし、周囲に適度な余白、ロゴ内に`#00ff00`を使わないと明記する。
- 上下へ大きな飾りを足して透明余白を増やさない。透過後、可視ピクセル外接矩形に対する上下の透明余白は各15%以下にする。
- 指定文字だけが正しく読めることを`view_image`で確認する。欠落、重複、誤字、別字、判読不能、指定外文字があれば採用しない。
- prompt記録と索引へ`text_verbatim`、`title_asset_role="primary"|"secondary"`、必要なら`title_part`または`support_variant`を保存する。

## accent

- 同じtheme_idの実背景PNGと実primary/secondary PNGを参照する。
- 毎回必ず`role="foreground-accent"`の部分フレーム1点とする。`role="prop"`や独立小物は生成しない。
- 1280x720へそのまま重ねる16:9オーバーレイとし、`default_placement={"x":0,"y":0,"width":1280}`とする。
- `corner`なら1〜3か所の角飾りとし、各装飾は画面幅・高さの18%以内にする。`top-bottom`なら上辺と下辺の細い帯・レールとし、各辺の高さは画面高の12%以内にする。左右辺を接続しない。
- `integrated-micro-motifs`の場合だけ、同じoverlay内に1〜3個の小さな非文字モチーフを含めてよい。各モチーフは画面幅・高さの8%以内、合計不透明面積は5%以内とし、独立素材にしない。
- 背景のpalette、shape language、texture languageと一致させる。参照サムネイルの部分フレーム位置と密度を抽象化する。
- 四辺を完全に囲む枠、中央の大きな開口部、空の小窓、文字台座、独立バッジ、小物、可読文字、疑似文字は禁止する。
- 人物の顔と文字の可読域を塞がない。実不透明ピクセルの総面積はキャンバスの25%以下にする。
- 完全に均一な`#00ff00`背景、影・床・反射なし、素材内に`#00ff00`を使わないと明記する。透過後に16:9全体へ重ねて`view_image`し、透明な中央領域と安全域を確認する。
- prompt記録と索引へ`accent_role="foreground-accent"`、`frame_layout="corner"|"top-bottom"`、`accent_motif`、`default_placement={"x":0,"y":0,"width":1280}`を保存する。

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
- 透過後に頭部アンカーを実測し、`head-anchors.json`へ保存する。アンカー未登録のまま索引へ成功行を追加しない。

## 透過と頭部アンカー

- character、primary、secondary、accentは生成元を`tmp/imagegen/`へコピーし、`remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`を1回実行する。
- alpha channel、透明な四隅、欠損なし、緑縁なしを確認する。細い緑縁だけなら`--edge-contract 1`を加えた透過処理だけを1回再実行してよい。
- characterは頭蓋・前髪・側頭部の髪を含む頭部領域を`view_image`で確認し、`centerX`, `centerY`, `width`, `height`を元PNG比率0〜1で記録する。
- `sourceWidth`, `sourceHeight`, `method="manual-reviewed"`, `confidence`も記録する。首、手、長いポニーテールは頭部領域へ含めない。
- `head-anchors.json`は`{"version":1,"updatedAt":"ISO-8601","anchors":{}}`を維持し、既存`anchors`へ追加する。キーは`characters/YYYY/MM/DD/file.png`とし、先頭に`assets/`を含めず、ルート直下へ素材パスを書かない。
- 書き込み前に一時バックアップを作り、書き込み後にルート、version、anchors、追加キーを再読込検証する。失敗時は元へ戻して失敗通知する。

## 保存・索引・テーマ公開

- Europe/Warsaw日時のbasenameでPNGと対応する`.prompt.md`を保存する。
- prompt記録にはasset_type、generation_slot、theme_id、テーマ仕様、最終プロンプト、参照画像、参照動画メタデータ、透過処理、dimensions、alpha、sha256、head_anchor、accent metadataを残す。
- PNGとprompt記録を確認してから`index.jsonl`へ既存スキーマで1行追記する。assetとpromptは保存ルートからの相対パスにする。
- accent成功後、同じtheme_idのbackground、primary、secondary、accentの計4素材について存在、sha256、画像内容を確認する。文字が別々のimage_gen生成物であり、切断・クロップ・マスク由来でないことも確認する。
- 1280x720で採用構成のプレビューを1枚だけ機械合成し`view_image`する。文字2点の統一感、人物安全領域、二文字タイトル上下の空きの解消、背景の疑似文字不在、小窓不在を確認する。
- 合格時だけ`theme-kits.json`へ既存テーマを保持して原子的に追加する。ルートは`{"version":1,"updatedAt":"ISO-8601","themes":[]}`を維持する。
- 書き込み前に同じディレクトリへ一時バックアップを作り、書き込み後にルート、version、themes配列を再読込検証する。失敗時は元へ戻して失敗通知する。
- `split-character`は`titleAssetPath`を省略し、`splitTitleAssetPaths`へ朝・活を登録する。`supportAssetPaths`は省略する。
- `side-by-side`と`diagonal-pair`は`titleAssetPath`へ朝活を登録し、`supportAssetPaths`へ選んだ補助文字1点だけを登録する。`splitTitleAssetPaths`は省略する。

```json
{
  "id": "theme_id",
  "name": "theme_name",
  "category": "朝活",
  "concept": "...",
  "palette": ["#..."],
  "shapeLanguage": "...",
  "titleLayout": "split-character",
  "supportCopy": "none",
  "backgroundAssetPath": "backgrounds/...png",
  "splitTitleAssetPaths": {
    "asa": "texts/...png",
    "katsu": "texts/...png"
  },
  "accentAssets": [{
    "assetPath": "decorations/...png",
    "role": "foreground-accent",
    "placement": { "x": 0, "y": 0, "width": 1280 }
  }],
  "createdAt": "ISO-8601"
}
```

- 合成不合格ならテーマを公開せず失敗通知する。途中素材は索引に残す。
- 1runで生成・保存する素材は1点だけ。previewは機械合成なので生成点数に含めない。プロジェクトJSONやexport PNGは作らない。
- automation memoryは創作判断や重複回避に使わない。正本は`index.jsonl`、prompt記録、`theme-kits.json`。

## 通知

成功時の最終出力は`DONT_NOTIFY`のみ。失敗時だけ、失敗箇所、保持した成果物、再開点を日本語で簡潔に通知する。
