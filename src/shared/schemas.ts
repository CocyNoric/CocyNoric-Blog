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
    thumbnailColumns: z.number().int().min(1).max(5),
    thumbnailRows: z.number().int().min(1).max(4),
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
  homeTitle: z.string().trim().min(1).max(120).default("CocyNoric's Blog"),
  footerText: z.string().trim().min(1).max(120).default("CocyNoric's Blog"),
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

const browsingV5Schema = z.object({
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

const settingsV5Schema = z.object({
  version: z.literal(5),
  ...sharedSettingsFields,
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  browsing: browsingV5Schema,
});

const settingsV6Schema = z.object({
  version: z.literal(6),
  ...sharedSettingsFields,
  footerMode: z.enum(['transparent', 'primary']),
  galleryDescription: z.string().trim().max(240),
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  browsing: browsingSchema,
});

const homeContentSchema = z.object({
  articleLimit: z.number().int().min(1).max(12),
  galleryLimit: z.number().int().min(1).max(20),
  articleSurfaceOpacity: z.number().finite().min(0).max(1),
  gallerySurfaceOpacity: z.number().finite().min(0).max(1),
});

const settingsV7Schema = z.object({
  version: z.literal(7),
  ...sharedSettingsFields,
  footerMode: z.enum(['transparent', 'primary']),
  galleryDescription: z.string().trim().max(240),
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  homeContent: homeContentSchema,
  browsing: browsingSchema,
});

const legacyRepositoryAppearanceSchema = z.object({
  backgroundImage: localMediaPath.nullable(),
  headingMinHeight: z.number().int().min(200).max(560),
  titleAlign: z.enum(['left', 'center']),
  contentOffset: z.number().int().min(-120).max(120),
  surfaceOpacity: z.number().finite().min(0.55).max(1),
  directoryLayout: z.enum(['grid', 'list']),
  showDescriptions: z.boolean(),
  showItemCounts: z.boolean(),
  showFileMetadata: z.boolean(),
});

const repositoryAppearanceSchema = legacyRepositoryAppearanceSchema.extend({
  showRecentUpdates: z.boolean(),
});

export const defaultRepositoryAppearance = {
  backgroundImage: null,
  headingMinHeight: 220,
  titleAlign: 'left',
  contentOffset: 0,
  surfaceOpacity: 1,
  directoryLayout: 'grid',
  showDescriptions: true,
  showItemCounts: true,
  showFileMetadata: true,
  showRecentUpdates: true,
} as const;

const settingsV8Schema = z.object({
  version: z.literal(8),
  ...sharedSettingsFields,
  footerMode: z.enum(['transparent', 'primary']),
  galleryDescription: z.string().trim().max(240),
  repositoryTitle: z.string().trim().min(1).max(120),
  repositoryDescription: z.string().trim().max(240),
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  homeContent: homeContentSchema,
  browsing: browsingSchema,
});

const settingsV9Schema = z.object({
  version: z.literal(9),
  ...sharedSettingsFields,
  footerMode: z.enum(['transparent', 'primary']),
  galleryDescription: z.string().trim().max(240),
  repositoryTitle: z.string().trim().min(1).max(120),
  repositoryDescription: z.string().trim().max(240),
  repositoryAppearance: legacyRepositoryAppearanceSchema,
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  homeContent: homeContentSchema,
  browsing: browsingSchema,
});

const settingsV10Schema = z.object({
  version: z.literal(10),
  ...sharedSettingsFields,
  footerMode: z.enum(['transparent', 'primary']),
  galleryDescription: z.string().trim().max(240),
  repositoryTitle: z.string().trim().min(1).max(120),
  repositoryDescription: z.string().trim().max(240),
  repositoryAppearance: repositoryAppearanceSchema,
  profileName: z.string().trim().min(1).max(80),
  profileAvatar: localMediaPath.nullable(),
  webIcon: localMediaPath.nullable(),
  homeHero: homeHeroSchema.default({ minHeight: 680, titleAlign: 'left', contentOffset: 0 }),
  homeContent: homeContentSchema,
  browsing: browsingSchema,
});

const defaultRepositorySettings = {
  repositoryTitle: '仓库',
  repositoryDescription: '代码、工具与项目归档。',
};

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

function upgradeV9Settings(legacy: z.infer<typeof settingsV9Schema>) {
  return settingsV10Schema.parse({
    ...legacy,
    version: 10,
    repositoryAppearance: {
      ...legacy.repositoryAppearance,
      showRecentUpdates: legacy.repositoryAppearance.showFileMetadata,
    },
  });
}

function upgradeV8Settings(legacy: z.infer<typeof settingsV8Schema>) {
  return upgradeV9Settings(settingsV9Schema.parse({
    ...legacy,
    version: 9,
    repositoryAppearance: defaultRepositoryAppearance,
  }));
}

function upgradeV7Settings(legacy: z.infer<typeof settingsV7Schema>) {
  return upgradeV8Settings(settingsV8Schema.parse({
    ...legacy,
    version: 8,
    ...defaultRepositorySettings,
  }));
}

function upgradeV6Settings(legacy: z.infer<typeof settingsV6Schema>) {
  return upgradeV7Settings(settingsV7Schema.parse({
    ...legacy,
    version: 7,
    homeContent: {
      articleLimit: 4,
      galleryLimit: 6,
      articleSurfaceOpacity: 0.94,
      gallerySurfaceOpacity: 0,
    },
  }));
}

function upgradeV5Settings(legacy: z.infer<typeof settingsV5Schema>) {
  return upgradeV6Settings(settingsV6Schema.parse({
    ...legacy,
    version: 6,
    footerMode: 'transparent',
    galleryDescription: '项目、作品与视觉记录。',
    browsing: {
      ...legacy.browsing,
      article: {
        ...legacy.browsing.article,
        thumbnailColumns: 2,
        thumbnailRows: 3,
      },
    },
  }));
}

function upgradeV4Settings(legacy: z.infer<typeof settingsV4Schema>) {
  return upgradeV5Settings(settingsV5Schema.parse({
    ...legacy,
    version: 5,
    browsing: {
      article: {
        ...legacy.browsing.article,
        thumbnailColumns: 2,
        thumbnailRows: 3,
        contentWidth: legacy.browsing.article.contentWidth,
      },
      gallery: {
        ...legacy.browsing.gallery,
        portraitMaxHeight: 880,
        thumbnailColumns: 2,
        thumbnailRows: 3,
      },
    },
  }));
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
  settingsV10Schema,
  settingsV9Schema.transform(upgradeV9Settings),
  settingsV8Schema.transform(upgradeV8Settings),
  settingsV7Schema.transform(upgradeV7Settings),
  settingsV6Schema.transform(upgradeV6Settings),
  settingsV5Schema.transform(upgradeV5Settings),
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

export const thumbnailAspectRatioSchema = z.enum([
  'original',
  '9:16',
  '16:9',
  '3:2',
  '2:3',
  '1:1',
  '1:2',
  '2:1',
  '3:4',
  '4:3',
]);

const thumbnailFocusSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  size: z.number().finite().min(0.1).max(1).default(1),
});

const cropPositioningSchema = z.enum(['legacy', 'center']);

const defaultThumbnailFocus = { x: 0.5, y: 0.5, size: 1 };

const legacyGalleryItemBaseSchema = z.object({
  id: z.string().uuid(),
  url: localMediaPath,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240),
  createdAt: z.string().datetime(),
  cardFocus: thumbnailFocusSchema.optional(),
  cardAspectRatio: thumbnailAspectRatioSchema.optional(),
  thumbnailFocus: thumbnailFocusSchema.optional(),
  thumbnailAspectRatio: thumbnailAspectRatioSchema.optional(),
  cropPositioning: cropPositioningSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const galleryIdSchema = z.string().regex(/^\d{8}$/);

export const galleryOrderInputSchema = z.object({
  ids: z.array(galleryIdSchema).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: '图片排序包含重复 ID' });
  }),
});

