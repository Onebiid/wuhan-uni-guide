import { placeSchema, type Place } from '../domain/models';

const campusSeeds = [
  ['preset_001', '工学部食堂', 'food', 30.5445, 114.3585, '工学部常用餐点'],
  ['preset_002', '桂园食堂', 'food', 30.5395, 114.362, '早餐和日常用餐'],
  ['preset_003', '樱花大道', 'entertainment', 30.541, 114.366, '春季校园散步路线'],
  ['preset_004', '图书馆总馆', 'study', 30.54, 114.363, '自习与阅读'],
  ['preset_005', '珞珈山', 'entertainment', 30.5358, 114.3655, '校园散步地点'],
] as const;

export function createCampusSeeds(deviceId: string, now = Date.now()): Place[] {
  return campusSeeds.map(([id, name, category, lat, lng, note]) => placeSchema.parse({
    id,
    name,
    category,
    lat,
    lng,
    note,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    deviceId,
    deletedAt: null,
  }));
}
