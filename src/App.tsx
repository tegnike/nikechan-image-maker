import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  ImagePlus,
  Layers3,
  Lock,
  LockOpen,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
} from "lucide-react";
import Konva from "konva";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type { Asset, AssetType, Health, ProjectSummary, StudioLayer, SupportCopyPreset, ThemeAccent, ThemeKit, ThumbnailProject, TitleLayoutPreset } from "./types";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./types";
import {
  analyzeThumbnail,
  applyFinishPreset,
  applySupportCopy,
  applyThumbnailTemplate,
  applyTitleLayout,
  cloneLayer,
  createEmptyProject,
  createId,
  createTitleLayer,
  imageAppearanceDefaults,
  moveItem,
  replaceBackgroundLayer,
  replaceThemeKitLayers,
  remapHeadAnchorToCrop,
  sanitizeProject,
  scaleLayerFromCenter,
} from "./lib";
import type { FinishPreset, ThumbnailTemplate } from "./lib";

type LibraryTab = "characters" | "themes";

const fonts = ["Hiragino Sans", "Hiragino Maru Gothic ProN", "Yu Gothic", "Arial Black", "sans-serif"];

function normalizedScale(value: number) {
  return (value < 0 ? -1 : 1) * Math.max(0.05, Math.abs(value));
}

function useLoadedImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const next = new window.Image();
    next.onload = () => setImage(next);
    next.src = src;
    return () => {
      next.onload = null;
    };
  }, [src]);
  return image;
}

function visibleImageBounds(image: HTMLImageElement) {
  const limit = 768;
  const sampleScale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * sampleScale));
  const height = Math.max(1, Math.round(image.naturalHeight * sampleScale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }
  const inverse = 1 / sampleScale;
  const margin = Math.ceil(4 * inverse);
  const x = Math.max(0, Math.floor(minX * inverse) - margin);
  const y = Math.max(0, Math.floor(minY * inverse) - margin);
  const right = Math.min(image.naturalWidth, Math.ceil((maxX + 1) * inverse) + margin);
  const bottom = Math.min(image.naturalHeight, Math.ceil((maxY + 1) * inverse) + margin);
  return { x, y, width: right - x, height: bottom - y };
}

function titleSplitRatio(image: HTMLImageElement, bounds: { x: number; y: number; width: number; height: number }) {
  const sampleWidth = Math.max(2, Math.min(512, Math.round(bounds.width)));
  const sampleHeight = Math.max(2, Math.min(512, Math.round(bounds.height * sampleWidth / bounds.width)));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0.5;
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const start = Math.floor(sampleWidth * 0.32);
  const end = Math.ceil(sampleWidth * 0.68);
  let bestColumn = Math.floor(sampleWidth / 2);
  let bestScore = Number.POSITIVE_INFINITY;
  for (let x = start; x <= end; x += 1) {
    let opaque = 0;
    for (let y = 0; y < sampleHeight; y += 1) {
      if (pixels[(y * sampleWidth + x) * 4 + 3] > 12) opaque += 1;
    }
    const centerPenalty = Math.abs(x / sampleWidth - 0.5) * sampleHeight * 0.08;
    const score = opaque + centerPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestColumn = x;
    }
  }
  return Math.max(0.32, Math.min(0.68, bestColumn / sampleWidth));
}

const titleLayoutLabels: Record<TitleLayoutPreset, string> = {
  "side-by-side": "人物と左右",
  "split-character": "朝｜人物｜活",
  "diagonal-impact": "斜め大文字",
};

const supportCopyLabels: Record<SupportCopyPreset, string> = {
  none: "補助なし",
  stream: "＋配信",
  casual: "＋するよ！",
  reading: "＋あさかつ",
  english: "＋MORNING STREAM",
};

