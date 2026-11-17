// Reassemble public/sistemas/mandato-embed/index.html's __bundler/template
// blob from the readable files under mandato-embed/source/.
// Counterpart: unpack-mandato.cjs (run that first after structural changes
// upstream; for normal edits just edit source/* and run this).
//
// Only the __bundler/template script tag's content is replaced — the rest of
// index.html (bootstrap, __bundler/manifest, __bundler/page_order) is kept
// byte-for-byte as it was.
const fs = require("fs");
const path = require("path");

const EMBED_DIR = path.join(
  __dirname,
  "..",
  "public",
  "sistemas",
  "mandato-embed",
);
const INDEX_HTML = path.join(EMBED_DIR, "index.html");
const SOURCE_DIR = path.join(EMBED_DIR, "source");

const TEMPLATE_OPEN = '<script type="__bundler/template">';

const PLACEHOLDER = {
  fonts: "/*__MANDATO_FONTS_CSS__*/",
  vendorIcons: "/*__MANDATO_VENDOR_ICONS_CSS__*/",
  app: "/*__MANDATO_APP_CSS__*/",
  script: "/*__MANDATO_APP_JS__*/",
};

function readSource(name) {
  return fs.readFileSync(path.join(SOURCE_DIR, name), "utf8");
}

// Matches the escaping the original site-builder bundle uses: standard JSON
// string escaping, plus `/` also escaped as `\/`. Verified byte-for-byte
// against the original file in build-checks/_mandato_verify_roundtrip.cjs.
function encodeBundlerTemplateString(str) {
  return JSON.stringify(str).replace(/\//g, "\\/");
}

function splice(str, placeholder, replacement) {
  if (!str.includes(placeholder)) {
    throw new Error(`Placeholder ${placeholder} não encontrado em template.html`);
  }
  return str.split(placeholder).join(replacement);
}

function main() {
  const templateHtml = readSource("template.html");
  const appJs = readSource("app.js");
  const appCss = readSource("app.css");
  const fontsCss = readSource("fonts.css");
  const vendorIconsCss = readSource("vendor-icons.css");

  let decoded = templateHtml;
  decoded = splice(decoded, PLACEHOLDER.script, appJs);
  decoded = splice(decoded, PLACEHOLDER.app, appCss);
  decoded = splice(decoded, PLACEHOLDER.vendorIcons, vendorIconsCss);
  decoded = splice(decoded, PLACEHOLDER.fonts, fontsCss);

  const encoded = encodeBundlerTemplateString(decoded);

  const raw = fs.readFileSync(INDEX_HTML, "utf8");
  const openIdx = raw.indexOf(TEMPLATE_OPEN);
  if (openIdx === -1) throw new Error("__bundler/template tag not found");
  const contentStart = openIdx + TEMPLATE_OPEN.length;
  const closeIdx = raw.indexOf("</script>", contentStart);
  if (closeIdx === -1)
    throw new Error("__bundler/template closing tag not found");

  const next = raw.slice(0, contentStart) + encoded + raw.slice(closeIdx);
  fs.writeFileSync(INDEX_HTML, next, "utf8");

  console.log("[pack-mandato] index.html atualizado a partir de", SOURCE_DIR);
  console.log("  template decodificado:", decoded.length, "bytes");
  console.log("  template codificado:  ", encoded.length, "bytes");
}

main();
