import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Both entrypoints receive the exact same blocking, local-only bootstrap. */
export function themeHtmlPlugin() {
  const source = readFileSync(new URL('./theme-bootstrap.js', import.meta.url), 'utf8');
  const fileName = `appearance-bootstrap.${createHash('sha256').update(source).digest('hex').slice(0, 12)}.js`;
  return {
    name: 'safebus-theme-bootstrap',
    configureServer(server) {
      server.middlewares.use(`/${fileName}`, (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(source);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source });
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'script', attrs: { src: `/${fileName}` }, injectTo: 'head' }],
    },
  };
}
