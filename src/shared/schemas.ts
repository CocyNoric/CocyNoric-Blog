import { z } from 'zod';

const localMediaPath = z.string().regex(/^\/media\/[a-f0-9-]+\.(png|jpe?g|webp)$/i);

export const settingsSchema = z.object({
  version: z.literal(1).default(1),
  siteName: z.string().trim().min(1).max(80),
  homeTitle: z.string().trim().min(1).max(120).default('CocyNoric‘s Blog'),
  footerText: z.string().trim().min(1).max(120).default('CocyNoric‘s Blog'),
  description: z.string().trim().max(240),
  avatar: localMediaPath.nullable(),
  backgroundImage: localMediaPath.nullable(),
  backgroundPosition: z.enum(['center', 'top', 'bottom']),
  backgroundOverlay: z.number().min(0).max(1),
  backgroundBlur: z.number().int().min(0).max(16),
  seedColor: z.string().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toLowerCase()),
  contentWidth: z.enum(['narrow', 'standard', 'wide']),
  cardDensity: z.enum(['compact', 'comfortable']),
  bodyFontSize: z.number().int().min(14).max(22),
});

export const postStatusSchema = z.enum(['draft', 'published']);

export const postMetaSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().max(320),
  date: z.string().date(),
  updatedAt: z.string().datetime(),
  status: postStatusSchema,
  tags: z.array(z.string().trim().min(1).max(32)).max(12),
});

export const postInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().max(320),
  date: z.string().date(),
  status: postStatusSchema,
  tags: z.array(z.string().trim().min(1).max(32)).max(12),
  markdown: z.string().max(1024 * 1024),
  version: z.string().optional(),
});

export const galleryItemSchema = z.object({
  id: z.string().uuid(),
  url: localMediaPath,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240),
  createdAt: z.string().datetime(),
});

export const galleryInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(''),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(512),
});

export const previewSchema = z.object({
  markdown: z.string().max(1024 * 1024),
});

export type SiteSettings = z.infer<typeof settingsSchema>;
export type PostMeta = z.infer<typeof postMetaSchema>;
export type PostInput = z.infer<typeof postInputSchema>;
export type GalleryItem = z.infer<typeof galleryItemSchema>;
export type GalleryInput = z.infer<typeof galleryInputSchema>;
