// Explode public/sistemas/mandato-embed/index.html's __bundler/template blob
// into readable source files under mandato-embed/source/, for editing.
// Counterpart: pack-mandato.cjs reassembles index.html from those files.
//
// index.html itself (bootstrap + __bundler/manifest + __bundler/page_order)
// is left completely untouched — only the __bundler/template JSON string is
// decoded and split apart.
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
const STYLE_OPEN = "<style>";
const STYLE_CLOSE = "</style>";
const APP_SCRIPT_OPEN = '<script type="text/x-dc" data-dc-script="">';
const APP_SCRIPT_CLOSE = "</script>";

const PLACEHOLDER = {
  fonts: "/*__MANDATO_FONTS_CSS__*/",
  vendorIcons: "/*__MANDATO_VENDOR_ICONS_CSS__*/",
  app: "/*__MANDATO_APP_CSS__*/",
  script: "/*__MANDATO_APP_JS__*/",
};

function extractTemplateJson(raw) {
  const openIdx = raw.indexOf(TEMPLATE_OPEN);
  if (openIdx === -1) throw new Error("__bundler/template tag not found");
  const contentStart = openIdx + TEMPLATE_OPEN.length;
  const closeIdx = raw.indexOf("</script>", contentStart);
  if (closeIdx === -1)
    throw new Error("__bundler/template closing tag not found");
  return raw.slice(contentStart, closeIdx);
}

function findStyleBlocks(html) {
  const blocks = [];
  let searchFrom = 0;
  while (true) {
    const openIdx = html.indexOf(STYLE_OPEN, searchFrom);
    if (openIdx === -1) break;
    const contentStart = openIdx + STYLE_OPEN.length;
    const closeIdx = html.indexOf(STYLE_CLOSE, contentStart);
    if (closeIdx === -1) throw new Error("Unclosed <style> tag");
    blocks.push({
      openIdx,
      contentStart,
      closeIdx,
      contentEnd: closeIdx,
      content: html.slice(contentStart, closeIdx),
    });
    searchFrom = closeIdx + STYLE_CLOSE.length;
  }
  return blocks;
}

function main() {
  const raw = fs.readFileSync(INDEX_HTML, "utf8");
  const templateJson = extractTemplateJson(raw);
  const decoded = JSON.parse(templateJson);

  const styleBlocks = findStyleBlocks(decoded);
  if (styleBlocks.length !== 3) {
    throw new Error(
      `Esperava 3 blocos <style> no template do Mandato, encontrei ${styleBlocks.length}. ` +
        "A estrutura do bundle pode ter mudado — ajuste unpack-mandato.cjs antes de continuar.",
    );
  }
  const scriptOpenIdx = decoded.indexOf(APP_SCRIPT_OPEN);
  if (scriptOpenIdx === -1) {
    throw new Error(
      `Não encontrei '${APP_SCRIPT_OPEN}' no template do Mandato — a estrutura pode ter mudado.`,
    );
  }
  const scriptContentStart = scriptOpenIdx + APP_SCRIPT_OPEN.length;
  const scriptCloseIdx = decoded.indexOf(APP_SCRIPT_CLOSE, scriptContentStart);
  if (scriptCloseIdx === -1)
    throw new Error("Tag <script type=\"text/x-dc\"> sem fechamento");
  const appJs = decoded.slice(scriptContentStart, scriptCloseIdx);

  const [fontsBlock, vendorIconsBlock, appCssBlock] = styleBlocks;

  // Build template.html by replacing, in order, each extracted region with
  // its placeholder. Replacements happen from the END of the string backwards
  // so earlier offsets stay valid while we splice.
  const regions = [
    { start: scriptContentStart, end: scriptCloseIdx, placeholder: PLACEHOLDER.script },
    { start: appCssBlock.contentStart, end: appCssBlock.contentEnd, placeholder: PLACEHOLDER.app },
    { start: vendorIconsBlock.contentStart, end: vendorIconsBlock.contentEnd, placeholder: PLACEHOLDER.vendorIcons },
    { start: fontsBlock.contentStart, end: fontsBlock.contentEnd, placeholder: PLACEHOLDER.fonts },
  ].sort((a, b) => b.start - a.start);

  let templateHtml = decoded;
  for (const region of regions) {
    templateHtml =
      templateHtml.slice(0, region.start) +
      region.placeholder +
      templateHtml.slice(region.end);
  }

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SOURCE_DIR, "template.html"), templateHtml, "utf8");
  fs.writeFileSync(path.join(SOURCE_DIR, "app.js"), appJs, "utf8");
  fs.writeFileSync(path.join(SOURCE_DIR, "app.css"), appCssBlock.content, "utf8");
  fs.writeFileSync(path.join(SOURCE_DIR, "fonts.css"), fontsBlock.content, "utf8");
  fs.writeFileSync(
    path.join(SOURCE_DIR, "vendor-icons.css"),
    vendorIconsBlock.content,
    "utf8",
  );

  console.log("[unpack-mandato] Gerado em", SOURCE_DIR);
  console.log("  template.html   ", templateHtml.length, "bytes");
  console.log("  app.js          ", appJs.length, "bytes");
  console.log("  app.css         ", appCssBlock.content.length, "bytes");
  console.log("  fonts.css       ", fontsBlock.content.length, "bytes");
  console.log("  vendor-icons.css", vendorIconsBlock.content.length, "bytes");
}

main();
