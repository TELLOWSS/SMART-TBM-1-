import { TBMEntry, TeamOption } from '../types';

const normalizeList = (values: Array<string | null | undefined>) => {
  const unique = new Set<string>();
  values.forEach(value => {
    const trimmed = (value || '').trim();
    if (trimmed) unique.add(trimmed);
  });
  return Array.from(unique);
};

const splitLegacyTeamNames = (value?: string) => {
  const raw = (value || '').trim();
  if (!raw) return [];
  return normalizeList(raw.split(/\s*,\s*/g));
};

export const getEntryTeamIds = (entry: Partial<TBMEntry>) => {
  if (Array.isArray(entry.teamIds) && entry.teamIds.length > 0) {
    return normalizeList(entry.teamIds);
  }
  return normalizeList([entry.teamId]);
};

export const getEntryTeamNames = (entry: Partial<TBMEntry>, teams: TeamOption[] = []) => {
  const resolvedFromIds = getEntryTeamIds(entry)
    .map(teamId => teams.find(team => team.id === teamId)?.name || '')
    .filter(Boolean);

  const directNames = Array.isArray(entry.teamNames) && entry.teamNames.length > 0
    ? normalizeList(entry.teamNames)
    : splitLegacyTeamNames(entry.teamName);

  const merged = normalizeList([...resolvedFromIds, ...directNames]);
  if (merged.length > 0) return merged;

  const fallbackId = (entry.teamId || '').trim();
  return fallbackId ? [fallbackId] : [];
};

export const getEntryTeamLabel = (entry: Partial<TBMEntry>, teams: TeamOption[] = []) => {
  const names = getEntryTeamNames(entry, teams);
  if (names.length > 0) return names.join(', ');
  return '미지정 팀';
};

export const entryHasTeamName = (entry: Partial<TBMEntry>, targetName: string, teams: TeamOption[] = []) => {
  const normalizedTarget = targetName.trim();
  if (!normalizedTarget) return false;
  return getEntryTeamNames(entry, teams).some(teamName => teamName === normalizedTarget);
};

export const entryHasTeamId = (entry: Partial<TBMEntry>, targetId: string) => {
  const normalizedTarget = targetId.trim();
  if (!normalizedTarget) return false;
  return getEntryTeamIds(entry).some(teamId => teamId === normalizedTarget);
};

export const buildEntryTeamPayload = (selectedTeamIds: string[], teams: TeamOption[], fallbackNames: string[] = []) => {
  const teamIds = normalizeList(selectedTeamIds);
  let teamNames = teamIds.length > 0
    ? normalizeList(teamIds.map(teamId => teams.find(team => team.id === teamId)?.name || ''))
    : [];

  // If we couldn't resolve any team names from the current database, fall back to fallbackNames
  if (teamNames.length === 0 && fallbackNames.length > 0) {
    teamNames = normalizeList(fallbackNames);
  }

  return {
    teamId: teamIds[0] || '',
    teamName: teamNames.join(', '),
    teamIds,
    teamNames,
  };
};

export const getWorkDescriptionDisplay = (entry?: Partial<TBMEntry> | { sessionType?: string; time?: string; workDescription?: string }) => {
  if (!entry) return '내용 없음';
  const isAfternoon = entry.sessionType === 'AFTERNOON' || (!!entry.time && Number(entry.time.split(':')[0]) >= 12);
  const rawDesc = (entry.workDescription || '').trim();
  const isEmpty = !rawDesc || rawDesc === '작업없음' || rawDesc === '내용 없음' || rawDesc === '작업 내용 식별 불가';

  if (isAfternoon) {
    return isEmpty ? '오전과 동일함' : rawDesc;
  }
  return isEmpty ? '내용 없음' : rawDesc;
};