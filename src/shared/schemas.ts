import { z } from 'zod';

const localMediaPath = z.string().regex(/^\/media\/[a-f0-9-]+\.(png|jpe?g|webp)$/i);

const detailRailSchema = z.object({
  recentPostsLimit: z.number().int().min(1).max(12),
  thumbnailLimit: z.number().int().min(1).max(12),
  desktopWidth: z.number().int().min(280).max(440).default(340),
  article: z.object({ side: z.enum(['left', 'right']) }),
  gallery: z.object({ side: z.enum(['left', 'right']) }),
});

const homeHeroSchema = z.object({
  minHeight: z.number().int().min(520).max(900).default(680),
  titleAlign: z.enum(['left', 'center']).default('left'),
  contentOffset: z.number().int().min(-180).max(180).default(0),
});

const browsingBaseFields = {
  railSide: z.enum(['left', 'right']),
  railWidth: z.number().int().min(280).max(440),
  showRecentPosts: z.boolean(),
  recentPostsLimit: z.number().int().min(1).max(12),
  showRecentGallery: z.boolean(),
  recentGalleryLimit: z.number().int().min(1).max(20),
};

const legacyBrowsingBaseFields = {
  ...browsingBaseFields,
  recentGalleryLimit: z.number().int().min(1).max(12),
};

const browsingSchema = z.object({
  article: z.object({
    ...browsingBaseFields,
    contentWidth: z.number().int().min(600).max(1100),
  }),
  gallery: z.object({
    ...browsingBaseFields,
    mediaWidth: z.number().int().min(560).max(1100),
    portraitMaxHeight: z.number().int().min(560).max(1200),
    thumbnailColumns: z.number().int().min(1).max(5),
    thumbnailRows: z.number().int().min(1).max(4),
  }),
});

const sharedSettingsFields = {
  siteName: z.string().trim().min(1).max(80),
  homeTitle: z.string().trim().min(1).max(120).default('CocyNoric‘s Blog'),
  footerText: z.string().trim().min(1).max(120).default('CocyNoric‘s Blog'),
  description: z.string().trim().max(240),
  backgroundImage: localMediaPath.nullable(),
  backgroundPosition: z.enum(['center', 'top', 'bottom']),
  backgroundOverlay: z.number().min(0).max(1),
  backgroundBlur: z.number().int().min(0).max(16),
  seedColor: z.string().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toLowerCase()),
  contentWidth: z.enum(['narrow', 'standard', 'wide']),
  cardDensity: z.enum(['compact', 'comfortable']),
  bodyFontSize: z.number().int().min(14).max(22),
};

const legacySettingsFields = {
  ...sharedSettingsFields,
  avatar: localMediaPath.nullable(),
};

const settingsV1Schema = z.object({
  version: z.literal(1).default(1),
  ...legacySettingsFields,
});

const settingsV2Schema = z.object({
  version: z.literal(2),
  ...legacySettingsFields,
  detailRail: detailRailSchema,
});

const settingsV3Schema = z.object({
  version: z.literal(3),
  ...sharedSettingsFields,
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  detailRail: detailRailSchema,
});

const settingsV4Schema = z.object({
  version: z.literal(4),
  ...sharedSettingsFields,
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  browsing: z.object({
    article: z.object({
      ...legacyBrowsingBaseFields,
      contentWidth: z.number().int().min(600).max(880),
    }),
    gallery: z.object({
      ...legacyBrowsingBaseFields,
      mediaWidth: z.number().int().min(560).max(880),
    }),
  }),
});

const settingsV5Schema = z.object({
  version: z.literal(5),
  ...sharedSettingsFields,
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  browsing: browsingSchema,
});

const defaultDetailRail = {
  recentPostsLimit: 4,
  thumbnailLimit: 6,
  desktopWidth: 340,
  article: { side: 'left' as const },
  gallery: { side: 'right' as const },
};

function upgradeLegacySettings(legacy: z.infer<typeof settingsV2Schema>) {
  const { avatar, ...settings } = legacy;
  return settingsV3Schema.parse({
    ...settings,
    version: 3,
    profileName: legacy.siteName,
    profileAvatar: avatar,
    webIcon: avatar,
  });
}

function upgradeV4Settings(legacy: z.infer<typeof settingsV4Schema>) {
  return settingsV5Schema.parse({
    ...legacy,
    version: 5,
    browsing: {
      article: {
        ...legacy.browsing.article,
        contentWidth: legacy.browsing.article.contentWidth,
      },
      gallery: {
        ...legacy.browsing.gallery,
        portraitMaxHeight: 880,
        thumbnailColumns: 2,
        thumbnailRows: 3,
      },
    },
  });
}

function upgradeV3Settings(legacy: z.infer<typeof settingsV3Schema>) {
  const { detailRail, ...settings } = legacy;
  return upgradeV4Settings(settingsV4Schema.parse({
    ...settings,
    version: 4,
    browsing: {
      article: {
        railSide: detailRail.article.side,
        railWidth: detailRail.desktopWidth,
        showRecentPosts: true,
        recentPostsLimit: detailRail.recentPostsLimit,
        showRecentGallery: false,
        recentGalleryLimit: detailRail.thumbnailLimit,
        contentWidth: 820,
      },
      gallery: {
        railSide: detailRail.gallery.side,
        railWidth: detailRail.desktopWidth,
        showRecentPosts: true,
        recentPostsLimit: detailRail.recentPostsLimit,
        showRecentGallery: true,
        recentGalleryLimit: detailRail.thumbnailLimit,
        mediaWidth: 705,
      },
    },
  }));
}

export const settingsSchema = z.union([
  settingsV5Schema,
  settingsV4Schema.transform(upgradeV4Settings),
  settingsV3Schema.transform(upgradeV3Settings),
  settingsV2Schema.transform((legacy) => upgradeV3Settings(upgradeLegacySettings(legacy))),
  settingsV1Schema.transform((legacy) => upgradeV3Settings(upgradeLegacySettings({ ...legacy, version: 2, detailRail: defaultDetailRail }))),
]);

export function migrateSettings(raw: unknown): SiteSettings {
  return settingsSchema.parse(raw);
}

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

const thumbnailFocusSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  size: z.number().finite().min(0.1).max(1).default(1),
});

export const galleryItemSchema = z.object({
  id: z.string().uuid(),
  url: localMediaPath,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240),
  createdAt: z.string().datetime(),
  thumbnailFocus: thumbnailFocusSchema.default({ x: 0.5, y: 0.5, size: 1 }),
});

export const galleryInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(''),
  thumbnailFocus: thumbnailFocusSchema.optional(),
});

export const galleryUploadInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(''),
  thumbnailFocusX: z.coerce.number().finite().min(0).max(1).default(0.5),
  thumbnailFocusY: z.coerce.number().finite().min(0).max(1).default(0.5),
  thumbnailFocusSize: z.coerce.number().finite().min(0.1).max(1).default(1),
}).transform(({ title, description, thumbnailFocusX, thumbnailFocusY, thumbnailFocusSize }) => ({
  title,
  description,
  thumbnailFocus: { x: thumbnailFocusX, y: thumbnailFocusY, size: thumbnailFocusSize },
}));

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
