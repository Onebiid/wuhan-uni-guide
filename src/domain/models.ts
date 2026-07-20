import { z } from 'zod';

export const categories = ['food', 'shopping', 'service', 'study', 'entertainment', 'memory', 'other'] as const;
export type Category = (typeof categories)[number];

export const categoryMeta: Record<Category, { label: string; color: string }> = {
  food: { label: '美食', color: '#a03f49' },
  shopping: { label: '购物', color: '#d18a3f' },
  service: { label: '生活', color: '#4c795a' },
  study: { label: '学习', color: '#203e77' },
  entertainment: { label: '约会', color: '#8b5c87' },
  memory: { label: '我们', color: '#b84f62' },
  other: { label: '其他', color: '#68747d' },
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.number().int().nonnegative();
const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

export const placeSchema = z.object({
  id: idSchema,
  category: z.enum(categories),
  name: z.string().trim().min(1).max(80),
  note: z.string().max(1000).default(''),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().nonnegative().default(0),
  deviceId: idSchema,
  deletedAt: timestampSchema.nullable().default(null),
});

export const memorySchema = z.object({
  id: idSchema,
  placeId: idSchema,
  title: z.string().trim().min(1).max(100),
  text: z.string().max(5000).default(''),
  occurredOn: isoDateSchema.nullable().default(null),
  photoIds: z.array(idSchema).max(9).default([]),
  frameNumber: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().nonnegative().default(0),
  deviceId: idSchema,
  deletedAt: timestampSchema.nullable().default(null),
});

export const relationshipSettingsSchema = z.object({
  metOn: isoDateSchema.nullable().default(null),
  togetherOn: isoDateSchema.nullable().default(null),
  autoLockMinutes: z.number().int().min(1).max(120).default(15),
});

export const playlistItemSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(160),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('remote'), url: z.string().url().refine(isSafeRemoteUrl, 'Unsupported media URL') }),
    z.object({ kind: z.literal('local'), mediaId: idSchema }),
  ]),
  order: z.number().int().nonnegative(),
  updatedAt: timestampSchema,
});

export type Place = z.infer<typeof placeSchema>;
export type Memory = z.infer<typeof memorySchema>;
export type RelationshipSettings = z.infer<typeof relationshipSettingsSchema>;
export type PlaylistItem = z.infer<typeof playlistItemSchema>;

export type SyncRecordKind = 'place' | 'memory' | 'settings' | 'playlist';
export type SyncableRecord = Place | Memory | RelationshipSettings | PlaylistItem[];

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function isSafeRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafeImageSource(value: string): boolean {
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('blob:')) return true;
  return isSafeRemoteUrl(value);
}
