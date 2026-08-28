import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OSS from "ali-oss";

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".ico",
]);

const FOLDER_ID = /^[A-Za-z0-9._-]+$/;

const requiredEnv = [
  "OSS_ACCESS_KEY_ID",
  "OSS_ACCESS_KEY_SECRET",
  "OSS_BUCKET",
  "OSS_REGION",
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`缺少环境变量: ${missing.join(", ")}`);
  process.exit(1);
}

const {
  OSS_ACCESS_KEY_ID: accessKeyId,
  OSS_ACCESS_KEY_SECRET: accessKeySecret,
  OSS_BUCKET: bucket,
  OSS_REGION: region,
} = process.env;

const client = new OSS({
  accessKeyId,
  accessKeySecret,
  bucket,
  region,
});

const isImageObject = (name) => {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXT.has(lower.slice(dot));
};

const buildPublicUrl = (name) =>
  `https://${bucket}.${region}.aliyuncs.com/${encodeURI(name)}`;

const listAll = async (query) => {
  const prefixes = [];
  const objects = [];
  let marker;

  do {
    const result = await client.list({
      ...query,
      "max-keys": 1000,
      marker,
    });
    prefixes.push(...(result.prefixes ?? []));
    objects.push(...(result.objects ?? []));
    marker = result.isTruncated ? result.nextMarker : undefined;
  } while (marker);

  return { prefixes, objects };
};

const toImages = (objects) => {
  const images = [];

  for (const obj of objects) {
    if (!obj.name || obj.name.endsWith("/") || !isImageObject(obj.name))
      continue;
    images.push({
      name: obj.name,
      url: buildPublicUrl(obj.name),
      size: obj.size ?? 0,
    });
  }

  images.sort((a, b) => a.name.localeCompare(b.name));
  return images;
};

const prefixToId = (prefix) => prefix.replace(/\/+$/g, "");

const writeJson = (file, data) =>
  writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");

const { prefixes } = await listAll({ delimiter: "/" });
const folders = [];

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const prefix of prefixes) {
  const id = prefixToId(prefix);
  if (!id || !FOLDER_ID.test(id)) {
    console.warn(`跳过非法文件夹名: ${prefix}`);
    continue;
  }

  const { objects } = await listAll({ prefix });
  const images = toImages(objects);
  const file = `${id}.json`;

  await writeJson(join(outDir, file), images);
  folders.push({ id, file, count: images.length });
  console.log(`已写入 ${images.length} 张图片 -> ${file}`);
}

folders.sort((a, b) => a.id.localeCompare(b.id));
await writeJson(join(outDir, "folders.json"), { folders });

console.log(`共 ${folders.length} 个文件夹 -> folders.json`);
