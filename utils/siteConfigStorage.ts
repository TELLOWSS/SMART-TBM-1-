import { SiteConfig } from '../types';

export const SESSION_API_KEY_STORAGE_KEY = 'tbmUserApiKey';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const normalizeText = (value: unknown, fallback: string) => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
};

export const stripSensitiveSiteConfig = (config: SiteConfig) => ({
  siteName: config.siteName,
  managerName: config.managerName,
  linkageTargetRate: typeof config.linkageTargetRate === 'number' ? config.linkageTargetRate : 90,
});

export const persistSiteConfig = (config: SiteConfig) => {
  const trimmedKey = config.userApiKey?.trim() || null;
  localStorage.setItem('siteConfig', JSON.stringify(stripSensitiveSiteConfig(config)));

  if (trimmedKey) {
    sessionStorage.setItem(SESSION_API_KEY_STORAGE_KEY, trimmedKey);
  } else {
    sessionStorage.removeItem(SESSION_API_KEY_STORAGE_KEY);
  }
};

export const loadStoredSiteConfig = (fallback: SiteConfig): SiteConfig => {
  const sessionKey = sessionStorage.getItem(SESSION_API_KEY_STORAGE_KEY)?.trim() || '';
  const raw = localStorage.getItem('siteConfig');

  if (!raw) {
    return {
      ...fallback,
      userApiKey: sessionKey || null,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const publicConfig = isPlainObject(parsed) ? parsed : {};
    const legacyKey = typeof publicConfig.userApiKey === 'string' ? publicConfig.userApiKey.trim() : '';
    const resolvedKey = sessionKey || legacyKey || null;

    const normalized: SiteConfig = {
      siteName: normalizeText(publicConfig.siteName, fallback.siteName),
      managerName: normalizeText(publicConfig.managerName, fallback.managerName),
      userApiKey: resolvedKey,
      linkageTargetRate: typeof publicConfig.linkageTargetRate === 'number' && publicConfig.linkageTargetRate >= 0 && publicConfig.linkageTargetRate <= 100
        ? publicConfig.linkageTargetRate
        : (typeof fallback.linkageTargetRate === 'number' ? fallback.linkageTargetRate : 90),
    };

    if (legacyKey) {
      sessionStorage.setItem(SESSION_API_KEY_STORAGE_KEY, legacyKey);
    }

    persistSiteConfig(normalized);
    return normalized;
  } catch {
    return {
      ...fallback,
      userApiKey: sessionKey || null,
    };
  }
};
