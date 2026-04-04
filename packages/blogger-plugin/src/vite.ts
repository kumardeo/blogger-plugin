import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import {
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
  type PreviewServer,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
  version,
} from 'vite';
import { clearTailwindCache, removeTailwindCache, updateTailwindCache } from './cache';
import { DEFAULT_ENTRIES, DEFAULT_TEMPLATES } from './constants';
import {
  errorHtml,
  escapeHtml,
  getBloggerPluginHeadComment,
  getRequestUrl,
  isTailwindPlugin,
  replaceBloggerPluginHeadComment,
  replaceHost,
  toWebHeaders,
} from './utils';

interface BloggerPluginContext {
  root: string;
  entry: string;
  template: string;
  proxyBlog: URL;
  viteConfig: ResolvedConfig;
  tailwind: boolean;
  input: string;
  html: string;
  resolve(root: UserConfig): void;
}

function createBloggerPluginContext(userOptions: BloggerPluginOptions): BloggerPluginContext {
  if (typeof userOptions.entry !== 'undefined' && typeof userOptions.entry !== 'string') {
    throw new Error("Option 'entry' must be a string");
  }
  if (typeof userOptions.template !== 'undefined' && typeof userOptions.template !== 'string') {
    throw new Error("Option 'template' must be a string");
  }
  if (typeof userOptions.proxyBlog !== 'string') {
    throw new Error("Option 'proxyBlog' must be a string");
  }
  let proxyBlog: URL;
  try {
    proxyBlog = new URL(userOptions.proxyBlog);
  } catch {
    throw new Error("Option 'proxyBlog' must be a valid url");
  }
  return {
    root: process.cwd(),
    entry: undefined as unknown as string,
    template: undefined as unknown as string,
    proxyBlog,
    viteConfig: undefined as unknown as ResolvedConfig,
    tailwind: false,
    input: undefined as unknown as string,
    html: undefined as unknown as string,
    resolve(config: UserConfig) {
      this.root = config.root ? path.resolve(config.root) : this.root;

      if (userOptions.entry) {
        const providedPath = path.resolve(this.root, userOptions.entry);
        if (fs.existsSync(providedPath)) {
          this.entry = providedPath;
        } else {
          throw new Error(`Provided entry file does not exist: ${providedPath}`);
        }
      } else {
        for (const file of DEFAULT_ENTRIES) {
          const fullPath = path.resolve(this.root, 'src', file);
          if (fs.existsSync(fullPath)) {
            this.entry = fullPath;
            break;
          }
        }

        if (!this.entry) {
          throw new Error(
            'No entry file found in "src".\n' +
              `Tried: ${DEFAULT_ENTRIES.map((c) => path.join('src', c)).join(', ')}\n` +
              '👉 Tip: You can pass a custom entry like:\n' +
              '   blogger({ entry: "src/my-entry.ts" })',
          );
        }
      }

      if (userOptions.template) {
        const providedPath = path.resolve(this.root, userOptions.template);
        if (fs.existsSync(providedPath)) {
          this.template = providedPath;
        } else {
          throw new Error(`Provided template file does not exist: ${providedPath}`);
        }
      } else {
        for (const file of DEFAULT_TEMPLATES) {
          const fullPath = path.resolve(this.root, 'src', file);
          if (fs.existsSync(fullPath)) {
            this.template = fullPath;
            break;
          }
        }

        if (!this.template) {
          throw new Error(
            'No template file found in "src".\n' +
              `Tried: ${DEFAULT_TEMPLATES.map((c) => path.join('src', c)).join(', ')}\n` +
              '👉 Tip: You can pass a custom template like:\n' +
              '   blogger({ template: "src/my-template.xml" })',
          );
        }
      }

      const name = path.basename(this.entry, path.extname(this.entry));
      this.input = `virtual:blogger-plugin/${name}.html`;
      this.html = `<!DOCTYPE html>
<html>
<head>
  <!--head-->
  <script type="module" src="/${path.relative(this.root, this.entry).replace('\\', '/')}"></script>
</head>
<body>
  <!--body-->
</body>
</html>`;
    },
  };
}

