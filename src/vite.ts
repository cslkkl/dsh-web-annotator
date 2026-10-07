import { readFile } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import type { Plugin, ResolvedConfig } from 'vite';

const bridgeRoute = '__web-annotator__/bridge.js';
const sourceAttribute = 'data-web-annotator-source';

export interface WebAnnotatorOptions {
  /** Additional exact HTTP(S) origins allowed to connect. Loopback origins are allowed by the bridge. */
  allowedParentOrigins?: string[];
  /** Add file/line/column hints to intrinsic JSX elements during development. Defaults to true. */
  sourceAnnotations?: boolean;
}

/** Validate explicit origins before emitting an inline configuration script. */
export function normalizeAllowedOrigins(origins: string[] = []): string[] {
  if (!Array.isArray(origins) || origins.length > 32) {
    throw new TypeError(
      'DSH Web Annotator: allowedParentOrigins must be an array of at most 32 origins.',
    );
  }
  return [
    ...new Set(
      origins.map((origin) => {
        if (typeof origin !== 'string' || origin.length > 512) {
          throw new TypeError('DSH Web Annotator: each parent origin must be an HTTP(S) origin.');
        }
        let url: URL;
        try {
          url = new URL(origin);
        } catch {
          throw new TypeError(
            `DSH Web Annotator: invalid parent origin ${JSON.stringify(origin)}.`,
          );
        }
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== '/' ||
          url.search ||
          url.hash
        ) {
          throw new TypeError(
            `DSH Web Annotator: use an exact HTTP(S) origin, without a path or credentials: ${JSON.stringify(origin)}.`,
          );
        }
        return url.origin;
      }),
    ),
  ];
}

/** Serialize data without allowing it to close an HTML script element. */
export function serializeBridgeConfig(origins: string[]): string {
  return JSON.stringify({ allowedParentOrigins: normalizeAllowedOrigins(origins) })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

type AstNode = {
  type?: string;
  start?: number | null;
  end?: number | null;
  loc?: { start: { line: number; column: number } } | null;
  [key: string]: unknown;
};

/** Parse JSX and add hints only to native elements, preserving source line numbers. */
export function annotateJsxSource(
  code: string,
  file: string,
): { code: string; annotations: number; map: ReturnType<MagicString['generateMap']> } {
  const ast = parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript', 'decorators-legacy'],
  });
  const stack: AstNode[] = [ast as unknown as AstNode];
  const insertions: { offset: number; text: string }[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'JSXOpeningElement') {
      const name = node.name as AstNode;
      const attributes = node.attributes as AstNode[];
      const nativeName =
        name?.type === 'JSXIdentifier' && typeof name.name === 'string' && /^[a-z]/.test(name.name);
      const hasMarker = attributes.some(
        (attribute) =>
          attribute.type === 'JSXAttribute' &&
          (attribute.name as AstNode)?.name === sourceAttribute,
      );
      if (nativeName && !hasMarker && typeof name.end === 'number' && node.loc) {
        const marker = `${file.replace(/\\/g, '/')}:${node.loc.start.line}:${node.loc.start.column + 1}`;
        insertions.push({
          offset: name.end,
          text: ` ${sourceAttribute}={${JSON.stringify(marker)}}`,
        });
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && typeof child.type === 'string')
            stack.push(child as AstNode);
        }
      } else if (
        value &&
        typeof value === 'object' &&
        typeof (value as AstNode).type === 'string'
      ) {
        stack.push(value as AstNode);
      }
    }
  }
  const output = new MagicString(code);
  for (const insertion of insertions) output.appendLeft(insertion.offset, insertion.text);
  return {
    code: output.toString(),
    annotations: insertions.length,
    map: output.generateMap({ source: file, includeContent: true, hires: true }),
  };
}

/** Serve the inspection bridge and source hints in Vite development mode only. */
export function webAnnotator(options: WebAnnotatorOptions = {}): Plugin {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('DSH Web Annotator: options must be an object.');
  }
  if (options.sourceAnnotations !== undefined && typeof options.sourceAnnotations !== 'boolean') {
    throw new TypeError('DSH Web Annotator: sourceAnnotations must be a boolean.');
  }
  const origins = normalizeAllowedOrigins(options.allowedParentOrigins);
  let config: ResolvedConfig;
  let bridgeContents: Promise<string> | undefined;
  return {
    name: 'dsh-web-annotator:development-bridge',
    apply: 'serve',
    enforce: 'pre',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      const mountPath = `${server.config.base.replace(/\/$/, '')}/${bridgeRoute}`;
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://web-annotator.invalid').pathname;
        if (path !== mountPath || !['GET', 'HEAD'].includes(req.method ?? 'GET')) return next();
        try {
          bridgeContents ??= readFile(
            fileURLToPath(new URL('./bridge.js', import.meta.url)),
            'utf8',
          );
          const bridge = await bridgeContents;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.end(req.method === 'HEAD' ? undefined : bridge);
        } catch (error) {
          bridgeContents = undefined;
          server.config.logger.error(
            `DSH Web Annotator: cannot load the packaged bridge. ${error instanceof Error ? error.message : String(error)}`,
          );
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            'DSH Web Annotator bridge bundle is missing. Build dsh-web-annotator before starting Vite.',
          );
        }
      });
    },
    transformIndexHtml() {
      const base = config.base.replace(/\/$/, '');
      return [
        {
          tag: 'script',
          children: `window.__WEB_ANNOTATOR_CONFIG__=${serializeBridgeConfig(origins)};`,
          injectTo: 'head-prepend',
        },
        {
          tag: 'script',
          attrs: { src: `${base}/${bridgeRoute}`, defer: true },
          injectTo: 'head-prepend',
        },
      ];
    },
    transform(code, id) {
      if (options.sourceAnnotations === false) return null;
      const filePath = id.split('?')[0];
      if (
        !/\.[jt]sx$/.test(filePath) ||
        /[/\\]node_modules[/\\]/.test(filePath) ||
        filePath.includes('\0')
      )
        return null;
      const file = relative(config.root, filePath).replace(/\\/g, '/');
      if (file.startsWith('../') || isAbsolute(file)) return null;
      try {
        const result = annotateJsxSource(code, file);
        return result.annotations ? { code: result.code, map: result.map } : null;
      } catch (error) {
        this.warn(
          `DSH Web Annotator: source hints unavailable for ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },
  };
}

/** @deprecated Use webAnnotator. Kept for existing Vite configurations. */
export const layoutCare = webAnnotator;
/** @deprecated Use WebAnnotatorOptions. */
export type LayoutCareOptions = WebAnnotatorOptions;
export default webAnnotator;