function ImageNode({
  layer,
  selected,
  onSelect,
  onChange,
}: {
  layer: Extract<StudioLayer, { kind: "image" }>;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<StudioLayer>) => void;
}) {
  const image = useLoadedImage(layer.src);
  const nodeRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const blurRadius = layer.blurRadius || 0;
  const brightness = layer.brightness || 0;
  const saturation = layer.saturation || 0;
  const filters = useMemo(() => {
    const next: Array<(imageData: ImageData) => void> = [];
    if (blurRadius > 0) next.push(Konva.Filters.Blur);
    if (brightness !== 0) next.push(Konva.Filters.Brighten);
    if (saturation !== 0) next.push(Konva.Filters.HSL);
    return next;
  }, [blurRadius, brightness, saturation]);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !image) return;
    node.clearCache();
    if (filters.length || layer.assetType === "decorations") node.cache({ pixelRatio: 1 });
    if (layer.assetType === "decorations") node.drawHitFromCache(12);
    node.getLayer()?.batchDraw();
  }, [brightness, filters, image, layer.assetType, layer.cropHeight, layer.cropWidth, layer.cropX, layer.cropY, saturation]);

  useLayoutEffect(() => {
    if (selected && nodeRef.current && transformerRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.moveToTop();
      transformerRef.current.getLayer()?.batchDraw();
    }
  });

  if (!image || !layer.visible) return null;
  const crop = layer.cropWidth && layer.cropHeight
    ? { x: layer.cropX || 0, y: layer.cropY || 0, width: layer.cropWidth, height: layer.cropHeight }
    : undefined;
  const outlineWidth = layer.assetType === "backgrounds" ? 0 : layer.outlineWidth || 0;
  return (
    <>
      {outlineWidth > 0 ? (
        <KonvaImage
          image={image}
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          crop={crop}
          scaleX={layer.scaleX}
          scaleY={layer.scaleY}
          rotation={layer.rotation}
          opacity={layer.opacity}
          listening={false}
          shadowColor={layer.outlineColor || "#ffffff"}
          shadowBlur={outlineWidth}
          shadowOpacity={1}
          shadowOffsetX={0}
          shadowOffsetY={0}
        />
      ) : null}
      <KonvaImage
        ref={nodeRef}
        id={layer.id}
        image={image}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        crop={crop}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        rotation={layer.rotation}
        opacity={layer.opacity}
        filters={filters}
        blurRadius={blurRadius}
        brightness={brightness}
        saturation={saturation}
        shadowColor={layer.imageShadowColor || "#281f43"}
        shadowBlur={layer.imageShadowBlur || 0}
        shadowOpacity={layer.imageShadowOpacity || 0}
        shadowOffsetX={layer.imageShadowOffsetX || 0}
        shadowOffsetY={layer.imageShadowOffsetY || 0}
        draggable={!layer.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })}
        onTransformEnd={() => {
          const node = nodeRef.current;
          if (!node) return;
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: normalizedScale(node.scaleX()),
            scaleY: normalizedScale(node.scaleY()),
          });
        }}
      />
      {selected && layer.assetType === "characters" && layer.headAnchor ? (
        <Group
          x={layer.x}
          y={layer.y}
          scaleX={layer.scaleX}
          scaleY={layer.scaleY}
          rotation={layer.rotation}
          listening={false}
        >
          <Rect
            x={(layer.headAnchor.centerX - layer.headAnchor.width / 2) * layer.width}
            y={(layer.headAnchor.centerY - layer.headAnchor.height / 2) * layer.height}
            width={layer.headAnchor.width * layer.width}
            height={layer.headAnchor.height * layer.height}
            stroke="#00e5ff"
            strokeWidth={4}
            dash={[12, 8]}
            strokeScaleEnabled={false}
          />
          <Circle
            x={layer.headAnchor.centerX * layer.width}
            y={layer.headAnchor.centerY * layer.height}
            radius={8}
            fill="#ff3eb5"
            stroke="#ffffff"
            strokeWidth={3}
            strokeScaleEnabled={false}
          />
        </Group>
      ) : null}
      {layer.assetType === "backgrounds" && (layer.tintOpacity || 0) > 0 ? (
        <Rect
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          fill={layer.tintColor || "#302454"}
          opacity={(layer.tintOpacity || 0) * layer.opacity}
          listening={false}
        />
      ) : null}
      {selected && !layer.locked ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          flipEnabled
          keepRatio
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          borderStroke="#6e5bff"
          anchorStroke="#6e5bff"
          anchorFill="#ffffff"
          anchorSize={22}
          anchorCornerRadius={5}
          padding={5}
          boundBoxFunc={(oldBox, newBox) =>
            Math.abs(newBox.width) < 24 || Math.abs(newBox.height) < 24 ? oldBox : newBox
          }
        />
      ) : null}
    </>
  );
}

