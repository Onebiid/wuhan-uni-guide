import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createCampusSeeds } from '../data/seeds';
import { migrateLegacyExport, migrateLegacySnapshot, readLegacySnapshot, type MigrationResult } from '../data/legacy-migration';
import {
  createWorkspace,
  getActiveWorkspace,
  loadSnapshot,
  pendingMutationCount,
  restorePlace,
  saveMemory,
  savePlace,
  savePlaylist,
  saveRelationship,
  addEncryptedPhoto,
  tombstonePlace,
  unlockWorkspace,
  type DecryptedSnapshot,
  type UnlockedWorkspace,
} from '../data/repository';
import type { LocalWorkspace } from '../data/database';
import type { Memory, Place, PlaylistItem, RelationshipSettings } from '../domain/models';
import { syncWorkspace, type SyncOutcome } from '../services/sync';

type BootState = 'loading' | 'setup' | 'locked' | 'unlocked';

interface WorkspaceContextValue {
  bootState: BootState;
  workspace: LocalWorkspace | null;
  session: UnlockedWorkspace | null;
  snapshot: DecryptedSnapshot;
  migration: MigrationResult | null;
  pendingCount: number;
  error: string | null;
  syncStatus: SyncOutcome | 'syncing';
  setup: (passphrase: string, relationship: RelationshipSettings) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  upsertPlace: (place: Place) => Promise<Place>;
  deletePlace: (place: Place) => Promise<Place>;
  undoDeletePlace: (place: Place) => Promise<Place>;
  upsertMemory: (memory: Memory) => Promise<Memory>;
  updateRelationship: (value: RelationshipSettings) => Promise<void>;
  updatePlaylist: (value: PlaylistItem[]) => Promise<void>;
  addPhotos: (memory: Memory, files: File[]) => Promise<Memory>;
  refreshPendingCount: () => Promise<void>;
  syncNow: () => Promise<void>;
  importLegacyJson: (text: string) => Promise<MigrationResult>;
}

