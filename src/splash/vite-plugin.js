// Vite plugin (Node side, used by vite.config.js) for the launch splash ("trailer").
//
// 1. transformIndexHtml (dev + build): the trailer art is read fresh on every build / dev request, so it stays
//    editable:  design/splash/trailer.html  (the real trailer)  or  src/splash/placeholder.html (fallback).
//    Its <style> goes at the end of <head> (so the art is never painted unstyled), its markup replaces the
//    <!-- tb-splash --> marker at the top of <body>, followed by the minified controller src/splash/inline.js
//    (window.__splash). A one-line script after the game script moves the bar on to "Knitting the town…" the moment
//    the whole page has downloaded (the parser only gets past the ~2 MB game script once all of it has arrived).
// 2. generateBundle (build only, after vite-plugin-singlefile has inlined everything): moves the inline game
//    <script type="module"> from <head> to the end of <body>, and the ~160 KB game <style> to just after the splash.
//    A module script is deferred either way, so it runs at exactly the same moment, but now the splash is the first
//    thing in the file and paints while the rest downloads.
import fs from 'node:fs';
import path from 'node:path';
import { transformWithEsbuild } from 'vite';

const MARKER = '<!-- tb-splash -->';
const ARRIVED = '<script>window.__splash&&__splash.step(.45,';
const SPLASH_END = '<!--/tb-splash-->';
// Page colour before any CSS is read. (Trailer class names must not clash with the game's global ones, e.g. the
// social UI's .tbs-main / .tbs-pill: the game CSS applies to the splash too.)
const HEAD_CSS = 'html{background:#2b3452}html.tb-nosplash #tb-splash{display:none!important}';
// ?capture (automated tests) without &splash: hidden from the very first paint; the controller then removes it
const HEAD_JS = "(function(q){/[?&]capture(=|&|$)/.test(q)&&!/[?&]splash(=|&|$)/.test(q)&&document.documentElement.classList.add('tb-nosplash')})(location.search)";

/** Built page order: <head> … splash CSS </head> <body> splash + controller · game CSS · web font · #c · #ui ·
 *  game script · "arrived" one-liner </body>. */
function reorder(html) {
  const cut = (re, close) => {
    const head = html.indexOf('</head>');
    const start = html.search(re);
    if (start < 0 || start > head) return '';
    const end = html.indexOf(close, start) + close.length; // inlined JS has its "</script" escaped by singlefile
    const out = html.slice(start, end);
    html = html.slice(0, start) + html.slice(end).replace(/^[ \t]*\n/, '');
    return out;
  };
  const script = cut(/<script type="module"[^>]*>/, '</script>');
  const css = cut(/<style rel="stylesheet"[^>]*>/, '</style>');
  if (css) {
    let at = html.indexOf(SPLASH_END);
    at = at >= 0 ? at + SPLASH_END.length : html.indexOf('<body>') + 6;
    html = `${html.slice(0, at)}\n    ${css}${html.slice(at)}`;
  }
  if (script) {
    let at = html.lastIndexOf(ARRIVED);
    if (at < 0) at = html.lastIndexOf('</body>');
    html = `${html.slice(0, at)}${script}\n  ${html.slice(at)}`;
  }
  return html;
}

export function splashPlugin({ root = process.cwd() } = {}) {
  const art = path.resolve(root, 'design/splash/trailer.html');
  const fallback = path.resolve(root, 'src/splash/placeholder.html');
  const ctrl = path.resolve(root, 'src/splash/inline.js');
  let isBuild = false;

  async function snippet() {
    const file = fs.existsSync(art) ? art : fallback;
    if (file === fallback) console.warn('[splash] design/splash/trailer.html not found: using src/splash/placeholder.html');
    let markup = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const styles = [];
    markup = markup.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => { styles.push(css.trim()); return ''; }).trim();
    const js = (await transformWithEsbuild(fs.readFileSync(ctrl, 'utf8'), 'splash-inline.js', { minify: true, target: 'es2017', format: 'iife' })).code.trim();
    return {
      head: `<style>${HEAD_CSS}\n${styles.join('\n')}</style>\n  <script>${HEAD_JS}</script>`,
      body: `${markup}\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>${SPLASH_END}`,
    };
  }

  return {
    name: 'tinselby:splash',
    enforce: 'post',
    configResolved(c) { isBuild = c.command === 'build'; },
    configureServer(server) { server.watcher.add([art, fallback, ctrl]); },
    handleHotUpdate({ file, server }) {
      if (file === art || file === fallback || file === ctrl) { server.ws.send({ type: 'full-reload' }); return []; }
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        if (!html.includes(MARKER)) { console.warn('[splash] <!-- tb-splash --> marker missing in index.html'); return html; }
        const s = await snippet();
        const arrived = `${ARRIVED}'Knitting the town…')</script>\n  `;
        return html
          .replace('</head>', () => `  ${s.head}\n  </head>`)
          .replace(MARKER, () => s.body)
          .replace(/<\/body>(?![\s\S]*<\/body>)/, () => `${arrived}</body>`);
      },
    },
    generateBundle: {
      order: 'post',
      handler(_opts, bundle) {
        if (!isBuild) return;
        for (const name of Object.keys(bundle)) {
          if (/\.html?$/.test(name)) bundle[name].source = reorder(String(bundle[name].source));
        }
      },
    },
  };
}