function isViteDevServer(server: ViteDevServer | PreviewServer): server is ViteDevServer {
  return 'hot' in server && 'transformRequest' in server && 'transformIndexHtml' in server;
}

function useServerMiddleware(server: ViteDevServer | PreviewServer, ctx: BloggerPluginContext, _this: MinimalPluginContextWithoutEnvironment) {
  return () => {
    server.httpServer?.once('listening', () => {
      setTimeout(() => {
        _this.info(`Unhandled requests will be proxied to ${ctx.proxyBlog.origin}`);
      }, 0);
    });

    server.middlewares.use(async (req, res, next) => {
      const url = getRequestUrl(req);

      if (!req.url || !req.originalUrl || !url) {
        next();
        return;
      }

      const start = Date.now();

      const proxyUrl = new URL(`${ctx.proxyBlog.origin}${req.originalUrl}`);

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
        res.statusCode = proxyResponse.status;
        res.statusMessage = proxyResponse.statusText;

        proxyResponse.headers.forEach((value, key) => {
          if (key === 'location') {
            const redirectUrl = new URL(value, proxyUrl);
            if (redirectUrl.host === url.host || redirectUrl.host === proxyUrl.host) {
              redirectUrl.host = url.host;
              redirectUrl.protocol = url.protocol;
              const viewParam = redirectUrl.searchParams.get('view')?.replaceAll('-DevServer', '').replaceAll('-PreviewServer', '');
              if (viewParam) {
                redirectUrl.searchParams.set('view', viewParam);
              } else {
                redirectUrl.searchParams.delete('view');
              }
              res.setHeader('location', redirectUrl.pathname + redirectUrl.search + redirectUrl.hash);
            } else {
              res.setHeader('location', redirectUrl.href);
            }
          } else if (['content-type', 'x-robots-tag', 'date', 'location'].includes(key)) {
            res.setHeader(key, value);
          }
        });

        const contentType = proxyResponse.headers.get('content-type');

        if (contentType?.startsWith('text/html')) {
          let htmlTemplateContent = await proxyResponse.text();

          if (ctx.tailwind && isViteDevServer(server)) {
            await updateTailwindCache(ctx.root, htmlTemplateContent);
          }

          htmlTemplateContent = replaceHost(htmlTemplateContent, proxyUrl.host, url.host, url.protocol);

          if (isViteDevServer(server)) {
            const htmlTags: string[] = [];

            htmlTags.push(`<script type='module' src='/${escapeHtml(path.relative(ctx.root, ctx.entry).replace('\\', '/'))}'></script>`);

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
        } else if (contentType && /^(text\/)|(application\/(.*\+)?(xml|json))/.test(contentType)) {
          const content = await proxyResponse.text();

          res.end(replaceHost(content, proxyUrl.host, url.host, url.protocol));
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

export interface BloggerPluginOptions {
  entry?: string;
  template?: string;
  proxyBlog: string;
}

export default function blogger(userOptions: BloggerPluginOptions): Plugin {
  const ctx = createBloggerPluginContext(userOptions);

  return {
    name: 'vite-plugin-blogger',
    config(config) {
      // resolve plugin context
      ctx.resolve(config);

      // modify vite config
      config.build ||= {};
      const major = Number(version.split('.')[0]);
      const bundlerKey = (major >= 8 ? 'rolldownOptions' : 'rollupOptions') as 'rollupOptions';
      config.build[bundlerKey] ||= {};
      const bundlerOptions = config.build[bundlerKey];
      if (Array.isArray(bundlerOptions.input)) {
        bundlerOptions.input = [...bundlerOptions.input, ctx.input];
      } else if (typeof bundlerOptions.input === 'object' && bundlerOptions.input !== null) {
        bundlerOptions.input[ctx.input] = ctx.input;
      } else {
        bundlerOptions.input = ctx.input;
      }

      const originalTemplateXmlContent = fs.readFileSync(ctx.template, 'utf8');
      // remove contents between comments from template
      const modifiedTemplateXmlContent = replaceBloggerPluginHeadComment(replaceBloggerPluginHeadComment(originalTemplateXmlContent, ''), '', true);

      fs.writeFileSync(ctx.template, modifiedTemplateXmlContent, 'utf-8');
    },
    configResolved(config) {
      ctx.viteConfig = config;
      ctx.tailwind = config.plugins.flat(Number.POSITIVE_INFINITY).some((plugin) => isTailwindPlugin(plugin));

      if (ctx.tailwind) {
        clearTailwindCache(ctx.root);

        if (config.command === 'build') {
          updateTailwindCache(ctx.root, fs.readFileSync(ctx.template, 'utf-8'));
        }
      } else {
        removeTailwindCache(ctx.root);
      }
    },
    resolveId(source) {
      if (source === ctx.input) {
        return ctx.input;
      }
    },
    load(id) {
      if (id === ctx.input) {
        return ctx.html;
      }
    },
    writeBundle(_, bundle) {
      if (!(ctx.input in bundle)) {
        return;
      }
      const asset = bundle[ctx.input];
      delete bundle[ctx.input];

      if (asset.type !== 'asset' || typeof asset.source !== 'string') {
        return;
      }
      const regex =
        /<!DOCTYPE html>\s*<html[^>]*>\s*<head>([\s\S]*?)<!--head-->([\s\S]*?)<\/head>\s*<body>([\s\S]*?)<!--body-->([\s\S]*?)<\/body>\s*<\/html>/i;
      const match = asset.source.match(regex);
      if (!match) {
        return;
      }

      const afterHeadBegin = match[1];
      const beforeHeadEnd = match[2];
      const afterBodyBegin = match[3];
      const beforeBodyEnd = match[4];

      const headContent = (afterHeadBegin + beforeHeadEnd)
        // boolean attributes to empty string
        .replace(/\b(crossorigin|defer|async|disabled|checked)\b(?!=)/g, (_, $1: string) => `${$1}=""`)
        // convert attributes to single quotes safely
        .replace(/(\w+)=(".*?"|'.*?')/g, (_, $1: string, $2: string) => {
          const v = $2
            // remove quotes
            .slice(1, -1)
            // escape special XML chars
            .replace(/&/g, '&amp;')
            .replace(/'/g, '&apos;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `${$1}='${v}'`;
        })
        // self-close void tags
        .replace(/<(link|meta|img|br|hr|input)([^>]*?)>/gi, (_, $1: string, $2: string) => `<${$1}${$2} />`)
        // remove whitespace between tags
        .replace(/>\s+</g, '><')
        // trim overall
        .trim();

      const originalTemplateXmlContent = fs.readFileSync(ctx.template, 'utf8');
      const modifiedTemplateXmlContent = replaceBloggerPluginHeadComment(originalTemplateXmlContent, headContent, true);

      const templateTagsXmlContent = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html>
<head>
  <!--head:afterbegin:begin-->

  <!--head:afterbegin:end-->

  <!--head:beforeend:begin-->
  ${headContent}
  <!--head:beforeend:end-->
</head>
<body>
  <!--body:afterbegin:begin-->
  ${afterBodyBegin.trim()}
  <!--body:afterbegin:end-->

  <!--body:beforeend:begin-->
  ${beforeBodyEnd.trim()}
  <!--body:beforeend:end-->
</body>
</html>`;

      fs.writeFileSync(path.resolve(ctx.viteConfig.build.outDir, 'template.xml'), modifiedTemplateXmlContent);
      fs.writeFileSync(path.resolve(ctx.viteConfig.build.outDir, 'template-tags.xml'), templateTagsXmlContent);
    },
    closeBundle() {
      const htmlDir = path.resolve(ctx.viteConfig.build.outDir, 'virtual:blogger-plugin');
      if (fs.existsSync(htmlDir)) {
        fs.rmSync(htmlDir, { recursive: true });
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
