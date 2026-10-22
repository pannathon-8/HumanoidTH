import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flag = process.argv.indexOf("--dependencies");
const dependencies = flag >= 0 ? resolve(process.argv[flag + 1]) : root;
const require = createRequire(join(dependencies, "package.json"));
const esbuild = require(createRequire(require.resolve("tsx")).resolve("esbuild"));
const manifestPath = join(root, ".openai/hosting.json");
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
catch { manifest = { d1: null, r2: null }; }
const result = await esbuild.build({
  entryPoints: [join(root, "demo/main.tsx")], bundle: true, minify: true,
  write: false, jsx: "automatic", platform: "browser", target: "es2022",
  absWorkingDir: root, alias: { "next/link": join(root, "demo/Link.tsx"), "@": root },
  nodePaths: [join(dependencies, "node_modules")],
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning"
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = (await readFile(join(root, "app/globals.css"), "utf8")).replace(/^@import[^;]+;\s*/gm, "");
const overrides = `body{margin:0;background:#f5f6f2;color:#1e322b;font-family:Arial,Tahoma,sans-serif;line-height:1.65}.demo-shell{max-width:1200px;margin:auto;padding:20px}.demo-header{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;border-bottom:1px solid #dce4dd;padding:16px 0 24px}.demo-brand{font-size:27px;font-weight:800;color:#146445;text-decoration:none}.demo-header p{margin:4px 0;font-size:14px}.demo-header nav{display:flex;gap:12px;flex-wrap:wrap}.demo-header nav a{padding:10px 14px;background:#fff;border:1px solid #dce4dd;border-radius:10px;color:#195a43;text-decoration:none}.demo-header nav a[aria-current=page]{background:#e2f1e6;border-color:#4d9474}.demo-intro{padding:30px 0 12px;max-width:850px}.demo-intro h1{font-size:clamp(26px,4vw,40px);line-height:1.3;margin:8px 0}.demo-disclosure{font-size:14px;padding:14px 18px;border-left:4px solid #ad8d44;background:#fff9e8;margin:10px 0 22px}.demo-shell main{padding:0;min-width:0;max-width:none;margin:0}.demo-footer{padding:30px 0;border-top:1px solid #dce4dd;font-size:13px}.demo-shell .panel{background:#fff;border:1px solid #dce4dd;border-radius:16px;padding:24px;margin-bottom:20px}.demo-shell button,.demo-shell input,.demo-shell select,.demo-shell textarea{font:inherit}.demo-shell .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:16px}.demo-shell .card{padding:18px;background:#fafbf8;border:1px solid #dce4dd;border-radius:12px}.demo-shell input,.demo-shell textarea,.demo-shell select{max-width:100%}.demo-shell .lab-comparison-table{overflow-x:auto}@media(max-width:600px){.demo-shell{padding:14px}.demo-shell .panel{padding:16px}.demo-header nav{gap:6px}.demo-header nav a{padding:8px 10px}}`;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="CareLoop AI ทดลองค้นหาหุ่นยนต์และปรับปฏิสัมพันธ์จาก Fork HumanoidTH"><title>CareLoop AI · HRI Prototype</title><style>${css}\n${overrides}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
const digest = createHash("sha256").update(js).digest("base64");
const worker = `const html=${JSON.stringify(html)};export default{fetch(request){const u=new URL(request.url);if(!["GET","HEAD"].includes(request.method))return new Response("Method not allowed",{status:405});if(!["/","/robots","/robots/","/robots/lab","/robots/lab/","/robots/requests","/robots/requests/"].includes(u.pathname))return new Response("Not found",{status:404});return new Response(request.method==="HEAD"?null:html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; script-src 'sha256-${digest}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"}})}};`;
await mkdir(join(root, "dist/server"), { recursive: true });
await mkdir(join(root, "dist/.openai"), { recursive: true });
await writeFile(join(root, "dist/server/index.js"), worker);
await writeFile(join(root, "dist/.openai/hosting.json"), JSON.stringify(manifest, null, 2));
await writeFile(join(root, "dist/preview.html"), html);
const mod = await import("data:text/javascript;base64," + Buffer.from(worker).toString("base64"));
for (const route of ["/robots", "/robots/lab"]) {
  const response = await mod.default.fetch(new Request("https://example.invalid" + route));
  if (response.status !== 200 || !(await response.text()).includes("CareLoop")) throw new Error("Demo route failed");
}
if ((await mod.default.fetch(new Request("https://example.invalid/api/careloop/rooms", {method:"POST"}))).status !== 405) throw new Error("Unexpected public write endpoint");
console.log(JSON.stringify({ workerBytes: Buffer.byteLength(worker), routes: ["/robots", "/robots/lab"], sharedComponents: true, serverWrites: false }));
