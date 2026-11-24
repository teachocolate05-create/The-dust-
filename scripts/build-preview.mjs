// 게임 전체를 HTML 파일 하나로 묶는다 → preview/the-dust.html
// 브라우저로 이 파일만 열면 설치 없이 플레이할 수 있다.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const result = await build({
  entryPoints: ["src/preview/main.tsx"],
  bundle: true,
  minify: true,
  write: false,
  outdir: "out-preview",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  tsconfig: "tsconfig.json",
  logLevel: "warning",
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#14120f" />
<title>THE DUST</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js.replace(/<\/script/g, "<\\/script")}</script>
</body>
</html>
`;
mkdirSync("preview", { recursive: true });
writeFileSync("preview/the-dust.html", html);
console.log(`preview/the-dust.html (${Math.round(html.length / 1024)} KB)`);
