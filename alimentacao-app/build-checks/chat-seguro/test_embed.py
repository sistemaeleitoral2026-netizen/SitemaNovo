"""Teste do Chat Seguro EMBUTIDO (public/sistemas/chat-seguro) com Supabase simulado e uma página-mãe
que imita o shell React (/chat): manda chat-config/token, recebe chat-sair/chat-trocar-sistema.
Uso (em alimentacao-app):  py -3.12 -I build-checks/chat-seguro/test_embed.py
Precisa do Chromium do Playwright. Não toca no Supabase real."""
import functools, http.server, json, sys, threading
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent.parent / "public"
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
EXE = r"C:\Users\PC\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"
VERCEL = json.loads((HERE.parent.parent.parent / "vercel.json").read_text(encoding="utf-8"))
MOCK = (HERE / "mock-supabase.js").read_text(encoding="utf-8") + (HERE / "mock-sc-shim.js").read_text(encoding="utf-8")

PARENT = """<!doctype html><html><body style="margin:0;height:100vh">
<iframe id="f" src="/sistemas/chat-seguro/index.html?v=1" style="border:0;width:100%;height:100%"></iframe>
<script>
window.__parentLog = [];
const tok = (min) => { const p = btoa(JSON.stringify({ exp: Math.floor(Date.now()/1000) + min*60 })).replace(/=+$/,'');
  return 'h.' + p + '.s'; };
addEventListener('message', (ev) => {
  const f = document.getElementById('f'); if (ev.source !== f.contentWindow) return;
  window.__parentLog.push(ev.data.type);
  if (ev.data.type === 'chat-pronto') f.contentWindow.postMessage({ type: 'chat-config', url: 'https://mock.supabase.co', anon: 'anon',
    vapid: '', token: tok(60), email: 'ana.souza@exemplo.com', nome: 'Ana Souza', userId: 'u1' }, location.origin);
  if (ev.data.type === 'chat-token') f.contentWindow.postMessage({ type: 'chat-token', token: tok(60) }, location.origin);
});
</script></body></html>"""