const emptySnapshot: DecryptedSnapshot = {
  places: [],
  memories: [],
  relationship: { metOn: null, togetherOn: null, autoLockMinutes: 15 },
  playlist: [],
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [bootState, setBootState] = useState<BootState>('loading');
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null);
  const [session, setSession] = useState<UnlockedWorkspace | null>(null);
  const [snapshot, setSnapshot] = useState<DecryptedSnapshot>(emptySnapshot);
  const [migration, setMigration] = useState<MigrationResult | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncOutcome | 'syncing'>(import.meta.env.VITE_SYNC_API ? 'pending' : 'disabled');
  const syncPromise = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    void getActiveWorkspace().then((value) => {
      if (!active) return;
      setWorkspace(value);
      setBootState(value ? 'locked' : 'setup');
    }).catch(() => {
      if (!active) return;
      setError('无法读取本机安全存储');
      setBootState('setup');
    });
    return () => { active = false; };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    if (!session) {
      setPendingCount(0);
      return;
    }
    setPendingCount(await pendingMutationCount(session.workspace.id));
  }, [session]);

  const load = useCallback(async (nextSession: UnlockedWorkspace) => {
    const nextSnapshot = await loadSnapshot(nextSession);
    setSession(nextSession);
    setWorkspace(nextSession.workspace);
    setSnapshot(nextSnapshot);
    setPendingCount(await pendingMutationCount(nextSession.workspace.id));
    setBootState('unlocked');
  }, []);

  const setup = useCallback(async (passphrase: string, relationship: RelationshipSettings) => {
    setError(null);
    try {
      const nextSession = await createWorkspace(passphrase);
      const legacy = migrateLegacySnapshot(readLegacySnapshot(localStorage), nextSession.deviceId);
      const places = legacy.places.length > 0 ? legacy.places : createCampusSeeds(nextSession.deviceId);
      for (const place of places) await savePlace(nextSession, place);
      await persistMigratedMemories(nextSession, legacy);
      await saveRelationship(nextSession, relationship);
      setMigration(legacy);
      await load(nextSession);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法创建安全空间');
      throw reason;
    }
  }, [load]);

  const unlock = useCallback(async (passphrase: string) => {
    if (!workspace) return;
    setError(null);
    try {
      await load(await unlockWorkspace(passphrase, workspace));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法解锁');
      throw reason;
    }
  }, [load, workspace]);

  const lock = useCallback(() => {
    setSession(null);
    setSnapshot(emptySnapshot);
    setMigration(null);
    setBootState(workspace ? 'locked' : 'setup');
  }, [workspace]);

  const upsertPlace = useCallback(async (place: Place) => {
    if (!session) throw new Error('Workspace is locked');
    const saved = await savePlace(session, place);
    setSnapshot((current) => ({ ...current, places: replaceById(current.places, saved) }));
    await refreshPendingCount();
    return saved;
  }, [refreshPendingCount, session]);

  const deletePlace = useCallback(async (place: Place) => {
    if (!session) throw new Error('Workspace is locked');
    const saved = await tombstonePlace(session, place);
    setSnapshot((current) => ({ ...current, places: current.places.filter((item) => item.id !== place.id) }));
    await refreshPendingCount();
    return saved;
  }, [refreshPendingCount, session]);

  const undoDeletePlace = useCallback(async (place: Place) => {
    if (!session) throw new Error('Workspace is locked');
    const saved = await restorePlace(session, place);
    setSnapshot((current) => ({ ...current, places: replaceById(current.places, saved) }));
    await refreshPendingCount();
    return saved;
  }, [refreshPendingCount, session]);

  const upsertMemory = useCallback(async (memory: Memory) => {
    if (!session) throw new Error('Workspace is locked');
    const saved = await saveMemory(session, memory);
    setSnapshot((current) => ({ ...current, memories: replaceById(current.memories, saved) }));
    await refreshPendingCount();
    return saved;
  }, [refreshPendingCount, session]);

  const updateRelationship = useCallback(async (value: RelationshipSettings) => {
    if (!session) throw new Error('Workspace is locked');
    await saveRelationship(session, value);
    setSnapshot((current) => ({ ...current, relationship: value }));
    await refreshPendingCount();
  }, [refreshPendingCount, session]);

  const updatePlaylist = useCallback(async (value: PlaylistItem[]) => {
    if (!session) throw new Error('Workspace is locked');
    await savePlaylist(session, value);
    setSnapshot((current) => ({ ...current, playlist: value }));
    await refreshPendingCount();
  }, [refreshPendingCount, session]);

  const addPhotos = useCallback(async (memory: Memory, files: File[]) => {
    if (!session) throw new Error('Workspace is locked');
    const remaining = Math.max(0, 9 - memory.photoIds.length);
    const ids: string[] = [];
    for (const file of files.slice(0, remaining)) ids.push(await addEncryptedPhoto(session, memory.id, file));
    return upsertMemory({ ...memory, photoIds: [...memory.photoIds, ...ids] });
  }, [session, upsertMemory]);

  const syncNow = useCallback(async () => {
    if (!session || syncPromise.current) return syncPromise.current ?? undefined;
    const operation = (async () => {
      setSyncStatus('syncing');
      const outcome = await syncWorkspace(session);
      setSyncStatus(outcome);
      setSnapshot(await loadSnapshot(session));
      setPendingCount(await pendingMutationCount(session.workspace.id));
    })();
    syncPromise.current = operation;
    try { await operation; } finally { syncPromise.current = null; }
  }, [session]);

  const importLegacyJson = useCallback(async (text: string) => {
    if (!session) throw new Error('Workspace is locked');
    const parsed: unknown = JSON.parse(text);
    const result = migrateLegacyExport(parsed, session.deviceId);
    for (const place of result.places) await savePlace(session, place);
    await persistMigratedMemories(session, result);
    setMigration(result);
    setSnapshot(await loadSnapshot(session));
    setPendingCount(await pendingMutationCount(session.workspace.id));
    return result;
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const online = () => { void syncNow(); };
    window.addEventListener('online', online);
    void syncNow();
    return () => window.removeEventListener('online', online);
  }, [session, syncNow]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    bootState, workspace, session, snapshot, migration, pendingCount, error, syncStatus,
    setup, unlock, lock, upsertPlace, deletePlace, undoDeletePlace, upsertMemory,
    updateRelationship, updatePlaylist, addPhotos, refreshPendingCount, syncNow, importLegacyJson,
  }), [
    bootState, workspace, session, snapshot, migration, pendingCount, error, syncStatus,
    setup, unlock, lock, upsertPlace, deletePlace, undoDeletePlace, upsertMemory,
    updateRelationship, updatePlaylist, addPhotos, refreshPendingCount, syncNow, importLegacyJson,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is missing');
  return value;
}

function replaceById<T extends { id: string }>(items: T[], value: T): T[] {
  const found = items.some((item) => item.id === value.id);
  return found ? items.map((item) => item.id === value.id ? value : item) : [...items, value];
}

async function persistMigratedMemories(session: UnlockedWorkspace, result: MigrationResult): Promise<void> {
  for (const memory of result.memories) {
    let saved = await saveMemory(session, memory);
    const sources = result.legacyPhotos.filter((photo) => photo.memoryId === memory.id).map((photo) => photo.source);
    const ids: string[] = [];
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      if (!source) continue;
      try {
        const response = await fetch(source);
        if (!response.ok) continue;
        const blob = await response.blob();
        const file = new File([blob], `legacy-photo-${index + 1}`, { type: blob.type || 'image/jpeg' });
        ids.push(await addEncryptedPhoto(session, memory.id, file));
      } catch {
        // The migration report preserves the record even when an external image is unavailable.
      }
    }
    if (ids.length > 0) saved = await saveMemory(session, { ...saved, photoIds: ids });
  }
}
