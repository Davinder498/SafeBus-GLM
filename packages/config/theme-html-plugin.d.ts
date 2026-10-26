export function themeHtmlPlugin(): {
  name: string;
  configureServer(server: {
    middlewares: {
      use(
        path: string,
        handler: (
          request: import('node:http').IncomingMessage,
          response: import('node:http').ServerResponse,
        ) => void,
      ): unknown;
    };
  }): void;
  generateBundle(this: {
    emitFile(file: { type: 'asset'; fileName: string; source: string }): unknown;
  }): void;
  transformIndexHtml: {
    order: 'post';
    handler: () => { tag: string; attrs: { src: string }; injectTo: 'head' }[];
  };
};