def headers_for(path):
    import re
    out = {}
    for rule in VERCEL.get("headers", []):
        if re.fullmatch(rule["source"].replace("(.*)", ".*"), path):
            for h in rule["headers"]: out[h["key"]] = h["value"]
    if "Content-Security-Policy" in out:   # só no teste: arquivos do mock vêm por blob:
        out["Content-Security-Policy"] = out["Content-Security-Policy"].replace("connect-src 'self'", "connect-src 'self' blob:")
    return out

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        for k, v in headers_for(self.path.split("?")[0]).items(): self.send_header(k, v)
        super().end_headers()
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8793), functools.partial(H, directory=str(PUBLIC)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:8793"

errors = []
def check(c, m):
    print(("ok  " if c else "FALHOU ") + m)
    if not c: raise SystemExit(1)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE, headless=True)
    ctx = b.new_context(viewport={"width": 1280, "height": 760}, service_workers="block")
    ctx.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));")
    ctx.route("**/parent.html", lambda r: r.fulfill(body=PARENT, content_type="text/html"))
    ctx.route("**/sistemas/chat-seguro/vendor/supabase.js*", lambda r: r.fulfill(body=MOCK, content_type="application/javascript", headers=headers_for("/sistemas/chat-seguro/vendor/supabase.js")))
    ctx.route("https://mock.supabase.co/auth/v1/token*", lambda r: r.fulfill(status=200 if "senha123" in (r.request.post_data or "") else 400,
              body=json.dumps({"access_token": "x"} if "senha123" in (r.request.post_data or "") else {"error": "invalid"}), content_type="application/json"))
    ctx.route("https://mock.supabase.co/auth/v1/logout*", lambda r: r.fulfill(status=204, body=""))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.goto(BASE + "/parent.html")
    fr = pg.frame_locator("#f")
    fr.locator("#chat").wait_for(timeout=10000)
    frame = pg.frame(url=lambda u: "chat-seguro" in u)
    check("chat-pronto" in pg.evaluate("window.__parentLog"), "iframe pediu a configuração à página do sistema (chat-pronto)")
    check(frame.evaluate("BRIDGE.email") == "ana.souza@exemplo.com", "recebeu e-mail/nome/token do login do sistema (sem tela de login própria)")
    check(frame.query_selector("#a-user") is None, "não existe mais tela de usuário/senha dentro do chat")
    pg.wait_for_timeout(600)
    check("Reunião às 10h" in frame.inner_text("#rooms"), "conversas carregadas das tabelas sc_* e decifradas")

    frame.click(".room:has-text('Bruno Lima')"); pg.wait_for_timeout(900)
    check("conseguiu ver o contrato" in frame.inner_text("#messages"), "conversa privada decifrada")
    frame.fill("#input", "teste embutido"); frame.press("#input", "Enter"); pg.wait_for_timeout(500)
    check(frame.evaluate("window.__lastInsert.ciphertext") and "teste embutido" not in json.dumps(frame.evaluate("window.__lastInsert")),
          "envio cifrado (o servidor só recebe texto cifrado)")
    check(frame.evaluate("window.__lastTable") == "sc_messages", "grava em sc_messages (prefixo do Nerites)")
    frame.click(".msg.pending:not(.mine) .open-once"); pg.wait_for_timeout(500)
    check(frame.query_selector(".viewer.once") is not None and frame.evaluate("window.__revealUrl") == "/api/chat-reveal", "uma visão abre pela função /api/chat-reveal da Vercel")
    frame.click(".viewer .icon-btn"); pg.wait_for_timeout(400)
    check(frame.query_selector(".msg.receipt") is not None, "comprovante 'Aberta por você' aparece")

    frame.evaluate("BRIDGE.exp = Math.floor(Date.now()/1000) + 10"); frame.evaluate("getToken()"); pg.wait_for_timeout(300)
    check(pg.evaluate("window.__parentLog").count("chat-token") >= 1 and frame.evaluate("BRIDGE.exp") > 0 and frame.evaluate("BRIDGE.exp*1000 - Date.now()") > 600000,
          "token perto de vencer: o chat pede um novo à página (não renova sozinho)")

    frame.evaluate("lastAct = Date.now() - 6*60*1000; checkIdle();"); pg.wait_for_timeout(300)
    frame.fill("#lk-input", "errada"); frame.click("#lk-go"); pg.wait_for_timeout(400)
    check(frame.query_selector("#applock") is not None, "bloqueio: senha errada não abre")
    frame.fill("#lk-input", "senha123"); frame.click("#lk-go"); pg.wait_for_timeout(600)
    check(frame.query_selector("#applock") is None, "bloqueio: senha certa (conferida sem mexer na sessão do sistema) abre")

    frame.click("#menu-btn"); frame.click("#menu [data-act=switch]"); pg.wait_for_timeout(200)
    check("chat-trocar-sistema" in pg.evaluate("window.__parentLog"), "menu 'Trocar de sistema' avisa a página")
    frame.click("#menu-btn"); frame.click("#menu [data-act=logout]"); frame.click(".sheet [data-a=keep]"); pg.wait_for_timeout(600)
    check("chat-sair" in pg.evaluate("window.__parentLog"), "'Sair' pede à página para encerrar o login do sistema")
    check(frame.evaluate("window.__csp.length") == 0, "nenhuma violação da CSP (cabeçalhos do vercel.json da pasta do chat)")
    pg.screenshot(path=str(OUT / "embed.png"))

    # aberto direto (fora do sistema): só orienta a entrar pelo seletor
    pg2 = ctx.new_page(); pg2.goto(BASE + "/sistemas/chat-seguro/index.html"); pg2.wait_for_timeout(500)
    check("escolha" in pg2.inner_text("body") and "Chat Seguro" in pg2.inner_text("body"), "aberto fora do sistema: pede para entrar pelo seletor")
    b.close()
srv.shutdown()
print("ERROS DE CONSOLE:", errors or "nenhum")