const galleryFilenameSchema = z.string()
  .min(1)
  .max(255)
  .regex(/^[^ -<>:"/\\|?*]+$/)
  .refine((value) => value !== '.' && value !== '..' && !/[. ]$/.test(value))
  .refine((value) => !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value));

const galleryItemBaseSchema = z.object({
  id: galleryIdSchema,
  legacyId: z.string().uuid().optional(),
  url: z.string().regex(/^\/media\/gallery\/\d{8}\/[^/?#]+$/).max(1024),
  originalFilename: galleryFilenameSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240),
  createdAt: z.string().datetime(),
  cardFocus: thumbnailFocusSchema.optional(),
  cardAspectRatio: thumbnailAspectRatioSchema.optional(),
  thumbnailFocus: thumbnailFocusSchema.optional(),
  thumbnailAspectRatio: thumbnailAspectRatioSchema.optional(),
  cropPositioning: cropPositioningSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

function normalizeGalleryItem<T extends z.infer<typeof legacyGalleryItemBaseSchema> | z.infer<typeof galleryItemBaseSchema>>(item: T) {
  const hasSplitConfiguration = item.cardFocus !== undefined || item.cardAspectRatio !== undefined;
  const legacyFocus = item.thumbnailFocus ?? defaultThumbnailFocus;
  const legacyAspectRatio = item.thumbnailAspectRatio ?? '4:3';

  return {
    ...item,
    cardFocus: item.cardFocus ?? legacyFocus,
    cardAspectRatio: item.cardAspectRatio ?? legacyAspectRatio,
    thumbnailFocus: hasSplitConfiguration
      ? (item.thumbnailFocus ?? defaultThumbnailFocus)
      : legacyFocus,
    thumbnailAspectRatio: hasSplitConfiguration
      ? (item.thumbnailAspectRatio ?? '1:1')
      : '1:1',
    cropPositioning: item.cropPositioning ?? 'legacy',
  };
}

export const legacyGalleryItemSchema = legacyGalleryItemBaseSchema.transform(normalizeGalleryItem);
export const galleryItemSchema = galleryItemBaseSchema.transform(normalizeGalleryItem);

export const galleryIndexSchema = z.object({
  version: z.literal(1),
  nextId: z.number().int().min(1).max(100_000_000),
  items: galleryItemSchema.array(),
});

export const galleryInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(''),
  cardFocus: thumbnailFocusSchema.optional(),
  cardAspectRatio: thumbnailAspectRatioSchema.optional(),
  thumbnailFocus: thumbnailFocusSchema.optional(),
  thumbnailAspectRatio: thumbnailAspectRatioSchema.optional(),
  cropPositioning: cropPositioningSchema.optional(),
});

export const galleryUploadInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(''),
  cardFocusX: z.coerce.number().finite().min(0).max(1).default(0.5),
  cardFocusY: z.coerce.number().finite().min(0).max(1).default(0.5),
  cardFocusSize: z.coerce.number().finite().min(0.1).max(1).default(1),
  cardAspectRatio: thumbnailAspectRatioSchema.default('original'),
  thumbnailFocusX: z.coerce.number().finite().min(0).max(1).default(0.5),
  thumbnailFocusY: z.coerce.number().finite().min(0).max(1).default(0.5),
  thumbnailFocusSize: z.coerce.number().finite().min(0.1).max(1).default(1),
  thumbnailAspectRatio: thumbnailAspectRatioSchema.default('1:1'),
  cropPositioning: cropPositioningSchema.default('center'),
}).transform(({ title, description, cardFocusX, cardFocusY, cardFocusSize, cardAspectRatio, thumbnailFocusX, thumbnailFocusY, thumbnailFocusSize, thumbnailAspectRatio, cropPositioning }) => ({
  title,
  description,
  cardAspectRatio,
  cardFocus: { x: cardFocusX, y: cardFocusY, size: cardFocusSize },
  thumbnailAspectRatio,
  thumbnailFocus: { x: thumbnailFocusX, y: thumbnailFocusY, size: thumbnailFocusSize },
  cropPositioning,
}));

