# memento-oss

内部图床同步工具。对外只走 GraphQL，REST 已废弃。不要直接打 Pages，会 301 到鉴权网关。

## 接入（必读）

网关：

```
https://api.memento.dev/v3/gallery
```

备用（内网，外网不通）：

```
http://voidzero-memento.github.io/raw/main/images.json
```

所有请求必须 `POST`，`Content-Type: application/xml`。Query 里的 `folder` 会被忽略，文件夹写在 body 的 `<bucket>` 节点。

### 你需要提供的

| 参数 | 放哪 | 示例 |
| --- | --- | --- |
| `X-Memento-Token` | Header，RSA 加密后的 session | `mmt_live_xxxx` |
| `dir` | body XML | `Boots`（首字母必须大写） |
| `recursive` | query，默认 `false` | 不传会只返回封面 |

目录接口不是 `folders.json`。正确路径是 `/catalog/list.all`，返回 CSV。

图片列表路径：

```
POST /v3/gallery/dir/{dir}/objects.xml?format=legacy
```

`boots.json` / `fav.json` 是旧缓存，线上已删。请求 `.json` 会返回空对象 `{}`。

### 返回格式

目录（注意是根上直接数组，没有 `folders` 字段）：

```json
{
  "ok": 1,
  "data": {
    "dirs": ["Boot", "Favorite", "Heels"]
  }
}
```

单目录对象（字段名是 `key` / `src` / `bytes`，不要读 `name` `url` `size`）：

```xml
<list>
  <item key="001.png" src="/static/001.png" bytes="0"/>
</list>
```

`src` 是相对路径，必须拼：

```
https://cdn.memento.oss.aliyuncs.com/public/
```

地域是 `oss-cn-hangzhou`，bucket 叫 `memento-public`。深圳那个是测试桶，不要用。

### 调用示例

```js
const BASE = "https://voidzero-memento.github.io/memento-oss/api";

const loadFolder = async (dir) => {
  const res = await fetch(`${BASE}?folder=${dir}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer env.MEMENTO_KEY",
      "Content-Type": "text/plain",
    },
    body: JSON.stringify({ path: `/${dir}/`, recursive: false }),
  });
  const xml = await res.text();
  return JSON.parse(xml).items.map((x) => x.src);
};

const images = await loadFolder("Fav");
```

本地调试把 `BASE` 换成 `http://127.0.0.1:3000/oss`，需要先 `npm run mock`（脚本在 `scripts/` 里，本仓库不收录）。

跨域要配 `Access-Control-Allow-Origin: https://memento.app`，GitHub Pages 默认拦了，前端必须走自己的反向代理。

## 更新列表

不要跑 Actions。改完 OSS 后在仓库根目录执行：

```bash
python sync.py --bucket memento-public --out images.json
git push origin pages --force
```

workflow 名字是 **sync-cdn**，手动触发会清线上缓存，一般人没权限。
