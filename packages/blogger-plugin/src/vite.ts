import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { MinimalPluginContextWithoutEnvironment, Plugin, PreviewServer, ResolvedConfig, ViteDevServer } from 'vite';
import { type BloggerPluginOptions, BloggerPluginOptionsSchema } from './schema';
import { errorHtml, escapeHtml, getBloggerPluginHeadComment, replaceBloggerPluginHeadComment, replaceHost, toWebHeaders } from './utils';

const DEFAULT_ENTRIES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'main.tsx', 'main.ts', 'main.jsx', 'main.js'];
const DEFAULT_TEMPLATES = ['template.xml', 'theme.xml'];

interface PluginContext {
  viteConfig: ResolvedConfig;
  entry: string;
  template: string;
  options: BloggerPluginOptions;
}

function createPluginContext(userOptions: BloggerPluginOptions): PluginContext {
  return {
    viteConfig: undefined as unknown as ResolvedConfig,
    entry: undefined as unknown as string,
    template: undefined as unknown as string,
    options: BloggerPluginOptionsSchema.parse(userOptions),
  };
}

function isViteDevServer(server: ViteDevServer | PreviewServer): server is ViteDevServer {
  return 'hot' in server && 'transformRequest' in server && 'transformIndexHtml' in server;
}

function useServerMiddleware(server: ViteDevServer | PreviewServer, ctx: PluginContext, _this: MinimalPluginContextWithoutEnvironment) {
  return () => {
    server.httpServer?.once('listening', () => {
      setTimeout(() => {
        _this.info(`Unhandled requests will be proxied to ${ctx.options.proxyBlog}`);
      }, 0);
    });

    server.middlewares.use(async (req, res, next) => {
      if (!req.url || !req.originalUrl) {
        next();
        return;
      }

      const start = Date.now();

      const proxyUrl = new URL(req.originalUrl, ctx.options.proxyBlog);

      const viewParam = proxyUrl.searchParams.get('view');
      proxyUrl.searchParams.set('view', `${isViteDevServer(server) ? '-DevServer' : '-PreviewServer'}${viewParam?.startsWith('-') ? viewParam : ''}`);

      const proxyRequest = new Request(proxyUrl, {
        method: req.method,
        headers: toWebHeaders(req.headers),
        body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : Readable.toWeb(req),
        redirect: 'manual',
      });

      const proxyResponse = await fetch(proxyRequest).catch((error) => {
        if (error instanceof Error) {
          _this.warn({
            message: `${error.name}: ${error.message}`,
            cause: error.cause,
            stack: error.stack,
          });
        } else {
          _this.warn('Fetch failed');
        }
        return null;
      });

      if (proxyResponse) {
        const requestProtocol = `${(req.headers['x-forwarded-proto'] as string) || (req.socket && 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http')}:`;
        const requestHost = (req.headers['x-forwarded-host'] as string) || req.headers.host;

        res.statusCode = proxyResponse.status;
        res.statusMessage = proxyResponse.statusText;

        proxyResponse.headers.forEach((value, key) => {
          if (key === 'location') {
            const redirectUrl = new URL(value, requestHost ? `${requestProtocol}//${requestHost}${req.originalUrl}` : proxyUrl.href);
            if ((requestHost && redirectUrl.host === requestHost) || redirectUrl.host === proxyUrl.host) {
              if (requestHost && requestProtocol) {
                redirectUrl.host = requestHost;
                redirectUrl.protocol = requestProtocol;
              }
              const viewParam = redirectUrl.searchParams.get('view')?.replaceAll('-DevServer', '').replaceAll('-PreviewServer', '');
              if (viewParam) {
                redirectUrl.searchParams.set('view', viewParam);
              } else {
                redirectUrl.searchParams.delete('view');
              }
              res.setHeader(key, redirectUrl.pathname + redirectUrl.search + redirectUrl.hash);
            } else {
              res.setHeader(key, redirectUrl.href);
            }
          } else if (['content-type', 'x-robots-tag', 'date', 'location'].includes(key)) {
            res.setHeader(key, value);
          }
        });

        const contentType = proxyResponse.headers.get('content-type');

        if (contentType?.startsWith('text/html')) {
          let htmlTemplateContent = await proxyResponse.text();

          if (requestHost && requestProtocol) {
            htmlTemplateContent = replaceHost(htmlTemplateContent, proxyUrl.host, requestHost, requestProtocol);
          }

          if (isViteDevServer(server)) {
            const htmlTags: string[] = [];

            htmlTags.push(`<script src='/${escapeHtml(path.relative(ctx.viteConfig.root, ctx.entry))}' type='module'></script>`);

            const template = await server.transformIndexHtml(
              req.url,
              replaceBloggerPluginHeadComment(htmlTemplateContent, htmlTags.join('')),
              req.originalUrl,
            );

            res.end(template);
          } else {
            const xmlTemplateContent = fs.readFileSync(path.resolve(ctx.viteConfig.build.outDir, 'template.xml'), 'utf8');

            const htmlTagsStr = getBloggerPluginHeadComment(xmlTemplateContent, true);

            const template = replaceBloggerPluginHeadComment(htmlTemplateContent, htmlTagsStr ?? '');

            res.end(template);
          }
        } else if (requestHost && requestProtocol && contentType && /^(text\/)|(application\/(.*\+)?(xml|json))/.test(contentType)) {
          const content = await proxyResponse.text();

          res.end(replaceHost(content, proxyUrl.host, requestHost, requestProtocol));
        } else {
          res.end(new Uint8Array(await proxyResponse.arrayBuffer()));
        }
      } else {
        res.statusCode = 500;
        res.statusMessage = 'Internal Server Error';

        res.setHeader('Content-Type', 'text/html');

        res.end(errorHtml(proxyUrl.href));
      }

      const duration = Date.now() - start;

      _this.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${res.statusMessage} (${duration}ms)`);
    });
  };
}

export default function blogger(userOptions: BloggerPluginOptions): Plugin {
  const ctx = createPluginContext(userOptions);

  return {
    name: 'vite-plugin-blogger',
    config(config) {
      const root = config.root || process.cwd();

      let entry: string | undefined;
      let template: string | undefined;

      if (ctx.options.entry) {
        const providedPath = path.resolve(root, ctx.options.entry);
        if (fs.existsSync(providedPath)) {
          entry = providedPath;
        } else {
          this.error(`Provided entry file does not exist: ${providedPath}`);
        }
      } else {
        for (const file of DEFAULT_ENTRIES) {
          const fullPath = path.resolve(root, 'src', file);
          if (fs.existsSync(fullPath)) {
            entry = fullPath;
            break;
          }
        }

        if (!entry) {
          this.error(
            'No entry file found in "src".\n' +
              `Tried: ${DEFAULT_ENTRIES.map((c) => path.join('src', c)).join(', ')}\n` +
              '👉 Tip: You can pass a custom entry like:\n' +
              '   blogger({ entry: "src/my-entry.ts" })',
          );
        }
      }

      if (ctx.options.template) {
        const providedPath = path.resolve(root, ctx.options.template);
        if (fs.existsSync(providedPath)) {
          template = providedPath;
        } else {
          this.error(`Provided template file does not exist: ${providedPath}`);
        }
      } else {
        for (const file of DEFAULT_TEMPLATES) {
          const fullPath = path.resolve(root, 'src', file);
          if (fs.existsSync(fullPath)) {
            template = fullPath;
            break;
          }
        }

        if (!template) {
          this.error(
            'No template file found in "src".\n' +
              `Tried: ${DEFAULT_TEMPLATES.map((c) => path.join('src', c)).join(', ')}\n` +
              '👉 Tip: You can pass a custom template like:\n' +
              '   blogger({ template: "src/my-template.xml" })',
          );
        }
      }

      // populate plugin context
      ctx.entry = entry as string;
      ctx.template = template as string;

      // override vite config
      config.build ??= {};
      config.build.rollupOptions ??= {};
      config.build.rollupOptions.input = entry;

      // remove contents between comments from template
      const xmlTemplateContent = fs.readFileSync(ctx.template, 'utf8');
      fs.writeFileSync(ctx.template, replaceBloggerPluginHeadComment(replaceBloggerPluginHeadComment(xmlTemplateContent, ''), '', true), {
        encoding: 'utf8',
      });
    },
    configResolved(config) {
      ctx.viteConfig = config;
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.isEntry) {
          continue;
        }

        const xmlTemplateContent = fs.readFileSync(ctx.template, 'utf8');

        const htmlTags: string[] = [];
        output.viteMetadata?.importedCss.forEach((value) => {
          htmlTags.push(`<link crossorigin='anonymous' href='${escapeHtml(ctx.viteConfig.base + value)}' rel='stylesheet'/>`);
        });
        htmlTags.push(`<script crossorigin='anonymous' src='${escapeHtml(ctx.viteConfig.base + output.fileName)}' type='module'></script>`);

        const template = replaceBloggerPluginHeadComment(xmlTemplateContent, htmlTags.join(''), true);

        this.emitFile({
          type: 'asset',
          fileName: 'template.xml',
          source: template,
        });

        break;
      }
    },
    configureServer(server) {
      return useServerMiddleware(server, ctx, this);
    },
    configurePreviewServer(server) {
      return useServerMiddleware(server, ctx, this);
    },
  };
}

export type { BloggerPluginOptions } from './schema';
