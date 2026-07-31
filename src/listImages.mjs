import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OSS from "ali-oss";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico"]);

const requiredEnv = ["OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_BUCKET", "OSS_REGION"];

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

const buildPublicUrl = (name) => `https://${bucket}.${region}.aliyuncs.com/${encodeURI(name)}`;

const listRootImages = async () => {
  const images = [];
  let marker;

  do {
    const result = await client.list({
      delimiter: "/",
      "max-keys": 1000,
      marker,
    });

    for (const obj of result.objects ?? []) {
      if (!obj.name || obj.name.endsWith("/") || !isImageObject(obj.name)) continue;
      if (obj.name.includes("/")) continue;

      images.push({
        name: obj.name,
        url: buildPublicUrl(obj.name),
        size: obj.size ?? 0,
      });
    }

    marker = result.isTruncated ? result.nextMarker : undefined;
  } while (marker);

  images.sort((a, b) => a.name.localeCompare(b.name));
  return images;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "dist");
const outFile = join(outDir, "images.json");

const images = await listRootImages();
await mkdir(outDir, { recursive: true });
await writeFile(outFile, `${JSON.stringify(images, null, 2)}\n`, "utf8");

console.log(`已写入 ${images.length} 张图片 -> ${outFile}`);
