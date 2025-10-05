import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';

export function escapeHtml(str: string) {
  if (str === '') return '';
  return str.replace(/[&<>"'`]/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      case '`':
        return '&#96;';
      default:
        return ch;
    }
  });
}

export function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toWebHeaders(httpHeaders: IncomingHttpHeaders | OutgoingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(httpHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else {
      headers.set(name, String(value ?? ''));
    }
  }
  return headers;
}

export function replaceBloggerPluginHeadComment(input: string, replacement: string, bcomment = false) {
  if (bcomment) {
    return input.replace(
      /<b:comment><!--blogger-plugin:head:begin--><\/b:comment>[\s\S]*?<b:comment><!--blogger-plugin:head:end--><\/b:comment>/,
      `<b:comment><!--blogger-plugin:head:begin--></b:comment>${replacement}<b:comment><!--blogger-plugin:head:end--></b:comment>`,
    );
  }
  return input.replace(
    /<!--blogger-plugin:head:begin-->[\s\S]*?<!--blogger-plugin:head:end-->/,
    `<!--blogger-plugin:head:begin-->${replacement}<!--blogger-plugin:head:end-->`,
  );
}

export function getBloggerPluginHeadComment(input: string, bcomment = false) {
  if (bcomment) {
    return (
      input.match(/<b:comment><!--blogger-plugin:head:begin--><\/b:comment>([\s\S]*?)<b:comment><!--blogger-plugin:head:end--><\/b:comment>/)?.[1] ??
      null
    );
  }
  return input.match(/<!--blogger-plugin:head:begin-->([\s\S]*?)<!--blogger-plugin:head:end-->/)?.[1] ?? null;
}

export function replaceHost(input: string, oldHost: string, newHost: string, newProtocol?: string) {
  return input.replace(
    new RegExp(`(https?:)?(\\/\\/|\\\\/\\\\/)${escapeRegex(oldHost)}`, 'g'),
    (_, protocol, slash) => `${protocol ? (newProtocol ?? protocol) : ''}${slash ?? ''}${newHost}`,
  );
}

export function errorHtml(reqUrl: string) {
  return `<!DOCTYPE html>
<html>

<head>
  <meta charset='UTF-8'/>
  <meta content='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes' name='viewport'/>
  <title>500 Internal Server Error</title>
  <link rel='icon' href='data:,' />
  <style>
    *, ::before, ::after {
      box-sizing: border-box;
    }
    body {
      min-height: 100svh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", Segoe UI Symbol, "Noto Color Emoji";
    }
    .card {
      padding: 24px;
      background-color: #ffffff;
      border: 1px solid #e5e5e5;
      max-width: 448px;
      border-radius: 14px;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .card-content {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .card-title {
      font-weight: 600;
    }
    .card-description {
      font-size: 14px;
      opacity: 0.85;
    }
    .card-footer {
      display: flex;
      align-items: center;
    }
    .button {
      display: inline-flex;
      white-space: nowrap;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      font-weight: 500;
      background-color: #171717;
      outline: none;
      border: none;
      color: #ffffff;
      border-radius: 8px;
      min-height: 36px;
    }
    .button:hover {
      opacity: 0.9;
    }
    .button svg {
      wiheadersdth: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .card-footer .button {
      flex-grow: 1;
    }
  </style>
</head>

<body>
  <div class='card'>
    <div class='card-content'>
      <div class='card-title'>500 Internal Server Error</div>
      <div class='card-description'>Failed to fetch: ${escapeHtml(reqUrl)}</div>
    </div>
    <div class='card-footer'>
      <button class='button' type='button'>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-ccw" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg>
        Reload
      </button>
    </div>
  </div>
  <script>
    const button = document.getElementsByTagName('button')[0];
    button.addEventListener('click', () => {
      window.location.reload();
    });
  </script>
</body>

</html>`;
}
