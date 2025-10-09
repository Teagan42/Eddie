import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LayoutPreferencesDto } from "@eddie/api-client";
import { useApi } from "@/api/api-provider";

const STORAGE_KEY = "eddie.layoutPreferences.v1";

function createDefaults(): LayoutPreferencesDto {
  return {
    chat: {
      collapsedPanels: {},
      sessionSettings: {},
      templates: {},
    },
    updatedAt: new Date().toISOString(),
  };
}

function readLocalStorage(): LayoutPreferencesDto {
  if (typeof window === "undefined") {
    return createDefaults();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaults();
    }
    const parsed = JSON.parse(raw) as LayoutPreferencesDto;
    return mergePreferences(createDefaults(), parsed);
  } catch (error) {
    console.warn("Failed to parse layout preferences", error);
    return createDefaults();
  }
}

function writeLocalStorage(value: LayoutPreferencesDto): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Failed to persist layout preferences", error);
  }
}

function mergePreferences(
  current: LayoutPreferencesDto,
  update: LayoutPreferencesDto
): LayoutPreferencesDto {
  const next: LayoutPreferencesDto = {
    updatedAt: update.updatedAt ?? current.updatedAt ?? new Date().toISOString(),
    chat: {
      selectedSessionId: update.chat?.selectedSessionId ?? current.chat?.selectedSessionId,
      collapsedPanels: {
        ...(current.chat?.collapsedPanels ?? {}),
        ...(update.chat?.collapsedPanels ?? {}),
      },
      sessionSettings: {
        ...(current.chat?.sessionSettings ?? {}),
        ...(update.chat?.sessionSettings ?? {}),
      },
      templates: {
        ...(current.chat?.templates ?? {}),
        ...(update.chat?.templates ?? {}),
      },
    },
  };

  return next;
}

export interface UseLayoutPreferencesResult {
  preferences: LayoutPreferencesDto;
  updatePreferences: (
    updater: (previous: LayoutPreferencesDto) => LayoutPreferencesDto
  ) => void;
  isSyncing: boolean;
  isRemoteAvailable: boolean;
}

export function useLayoutPreferences(): UseLayoutPreferencesResult {
  const api = useApi();
  const queryClient = useQueryClient();
  const [localPreferences, setLocalPreferences] = useState<LayoutPreferencesDto>(
    () => readLocalStorage()
  );

  const remoteQuery = useQuery({
    queryKey: ["layout-preferences"],
    queryFn: () => api.http.preferences.getLayout(),
  });

  useEffect(() => {
    if (remoteQuery.data) {
      setLocalPreferences((previous) => {
        const merged = mergePreferences(previous, remoteQuery.data);
        writeLocalStorage(merged);
        return merged;
      });
    }
  }, [remoteQuery.data]);

  const syncMutation = useMutation({
    mutationFn: (input: LayoutPreferencesDto) =>
      api.http.preferences.updateLayout(input),
    onSuccess: (payload) => {
      writeLocalStorage(payload);
      queryClient.setQueryData(["layout-preferences"], payload);
      setLocalPreferences(payload);
    },
  });

  const updatePreferences = useCallback(
    (updater: (previous: LayoutPreferencesDto) => LayoutPreferencesDto) => {
      setLocalPreferences((previous) => {
        const next = updater(previous);
        writeLocalStorage(next);
        syncMutation.mutate(next, {
          onError: (error) => {
            console.warn("Failed to sync layout preferences", error);
          },
        });
        return next;
      });
    },
    [syncMutation]
  );

  const isRemoteAvailable = useMemo(() => !remoteQuery.isError, [remoteQuery.isError]);

  return {
    preferences: localPreferences,
    updatePreferences,
    isSyncing: syncMutation.isPending,
    isRemoteAvailable,
  };
}
