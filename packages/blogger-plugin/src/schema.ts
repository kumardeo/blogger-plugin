import { z } from 'zod';

export const BloggerPluginOptionsSchema = z
  .object({
    entry: z.string().optional(),
    template: z.string().optional(),
    proxyBlog: z.url(),
  })
  .strict();

export type BloggerPluginOptions = z.infer<typeof BloggerPluginOptionsSchema>;