function TextNode({
  layer,
  selected,
  onSelect,
  onChange,
}: {
  layer: Extract<StudioLayer, { kind: "text" }>;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<StudioLayer>) => void;
}) {
  const nodeRef = useRef<Konva.Text>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useLayoutEffect(() => {
    if (selected && nodeRef.current && transformerRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.moveToTop();
      transformerRef.current.getLayer()?.batchDraw();
    }
  });

  if (!layer.visible) return null;
  return (
    <>
      <Text
        ref={nodeRef}
        id={layer.id}
        text={layer.text}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        rotation={layer.rotation}
        opacity={layer.opacity}
        draggable={!layer.locked}
        fontFamily={layer.fontFamily}
        fontSize={layer.fontSize}
        fontStyle={layer.fontStyle}
        align={layer.align}
        verticalAlign="middle"
        fill={layer.fill}
        stroke={layer.stroke}
        strokeWidth={layer.strokeWidth}
        shadowColor={layer.shadowColor}
        shadowBlur={layer.shadowBlur}
        shadowOffsetX={layer.shadowOffsetX}
        shadowOffsetY={layer.shadowOffsetY}
        lineHeight={layer.lineHeight}
        wrap="char"
        lineJoin="round"
        perfectDrawEnabled
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })}
        onTransformEnd={() => {
          const node = nodeRef.current;
          if (!node) return;
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: normalizedScale(node.scaleX()),
            scaleY: normalizedScale(node.scaleY()),
          });
        }}
      />
      {selected && !layer.locked ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          flipEnabled
          keepRatio
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          borderStroke="#6e5bff"
          anchorStroke="#6e5bff"
          anchorFill="#ffffff"
          anchorSize={22}
          anchorCornerRadius={5}
          padding={5}
          boundBoxFunc={(oldBox, newBox) =>
            Math.abs(newBox.width) < 40 || Math.abs(newBox.height) < 24 ? oldBox : newBox
          }
        />
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function App() {
  const [project, setProject] = useState<ThumbnailProject>(() => createEmptyProject());
  const [selectedId, setSelectedId] = useState<string | null>(project.layers.at(-1)?.id || null);
  const [assetType, setAssetType] = useState<LibraryTab>("themes");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [themes, setThemes] = useState<ThemeKit[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState("準備中…");
  const [preview, setPreview] = useState("");
  const [scale, setScale] = useState(0.65);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const stageRef = useRef<Konva.Stage>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ThumbnailProject[]>([]);
  const futureRef = useRef<ThumbnailProject[]>([]);

  const selected = useMemo(
    () => project.layers.find((layer) => layer.id === selectedId) || null,
    [project.layers, selectedId],
  );
  const thumbnailAnalysis = useMemo(() => analyzeThumbnail(project.layers), [project.layers]);

  const refreshAssets = useCallback(async (type: AssetType) => {
    const response = await fetch(`/api/assets?type=${type}`);
    const payload = await response.json();
    setAssets(payload.assets || []);
  }, []);

  const refreshProjects = useCallback(async () => {
    const response = await fetch("/api/projects");
    const payload = await response.json();
    setProjects(payload.projects || []);
  }, []);

  const refreshThemes = useCallback(async () => {
    const response = await fetch("/api/themes");
    const payload = await response.json();
    setThemes(payload.themes || []);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/health").then((response) => response.json()),
      assetType === "themes" ? refreshThemes() : refreshAssets(assetType),
      refreshProjects(),
    ])
      .then(([nextHealth]) => {
        setHealth(nextHealth);
        setStatus(nextHealth.writable ? "T7素材ライブラリに接続しました" : "素材ライブラリを確認してください");
      })
      .catch(() => setStatus("アプリの接続を確認してください"));
  }, [assetType, refreshAssets, refreshProjects, refreshThemes]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void (assetType === "themes" ? refreshThemes() : refreshAssets(assetType));
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [assetType, refreshAssets, refreshThemes]);

  useEffect(() => {
    const resize = () => {
      const node = workspaceRef.current;
      if (!node) return;
      const availableWidth = Math.max(480, node.clientWidth - 56);
      const availableHeight = Math.max(270, node.clientHeight - 56);
      setScale(Math.min(availableWidth / CANVAS_WIDTH, availableHeight / CANVAS_HEIGHT, 1));
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, []);

  const snapshot = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return "";
    const transformerNodes = stage.find("Transformer");
    transformerNodes.forEach((node) => node.hide());
    stage.draw();
    const url = stage.toDataURL({ pixelRatio: 0.25, mimeType: "image/png" });
    transformerNodes.forEach((node) => node.show());
    stage.draw();
    return url;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreview(snapshot()), 180);
    return () => window.clearTimeout(timer);
  }, [project, snapshot]);

  const commitProject = useCallback(
    (updater: ThumbnailProject | ((current: ThumbnailProject) => ThumbnailProject)) => {
      setProject((current) => {
        historyRef.current = [...historyRef.current.slice(-49), structuredClone(current)];
        futureRef.current = [];
        const next = typeof updater === "function" ? updater(current) : updater;
        return { ...next, updatedAt: new Date().toISOString() };
      });
    },
    [],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<StudioLayer>) => {
      commitProject((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === id ? ({ ...layer, ...patch } as StudioLayer) : layer,
        ),
      }));
    },
    [commitProject],
  );

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(structuredClone(project));
    setProject(previous);
    setSelectedId(null);
  }, [project]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(structuredClone(project));
    setProject(next);
    setSelectedId(null);
  }, [project]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commitProject((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== selectedId),
    }));
    setSelectedId(null);
  }, [commitProject, selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const copy = cloneLayer(selected);
    commitProject((current) => ({ ...current, layers: [...current.layers, copy] }));
    setSelectedId(copy.id);
  }, [commitProject, selected]);

  const resizeWithWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      const hoveredId = event.target.id();
      const target = project.layers.find((layer) => layer.id === hoveredId)
        || project.layers.find((layer) => layer.id === selectedId);
      if (!target || target.locked || !target.visible || event.evt.deltaY === 0) return;

      event.evt.preventDefault();
      event.cancelBubble = true;
      const limitedDelta = Math.min(40, Math.abs(event.evt.deltaY));
      const factor = Math.exp((event.evt.deltaY < 0 ? 1 : -1) * limitedDelta * 0.0025);
      const scaled = scaleLayerFromCenter(target, factor);
      setSelectedId(target.id);
      updateLayer(target.id, scaled);
    },
    [project.layers, selectedId, updateLayer],
  );

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
      if (selected && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const patch: Partial<StudioLayer> = {};
        if (event.key === "ArrowLeft") patch.x = selected.x - amount;
        if (event.key === "ArrowRight") patch.x = selected.x + amount;
        if (event.key === "ArrowUp") patch.y = selected.y - amount;
        if (event.key === "ArrowDown") patch.y = selected.y + amount;
        updateLayer(selected.id, patch);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [deleteSelected, redo, selected, selectedId, undo, updateLayer]);

  const buildAssetLayer = (asset: Asset) => new Promise<StudioLayer>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const isBackground = asset.type === "backgrounds";
      const bounds = isBackground
        ? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }
        : visibleImageBounds(image);
      const targetWidth = asset.type === "texts" ? 760 : asset.type === "decorations" ? 500 : 650;
      const targetHeight = asset.type === "texts" ? 430 : asset.type === "decorations" ? 460 : 820;
      const fit = isBackground
        ? Math.max(CANVAS_WIDTH / image.naturalWidth, CANVAS_HEIGHT / image.naturalHeight)
        : Math.min(targetWidth / bounds.width, targetHeight / bounds.height, 1.8);
      const visualWidth = bounds.width * fit;
      const visualHeight = bounds.height * fit;
      const x = isBackground
        ? (CANVAS_WIDTH - image.naturalWidth * fit) / 2
        : asset.type === "texts"
          ? 42
          : asset.type === "characters"
            ? CANVAS_WIDTH - visualWidth + 40
            : (CANVAS_WIDTH - visualWidth) / 2;
      const y = isBackground
        ? (CANVAS_HEIGHT - image.naturalHeight * fit) / 2
        : asset.type === "texts"
          ? 58
          : asset.type === "characters"
            ? CANVAS_HEIGHT - visualHeight + 35
            : (CANVAS_HEIGHT - visualHeight) / 2;
      resolve({
        ...imageAppearanceDefaults(asset.type),
        id: createId("image"),
        kind: "image",
        name: asset.name,
        src: asset.url,
        assetPath: asset.assetPath,
        themeId: asset.themeId,
        assetType: asset.type,
        headAnchor: asset.headAnchor
          ? remapHeadAnchorToCrop(asset.headAnchor, image.naturalWidth, image.naturalHeight, bounds)
          : undefined,
        titleSplitRatio: asset.type === "texts" ? titleSplitRatio(image, bounds) : undefined,
        x,
        y,
        width: bounds.width,
        height: bounds.height,
        cropX: isBackground ? undefined : bounds.x,
        cropY: isBackground ? undefined : bounds.y,
        cropWidth: isBackground ? undefined : bounds.width,
        cropHeight: isBackground ? undefined : bounds.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        scaleX: fit,
        scaleY: fit,
      });
    };
    image.onerror = () => reject(new Error(`素材を読み込めません: ${asset.name}`));
    image.src = asset.url;
  });

  const addAsset = async (asset: Asset) => {
    try {
      const layer = await buildAssetLayer(asset);
      commitProject((current) => ({
        ...current,
        layers: asset.type === "backgrounds" ? replaceBackgroundLayer(current.layers, layer) : [...current.layers, layer],
      }));
      setSelectedId(layer.id);
      setStatus(`${asset.name} を追加しました`);
    } catch {
      setStatus(`${asset.name} を読み込めませんでした`);
    }
  };

  const addTheme = async (theme: ThemeKit) => {
    setStatus(`${theme.name} を組み立てています…`);
    try {
      const themeAccents = theme.accents || [];
      const [backgroundLayer, titleLayer, accentLayers] = await Promise.all([
        buildAssetLayer(theme.background),
        buildAssetLayer(theme.title),
        Promise.all(themeAccents.map(async (accent: ThemeAccent) => {
          const layer = await buildAssetLayer(accent.asset);
          if (layer.kind !== "image") return layer;
          const scale = accent.placement.width / layer.width;
          return {
            ...layer,
            name: `${accent.role === "prop" ? "テーマ小物" : "部分フレーム"} · ${layer.name}`,
            themeRole: accent.role,
            x: accent.placement.x,
            y: accent.placement.y,
            scaleX: scale,
            scaleY: scale,
            locked: accent.role === "foreground-accent",
          };
        })),
      ]);
      if (backgroundLayer.kind !== "image" || titleLayer.kind !== "image") throw new Error("Invalid theme assets");
      const background = { ...backgroundLayer, themeRole: "background" as const };
      const title = { ...titleLayer, themeRole: "title" as const, compositionRole: "main-title" as const };
      commitProject((current) => {
        const assembled = replaceThemeKitLayers(current.layers, background, accentLayers, title);
        const templated = applyThumbnailTemplate(assembled, "character-right");
        const laidOut = applyTitleLayout(templated, theme.titleLayout || "side-by-side");
        return { ...current, layers: applySupportCopy(laidOut, theme.supportCopy || "none", theme.palette) };
      });
      setSelectedId(theme.titleLayout === "split-character" ? null : title.id);
      const accentLabel = accentLayers.length ? `・アクセント${accentLayers.length}点` : "";
      setStatus(`${theme.name} を背景・文字${accentLabel}セットで追加しました`);
    } catch {
      setStatus(`${theme.name} を読み込めませんでした`);
    }
  };

  const addText = () => {
    const layer = createTitleLayer();
    layer.name = project.layers.some((item) => item.kind === "text") ? "テキスト" : "メインタイトル";
    layer.text = project.layers.some((item) => item.kind === "text") ? "新しい文字" : "朝活";
    layer.y = 160 + project.layers.filter((item) => item.kind === "text").length * 50;
    commitProject((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelectedId(layer.id);
  };

  const applyPreset = (preset: ThumbnailTemplate) => {
    commitProject((current) => ({
      ...current,
      layers: applyFinishPreset(
        applyTitleLayout(
          applyThumbnailTemplate(applyTitleLayout(current.layers, "side-by-side"), preset),
          "side-by-side",
        ),
        preset === "center-impact" ? "pop-contrast" : "soft-morning",
      ),
    }));
    setSelectedId(null);
    setStatus("配置と仕上げをまとめて適用しました");
  };

  const applyTitleComposition = (preset: TitleLayoutPreset) => {
    commitProject((current) => ({ ...current, layers: applyTitleLayout(current.layers, preset) }));
    setSelectedId(null);
    setStatus(`${titleLayoutLabels[preset]}の主題レイアウトを適用しました`);
  };

  const applySupport = (preset: SupportCopyPreset) => {
    commitProject((current) => {
      const themeId = current.layers.find(
        (layer): layer is Extract<StudioLayer, { kind: "image" }> => (
          layer.kind === "image" && layer.compositionRole === "main-title"
        ),
      )?.themeId;
      const palette = themes.find((theme) => theme.id === themeId)?.palette || [];
      return { ...current, layers: applySupportCopy(current.layers, preset, palette) };
    });
    setSelectedId(null);
    setStatus(`${supportCopyLabels[preset]}を適用しました`);
  };

  const applyFinish = (preset: FinishPreset) => {
    commitProject((current) => ({ ...current, layers: applyFinishPreset(current.layers, preset) }));
    setStatus(preset === "soft-morning" ? "やわらか朝活仕上げを適用しました" : "くっきりポップ仕上げを適用しました");
  };

  const trimSelectedImage = () => {
    if (!selected || selected.kind !== "image" || selected.assetType === "backgrounds") return;
    if (selected.cropWidth && selected.cropHeight) {
      setStatus("この素材は既に透明余白を除去しています");
      return;
    }
    const image = new window.Image();
    image.onload = () => {
      const bounds = visibleImageBounds(image);
      const radians = (selected.rotation * Math.PI) / 180;
      const offsetX = bounds.x * selected.scaleX;
      const offsetY = bounds.y * selected.scaleY;
      updateLayer(selected.id, {
        x: selected.x + Math.cos(radians) * offsetX - Math.sin(radians) * offsetY,
        y: selected.y + Math.sin(radians) * offsetX + Math.cos(radians) * offsetY,
        width: bounds.width,
        height: bounds.height,
        cropX: bounds.x,
        cropY: bounds.y,
        cropWidth: bounds.width,
        cropHeight: bounds.height,
        headAnchor: selected.headAnchor
          ? remapHeadAnchorToCrop(selected.headAnchor, image.naturalWidth, image.naturalHeight, bounds)
          : undefined,
      });
      setStatus("透明余白を除去しました");
    };
    image.src = selected.src;
  };

  const uploadAssets = async (files: FileList | null) => {
    if (!files?.length) return;
    if (assetType === "themes") {
      setStatus("テーマは背景・文字のセットとして登録します");
      return;
    }
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    setStatus("素材を追加しています…");
    const response = await fetch(`/api/assets/${assetType}`, { method: "POST", body: form });
    if (!response.ok) {
      setStatus("素材を追加できませんでした");
      return;
    }
    await refreshAssets(assetType);
    setStatus(`${files.length}点を素材ライブラリへ追加しました`);
  };

  const saveCurrentProject = async () => {
    setStatus("プロジェクトを保存しています…");
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: sanitizeProject(project) }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "保存できませんでした");
      return;
    }
    setProject(sanitizeProject(payload.project));
    await refreshProjects();
    setStatus("プロジェクトを保存しました");
  };

  const loadSavedProject = async (id: string) => {
    if (!id) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    const payload = await response.json();
    if (!response.ok) {
      setStatus("プロジェクトを開けませんでした");
      return;
    }
    historyRef.current = [];
    futureRef.current = [];
    setProject(payload.project);
    setSelectedId(null);
    setStatus(`${payload.project.name} を開きました`);
  };

  const exportPng = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setStatus("1280×720 PNGを書き出しています…");
    setSelectedId(null);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    const transformerNodes = stage.find("Transformer");
    transformerNodes.forEach((node) => node.hide());
    stage.draw();
    const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
    transformerNodes.forEach((node) => node.show());
    stage.draw();
    const response = await fetch("/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, projectName: project.name, dataUrl }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "書き出せませんでした");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${project.name || "thumbnail"}.png`;
    anchor.click();
    setStatus(`保存しました · ${payload.savedTo}`);
  };

  const newProject = () => {
    const next = createEmptyProject();
    historyRef.current = [];
    futureRef.current = [];
    setProject(next);
    setSelectedId(next.layers[0]?.id || null);
    setStatus("新しいサムネイルを作成しました");
  };

  const reorderSelected = (direction: 1 | -1) => {
    if (!selectedId) return;
    commitProject((current) => {
      const index = current.layers.findIndex((layer) => layer.id === selectedId);
      const target = Math.min(current.layers.length - 1, Math.max(0, index + direction));
      return index === target ? current : { ...current, layers: moveItem(current.layers, index, target) };
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <div>
            <strong>Thumbnail Studio</strong>
            <span>AIニケちゃん</span>
          </div>
        </div>
        <div className="project-title-wrap">
          <input
            className="project-title"
            aria-label="プロジェクト名"
            value={project.name}
            onChange={(event) => setProject((current) => ({ ...current, name: event.target.value }))}
          />
          <span>1280 × 720</span>
        </div>
        <div className="top-actions">
          <button className="icon-button" title="元に戻す" onClick={undo}><Undo2 size={18} /></button>
          <button className="icon-button" title="やり直す" onClick={redo}><Redo2 size={18} /></button>
          <button className="secondary-button" onClick={newProject}><Plus size={17} />新規</button>
          <button className="secondary-button" onClick={saveCurrentProject}><Save size={17} />保存</button>
          <button className="primary-button" onClick={exportPng}><Download size={17} />PNG書き出し</button>
        </div>
      </header>

      <main className="studio-grid">
        <aside className="asset-panel panel">
          <div className="panel-heading">
            <div><span className="eyebrow">ASSET LIBRARY</span><h2>素材</h2></div>
            {assetType !== "themes" ? (
              <label className="icon-button upload-button" title="素材を追加">
                <Upload size={17} />
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => uploadAssets(event.target.files)} />
              </label>
            ) : null}
          </div>
          <div className="asset-tabs" role="tablist">
            <button className={assetType === "themes" ? "active" : ""} onClick={() => setAssetType("themes")}>テーマ</button>
            <button className={assetType === "characters" ? "active" : ""} onClick={() => setAssetType("characters")}>キャラクター</button>
          </div>
          <div className="asset-tip">
            {assetType === "themes" && "同じ世界観の背景・「朝活」文字・角または上下の部分フレームをセットで追加します。"}
            {assetType === "characters" && "透過PNGを推奨。クリックするとキャンバスへ追加します。"}
          </div>
          {assetType === "themes" ? (
            <div className="theme-grid">
              {themes.map((theme) => (
                <button key={theme.id} className="theme-card" onClick={() => addTheme(theme)} title={`${theme.name}をセットで追加`}>
                  <div className="theme-preview">
                    <img className="theme-background" src={theme.background.url} alt="" />
                    {(theme.accents || []).map((accent) => (
                      <img
                        key={accent.asset.id}
                        className="theme-accent"
                        src={accent.asset.url}
                        alt=""
                        style={{
                          left: `${accent.placement.x / CANVAS_WIDTH * 100}%`,
                          top: `${accent.placement.y / CANVAS_HEIGHT * 100}%`,
                          width: `${accent.placement.width / CANVAS_WIDTH * 100}%`,
                        }}
                      />
                    ))}
                    <img className="theme-title" src={theme.title.url} alt="" />
                  </div>
                  <div className="theme-info">
                    <strong>{theme.name}</strong>
                    <span>{theme.category} · 背景＋文字{(theme.accents || []).some((accent) => accent.role === "foreground-accent")
                      ? `＋部分フレーム${theme.accents.filter((accent) => accent.role === "foreground-accent").length}`
                      : (theme.accents || []).length ? `＋小物${theme.accents.length}` : ""}</span>
                    {theme.titleLayout || theme.supportCopy ? (
                      <span>{titleLayoutLabels[theme.titleLayout || "side-by-side"]} · {supportCopyLabels[theme.supportCopy || "none"]}</span>
                    ) : null}
                    <div className="theme-palette">{theme.palette.map((color) => <i key={color} style={{ background: color }} />)}</div>
                  </div>
                </button>
              ))}
              {!themes.length ? <div className="empty-assets"><Sparkles size={28} /><p>テーマを準備中です</p></div> : null}
            </div>
          ) : (
            <div className="asset-grid">
              {assets.map((asset) => (
                <button key={asset.id} className="asset-card" onClick={() => addAsset(asset)} title={`${asset.name}を追加`}>
                  <div className="asset-thumb checker">
                    <img src={asset.url} alt="" />
                  </div>
                  <span>{asset.name}</span>
                  {asset.source === "reference" ? <em>公式資料</em> : null}
                </button>
              ))}
              {!assets.length ? (
                <div className="empty-assets"><ImagePlus size={28} /><p>まだ素材がありません</p><span>上の追加ボタンから登録できます</span></div>
              ) : null}
            </div>
          )}
        </aside>

        <section className="workspace" ref={workspaceRef}>
          <div className="workspace-toolbar">
            <div className="preset-group">
              <span>完成テンプレート</span>
              <button onClick={() => applyPreset("character-right")}>文字左・人物右</button>
              <button onClick={() => applyPreset("character-left")}>人物左・文字右</button>
              <button onClick={() => applyPreset("center-impact")}>顔寄せインパクト</button>
            </div>
            <div className="preset-group finish-group">
              <span>主題</span>
              <button onClick={() => applyTitleComposition("split-character")}>朝｜人物｜活</button>
              <button onClick={() => applyTitleComposition("diagonal-impact")}>斜め大文字</button>
            </div>
            <div className="preset-group finish-group">
              <span>補助</span>
              <button onClick={() => applySupport("stream")}>＋配信</button>
              <button onClick={() => applySupport("casual")}>＋するよ！</button>
              <button onClick={() => applySupport("reading")}>＋あさかつ</button>
              <button onClick={() => applySupport("english")}>＋英字</button>
              <button onClick={() => applySupport("none")}>なし</button>
            </div>
            <div className="preset-group finish-group">
              <span>仕上げ</span>
              <button onClick={() => applyFinish("soft-morning")}>やわらか</button>
              <button onClick={() => applyFinish("pop-contrast")}>くっきり</button>
            </div>
            <div className="toolbar-end">
              <label className="safe-toggle">
                <input type="checkbox" checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)} />
                セーフエリア
              </label>
              <button className="add-text-button" onClick={addText}><Type size={16} />文字を追加</button>
            </div>
          </div>
          <div className="canvas-viewport">
            <div
              className="canvas-scale-wrap"
              style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}
            >
              <div className="canvas-stage" style={{ transform: `scale(${scale})` }}>
                <Stage
                  ref={stageRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onWheel={resizeWithWheel}
                  onMouseDown={(event) => event.target === event.target.getStage() && setSelectedId(null)}
                  onTouchStart={(event) => event.target === event.target.getStage() && setSelectedId(null)}
                >
                  <Layer>
                    <Rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={project.backgroundColor} listening={false} />
                    {project.layers.map((layer) =>
                      layer.kind === "image" ? (
                        <ImageNode
                          key={layer.id}
                          layer={layer}
                          selected={selectedId === layer.id}
                          onSelect={() => setSelectedId(layer.id)}
                          onChange={(patch) => updateLayer(layer.id, patch)}
                        />
                      ) : (
                        <TextNode
                          key={layer.id}
                          layer={layer}
                          selected={selectedId === layer.id}
                          onSelect={() => setSelectedId(layer.id)}
                          onChange={(patch) => updateLayer(layer.id, patch)}
                        />
                      ),
                    )}
                  </Layer>
                </Stage>
                {showSafeArea ? <div className="safe-area-overlay"><span>セーフエリア</span></div> : null}
              </div>
            </div>
          </div>
          <div className="statusbar">
            <span className={health?.writable ? "health-dot online" : "health-dot"} />
            <span className="status-text">{status}</span>
            <span className="canvas-help">要素を選択 → ホイール / 四隅ドラッグで拡大縮小</span>
            <span className="zoom">{Math.round(scale * 100)}%</span>
          </div>
        </section>

        <aside className="inspector-panel panel">
          <section className="preview-section">
            <div className="section-title"><span>縮小プレビュー</span><small>320 × 180</small></div>
            <div className="mini-preview">{preview ? <img src={preview} alt="サムネイル縮小プレビュー" /> : null}</div>
            <div className="analysis-summary">
              <span>構成チェック</span>
              <strong>{thumbnailAnalysis.passed} / {thumbnailAnalysis.total}</strong>
            </div>
            <div className="analysis-checks">
              {thumbnailAnalysis.checks.map((check) => (
                <span key={check.label} className={check.ok ? "passed" : "missing"}>{check.ok ? "✓" : "–"} {check.label}</span>
              ))}
            </div>
            <p>未達項目は完成テンプレートまたは仕上げボタンで整えられます。</p>
          </section>

          <section className="projects-section">
            <div className="section-title"><span>保存済み</span><FolderOpen size={15} /></div>
            <div className="select-wrap">
              <select aria-label="保存済みプロジェクト" value="" onChange={(event) => loadSavedProject(event.target.value)}>
                <option value="">プロジェクトを開く…</option>
                {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <ChevronDown size={15} />
            </div>
          </section>

          <section className="layers-section">
            <div className="section-title"><span>レイヤー</span><Layers3 size={15} /></div>
            <div className="layer-list">
              {[...project.layers].reverse().map((layer) => (
                <button key={layer.id} className={`layer-row ${selectedId === layer.id ? "selected" : ""}`} onClick={() => setSelectedId(layer.id)}>
                  <span className="layer-kind">{layer.kind === "text" ? <Type size={14} /> : <ImagePlus size={14} />}</span>
                  <span className="layer-name">{layer.name}</span>
                  <span className="layer-state">{layer.locked ? <Lock size={12} /> : null}{layer.visible ? null : <EyeOff size={13} />}</span>
                </button>
              ))}
            </div>
            <div className="layer-actions">
              <button title="前面へ" onClick={() => reorderSelected(1)}><ArrowUp size={15} /></button>
              <button title="背面へ" onClick={() => reorderSelected(-1)}><ArrowDown size={15} /></button>
              <button title="複製" onClick={duplicateSelected}><Copy size={15} /></button>
              <button title="削除" onClick={deleteSelected}><Trash2 size={15} /></button>
            </div>
          </section>

          <section className="properties-section">
            <div className="section-title"><span>調整</span><small>{selected ? selected.kind === "text" ? "TEXT" : "IMAGE" : "未選択"}</small></div>
            {!selected ? <div className="empty-properties">キャンバスかレイヤー一覧から<br />編集する要素を選択してください。</div> : (
              <div className="property-grid">
                <Field label="レイヤー名"><input value={selected.name} onChange={(event) => updateLayer(selected.id, { name: event.target.value })} /></Field>
                {selected.locked ? (
                  <button
                    className="unlock-button"
                    onClick={() => {
                      updateLayer(selected.id, { locked: false });
                      setStatus(`${selected.name} のロックを解除しました`);
                    }}
                  >
                    <LockOpen size={15} />ロック解除して編集
                  </button>
                ) : null}
                {selected.kind === "text" ? (
                  <>
                    <Field label="表示文字"><textarea rows={2} value={selected.text} onChange={(event) => updateLayer(selected.id, { text: event.target.value })} /></Field>
                    <Field label="フォント"><select value={selected.fontFamily} onChange={(event) => updateLayer(selected.id, { fontFamily: event.target.value })}>{fonts.map((font) => <option key={font}>{font}</option>)}</select></Field>
                    <div className="two-fields">
                      <Field label="文字サイズ"><input type="number" min="8" max="360" value={selected.fontSize} onChange={(event) => updateLayer(selected.id, { fontSize: Number(event.target.value) })} /></Field>
                      <Field label="太さ"><select value={selected.fontStyle} onChange={(event) => updateLayer(selected.id, { fontStyle: event.target.value as "normal" | "bold" })}><option value="bold">太字</option><option value="normal">標準</option></select></Field>
                    </div>
                    <div className="color-fields">
                      <Field label="文字色"><input type="color" value={selected.fill} onChange={(event) => updateLayer(selected.id, { fill: event.target.value })} /></Field>
                      <Field label="縁色"><input type="color" value={selected.stroke} onChange={(event) => updateLayer(selected.id, { stroke: event.target.value })} /></Field>
                      <Field label="影色"><input type="color" value={selected.shadowColor} onChange={(event) => updateLayer(selected.id, { shadowColor: event.target.value })} /></Field>
                    </div>
                    <div className="two-fields">
                      <Field label="縁の太さ"><input type="range" min="0" max="32" value={selected.strokeWidth} onChange={(event) => updateLayer(selected.id, { strokeWidth: Number(event.target.value) })} /></Field>
                      <Field label="影の距離"><input type="range" min="0" max="36" value={selected.shadowOffsetX} onChange={(event) => updateLayer(selected.id, { shadowOffsetX: Number(event.target.value), shadowOffsetY: Number(event.target.value) })} /></Field>
                    </div>
                    <Field label="文字揃え"><div className="segmented">{(["left", "center", "right"] as const).map((align) => <button key={align} className={selected.align === align ? "active" : ""} onClick={() => updateLayer(selected.id, { align })}>{align === "left" ? "左" : align === "center" ? "中央" : "右"}</button>)}</div></Field>
                  </>
                ) : null}
                {selected.kind === "image" ? (
                  <>
                    {selected.assetType === "characters" ? (
                      <div className="appearance-panel">
                        <span className="subsection-label">頭部アンカー</span>
                        {selected.headAnchor ? (
                          <>
                            <div className="two-fields">
                              <Field label="中心 X %"><input type="number" min="-20" max="120" value={Math.round(selected.headAnchor.centerX * 100)} onChange={(event) => updateLayer(selected.id, { headAnchor: { ...selected.headAnchor!, centerX: Number(event.target.value) / 100, method: "manual" } })} /></Field>
                              <Field label="中心 Y %"><input type="number" min="-20" max="120" value={Math.round(selected.headAnchor.centerY * 100)} onChange={(event) => updateLayer(selected.id, { headAnchor: { ...selected.headAnchor!, centerY: Number(event.target.value) / 100, method: "manual" } })} /></Field>
                            </div>
                            <div className="two-fields">
                              <Field label="頭部幅 %"><input type="number" min="5" max="100" value={Math.round(selected.headAnchor.width * 100)} onChange={(event) => updateLayer(selected.id, { headAnchor: { ...selected.headAnchor!, width: Math.max(0.05, Number(event.target.value) / 100), method: "manual" } })} /></Field>
                              <Field label="頭部高 %"><input type="number" min="5" max="100" value={Math.round(selected.headAnchor.height * 100)} onChange={(event) => updateLayer(selected.id, { headAnchor: { ...selected.headAnchor!, height: Math.max(0.05, Number(event.target.value) / 100), method: "manual" } })} /></Field>
                            </div>
                            <small>水色枠が頭部、ピンク点が配置基準です。完成テンプレートはこの位置と大きさを使います。</small>
                          </>
                        ) : (
                          <button className="trim-button" onClick={() => updateLayer(selected.id, { headAnchor: { centerX: 0.5, centerY: 0.2, width: 0.36, height: 0.28, method: "manual", confidence: 0.5 } })}>頭部位置を手動設定</button>
                        )}
                      </div>
                    ) : null}
                    {selected.assetType === "backgrounds" ? (
                      <div className="appearance-panel">
                        <span className="subsection-label">背景を抑える</span>
                        <Field label={`ぼかし ${Math.round(selected.blurRadius || 0)}`}><input type="range" min="0" max="20" value={selected.blurRadius || 0} onChange={(event) => updateLayer(selected.id, { blurRadius: Number(event.target.value) })} /></Field>
                        <Field label={`明るさ ${Math.round((selected.brightness || 0) * 100)}`}><input type="range" min="-50" max="25" value={Math.round((selected.brightness || 0) * 100)} onChange={(event) => updateLayer(selected.id, { brightness: Number(event.target.value) / 100 })} /></Field>
                        <Field label={`彩度 ${Math.round((selected.saturation || 0) * 100)}`}><input type="range" min="-100" max="50" value={Math.round((selected.saturation || 0) * 100)} onChange={(event) => updateLayer(selected.id, { saturation: Number(event.target.value) / 100 })} /></Field>
                        <div className="two-fields">
                          <Field label="色被せ"><input type="color" value={selected.tintColor || "#302454"} onChange={(event) => updateLayer(selected.id, { tintColor: event.target.value })} /></Field>
                          <Field label={`濃さ ${Math.round((selected.tintOpacity || 0) * 100)}%`}><input type="range" min="0" max="60" value={Math.round((selected.tintOpacity || 0) * 100)} onChange={(event) => updateLayer(selected.id, { tintOpacity: Number(event.target.value) / 100 })} /></Field>
                        </div>
                      </div>
                    ) : (
                      <div className="appearance-panel">
                        <span className="subsection-label">素材を背景から分離</span>
                        <div className="two-fields">
                          <Field label="輪郭色"><input type="color" value={selected.outlineColor || "#ffffff"} onChange={(event) => updateLayer(selected.id, { outlineColor: event.target.value })} /></Field>
                          <Field label={`輪郭 ${Math.round(selected.outlineWidth || 0)}`}><input type="range" min="0" max="28" value={selected.outlineWidth || 0} onChange={(event) => updateLayer(selected.id, { outlineWidth: Number(event.target.value) })} /></Field>
                        </div>
                        <div className="two-fields">
                          <Field label="影色"><input type="color" value={selected.imageShadowColor || "#281f43"} onChange={(event) => updateLayer(selected.id, { imageShadowColor: event.target.value })} /></Field>
                          <Field label={`影の濃さ ${Math.round((selected.imageShadowOpacity || 0) * 100)}%`}><input type="range" min="0" max="100" value={Math.round((selected.imageShadowOpacity || 0) * 100)} onChange={(event) => updateLayer(selected.id, { imageShadowOpacity: Number(event.target.value) / 100 })} /></Field>
                        </div>
                        <div className="two-fields">
                          <Field label={`影ぼかし ${Math.round(selected.imageShadowBlur || 0)}`}><input type="range" min="0" max="40" value={selected.imageShadowBlur || 0} onChange={(event) => updateLayer(selected.id, { imageShadowBlur: Number(event.target.value) })} /></Field>
                          <Field label={`影の距離 ${Math.round(selected.imageShadowOffsetX || 0)}`}><input type="range" min="0" max="32" value={selected.imageShadowOffsetX || 0} onChange={(event) => updateLayer(selected.id, { imageShadowOffsetX: Number(event.target.value), imageShadowOffsetY: Number(event.target.value) })} /></Field>
                        </div>
                        <button className="trim-button" onClick={trimSelectedImage}>透明余白を除去</button>
                      </div>
                    )}
                  </>
                ) : null}
                <div className="two-fields">
                  <Field label="X"><input aria-label="X" type="number" value={Math.round(selected.x)} onChange={(event) => updateLayer(selected.id, { x: Number(event.target.value) })} /></Field>
                  <Field label="Y"><input aria-label="Y" type="number" value={Math.round(selected.y)} onChange={(event) => updateLayer(selected.id, { y: Number(event.target.value) })} /></Field>
                </div>
                <div className="two-fields">
                  <Field label="横サイズ %"><input aria-label="横サイズ %" type="number" min="5" max="500" value={Math.round(Math.abs(selected.scaleX) * 100)} onChange={(event) => updateLayer(selected.id, { scaleX: (selected.scaleX < 0 ? -1 : 1) * Math.max(0.05, Number(event.target.value) / 100) })} /></Field>
                  <Field label="縦サイズ %"><input aria-label="縦サイズ %" type="number" min="5" max="500" value={Math.round(Math.abs(selected.scaleY) * 100)} onChange={(event) => updateLayer(selected.id, { scaleY: (selected.scaleY < 0 ? -1 : 1) * Math.max(0.05, Number(event.target.value) / 100) })} /></Field>
                </div>
                <div className="two-fields">
                  <Field label="回転"><input aria-label="回転" type="number" value={Math.round(selected.rotation)} onChange={(event) => updateLayer(selected.id, { rotation: Number(event.target.value) })} /></Field>
                  <Field label="不透明度"><input aria-label="不透明度" type="number" min="0" max="100" value={Math.round(selected.opacity * 100)} onChange={(event) => updateLayer(selected.id, { opacity: Number(event.target.value) / 100 })} /></Field>
                </div>
                <div className="visibility-actions">
                  <button onClick={() => updateLayer(selected.id, { visible: !selected.visible })}>{selected.visible ? <Eye size={15} /> : <EyeOff size={15} />}{selected.visible ? "表示中" : "非表示"}</button>
                  <button onClick={() => updateLayer(selected.id, { locked: !selected.locked })}>{selected.locked ? <LockOpen size={15} /> : <Lock size={15} />}{selected.locked ? "ロック解除" : "ロックする"}</button>
                  <button onClick={() => updateLayer(selected.id, { scaleX: -selected.scaleX })}>左右反転</button>
                  <button onClick={() => updateLayer(selected.id, { scaleY: -selected.scaleY })}>上下反転</button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
