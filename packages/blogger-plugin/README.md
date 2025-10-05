# Blogger Plugin

A plugin that allows you to use modern frontend frameworks inside a Blogger template.

## ✨ Features

- ✅ Supports **all major frontend frameworks** supported by Vite — including **React, Vue, Svelte, Solid**, and more.
- 🔄 Enables **local development** by proxying unhandled requests to a Blogger blog.
- 🧩 Works seamlessly with Vite’s dev server and build system.

## 📦 Installation

```shell
npm install blogger-plugin
```

## ⚡ Usage with Vite

**1**. **Create a new Blogger blog** for development and preview purposes.  
This blog will be used as a proxy target for unhandled requests during local development.

**2**. **Create a new Vite project** using your preferred frontend framework (React, Vue, Svelte, etc.):

```shell
npm create vite
```

**3**. **Create a Blogger XML template file**  
Inside your project's `src` directory, create a new file named `template.xml`.

**Head section**

Add the following code inside the `<head>` section of your Blogger template:

```xml
<b:if cond='data:blog.view contains &quot;-DevServer&quot; or data:blog.view contains &quot;-PreviewServer&quot;'>
  <!--blogger-plugin:head:begin--><!--blogger-plugin:head:end-->

  <b:else/>
  <b:comment><!--blogger-plugin:head:begin--></b:comment><b:comment><!--blogger-plugin:head:end--></b:comment>
</b:if>
```

This snippet ensures that **development and preview HTML tags** are correctly injected into the HTML content from the proxied blog, while **production HTML** tags are injected into the XML content.

**Body section**

Inside the `<body>`, add a root container for your frontend app:

```xml
<div id='root'></div>
```

or, depending on your framework:

```xml
<div id='app'></div>
```

This element will serve as the mounting point for your frontend framework.

**4**. **Add the template to your proxy Blogger blog**  
Open your proxy blog (the one used for local development), go to **Dashboard** → **Theme** → **Edit HTML**, and replace its contents with the template from your project's `template.xml` file.

This ensures that the Blogger Plugin can inject your app's assets during development and preview phases.

**5**. **Add the Blogger plugin** to your Vite configuration file (i.e. `vite.config.ts`, `vite.config.js`, etc.):

```ts
import react from "@vitejs/plugin-react-swc";
import blogger from "blogger-plugin/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    blogger({
      // Unhandled requests will be proxied to this Blogger blog
      proxyBlog: "https://example.blogspot.com",

      // (optional) Custom entry file path
      // Defaults to one of: src/{index|main}.{tsx|ts|jsx|js}
      // entry: "src/my-entry.ts",

      // (optional) Custom Blogger XML template path
      // Defaults to one of: src/{template|theme}.xml
      // template: "src/my-template.xml",
    }),
  ],
});
```

**6**. **Start the development server**

```shell
npm run dev
```

**7**. **Modify the template during development**

During development, you can **freely edit the XML** directly from the Blogger dashboard.  
The local dev server proxies all requests to your live blog and dynamically injects the latest HTML output, so you can preview live updates instantly.

> [!TIP]
> Once you're satisfied with the final template, copy the **dashboard XML** back into your project's `template.xml` before running your production build.

**8**. **Build for production**  
When you’re ready to build, run:

```shell
npm run build
```

After the build completes, a `template.xml` file will be generated inside your project's **output directory** (`outDir`), containing all **injected asset tags** (CSS, JS, and other resources) required by your framework.

You can then upload this generated XML to your main Blogger blog via **Theme** → **Edit HTML**.

## ☁️ Hosting Assets on a CDN

Since **Blogger doesn't allow** hosting custom static assets, you'll need to serve your built files (JS, CSS, images) from a third-party CDN, such as [jsDelivr](https://www.jsdelivr.com/), GitHub Pages, or Cloudflare Workers Static Assets.

To configure your asset URLs, specify a `base` path in your Vite config — for example:

```ts
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
});
```

Then, set the environment variable when building for production:

```shell
VITE_BASE="https://cdn.jsdelivr.net/gh/username/repo@version/" pnpm run build
```

This ensures all injected asset tags inside the generated `template.xml` point to your CDN-hosted files.

## 📌 Example

A fully working example using **React**, **jsDelivr**, and **GitHub Actions** is available in this GitHub repository:

https://github.com/kumardeo/react-blogger-template

The GitHub Actions workflow automatically:

1. Runs on commits to the `release` branch.
2. Builds the React app and generates `dist/template.xml`.
3. Commits all built assets and `template.xml` to the `static` branch.
4. Creates a new tag for jsDelivr so assets can be served via CDN.