const codeToolFilenameSchema = z.string()
  .min(1)
  .max(255)
  .regex(/^[^ -<>:"/\\|?*]+$/)
  .refine((value) => value === value.normalize('NFC'))
  .refine((value) => value !== '.' && value !== '..' && !/[. ]$/.test(value))
  .refine((value) => !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value))
  .refine((value) => new TextEncoder().encode(value).byteLength <= 240);

export const codeToolItemSchema = z.object({
  id: z.string().uuid(),
  originalFilename: codeToolFilenameSchema,
  size: z.number().int().min(0).max(20 * 1024 * 1024),
  mimeType: z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i).max(127).nullable(),
  mimeSource: z.enum(['detected', 'declared']).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
});

const codeToolProjectSlugSchema = z.string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

export const codeToolProjectFileSchema = z.object({
  id: z.string().uuid(),
  relativePath: z.string().min(1).max(1024),
  size: z.number().int().min(0).max(128 * 1024 * 1024),
  mimeType: z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i).max(127).nullable(),
  mimeSource: z.enum(['detected', 'declared']).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const codeToolProjectSchema = z.object({
  id: z.string().uuid(),
  slug: codeToolProjectSlugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  fileCount: z.number().int().min(0).max(1000),
  totalBytes: z.number().int().min(0).max(128 * 1024 * 1024),
  files: codeToolProjectFileSchema.array().max(1000),
});

export const legacyCodeToolsIndexSchema = z.object({
  version: z.literal(1),
  items: codeToolItemSchema.array().max(1000),
});

export const codeToolsIndexSchema = z.object({
  version: z.literal(2),
  items: codeToolItemSchema.array().max(1000),
  projects: codeToolProjectSchema.array().max(1000),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(512),
});

export const previewSchema = z.object({
  markdown: z.string().max(1024 * 1024),
});

export type SiteSettings = z.infer<typeof settingsSchema>;
export type ThumbnailAspectRatio = z.infer<typeof thumbnailAspectRatioSchema>;
export type PostMeta = z.infer<typeof postMetaSchema>;
export type PostInput = z.infer<typeof postInputSchema>;
export type GalleryItem = z.infer<typeof galleryItemSchema>;
export type GalleryIndex = z.infer<typeof galleryIndexSchema>;
export type GalleryOrderInput = z.infer<typeof galleryOrderInputSchema>;
export type GalleryInput = z.infer<typeof galleryInputSchema>;
export type CodeToolItem = z.infer<typeof codeToolItemSchema>;
export type CodeToolsIndex = z.infer<typeof codeToolsIndexSchema>;
export type CodeToolProjectFile = z.infer<typeof codeToolProjectFileSchema>;
export type CodeToolProject = z.infer<typeof codeToolProjectSchema>;
