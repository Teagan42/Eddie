import { Injectable } from "@nestjs/common";
import {
  ChatLayoutPreferencesDto,
  ChatSessionTemplateDto,
  LayoutPreferencesDto,
  SessionLayoutSettingsDto,
  UpdateLayoutPreferencesDto,
} from "./dto/layout-preferences.dto";

interface ResolvedLayoutPreferences extends LayoutPreferencesDto {
  chat: ChatLayoutPreferencesDto;
  updatedAt: string;
}

@Injectable()
export class UserPreferencesService {
  private readonly store = new Map<string, ResolvedLayoutPreferences>();

  getPreferences(userId: string): ResolvedLayoutPreferences {
    const existing = this.store.get(userId);
    if (existing) {
      return this.clone(existing);
    }
    const defaults = this.createDefaults();
    this.store.set(userId, defaults);
    return this.clone(defaults);
  }

  updatePreferences(
    userId: string,
    update: UpdateLayoutPreferencesDto
  ): ResolvedLayoutPreferences {
    const current = this.getPreferences(userId);
    const merged = this.merge(current, update);
    merged.updatedAt = new Date().toISOString();
    this.store.set(userId, merged);
    return this.clone(merged);
  }

  private createDefaults(): ResolvedLayoutPreferences {
    return {
      chat: {
        collapsedPanels: {},
        sessionSettings: {},
        templates: {},
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private clone(preferences: ResolvedLayoutPreferences): ResolvedLayoutPreferences {
    return {
      updatedAt: preferences.updatedAt,
      chat: {
        selectedSessionId: preferences.chat.selectedSessionId,
        collapsedPanels: {
          ...(preferences.chat.collapsedPanels ?? {}),
        },
        sessionSettings: this.cloneSessionSettings(
          preferences.chat.sessionSettings
        ),
        templates: this.cloneTemplates(preferences.chat.templates),
      },
    };
  }

  private merge(
    current: ResolvedLayoutPreferences,
    update: UpdateLayoutPreferencesDto
  ): ResolvedLayoutPreferences {
    const next = this.clone(current);

    if (!update.chat) {
      return next;
    }

    if (update.chat.selectedSessionId !== undefined) {
      next.chat.selectedSessionId = update.chat.selectedSessionId;
    }

    if (update.chat.collapsedPanels) {
      next.chat.collapsedPanels = {
        ...(next.chat.collapsedPanels ?? {}),
        ...update.chat.collapsedPanels,
      };
    }

    if (update.chat.sessionSettings) {
      next.chat.sessionSettings = this.mergeSettings(
        next.chat.sessionSettings ?? {},
        update.chat.sessionSettings
      );
    }

    if (update.chat.templates) {
      next.chat.templates = this.mergeTemplates(
        next.chat.templates ?? {},
        update.chat.templates
      );
    }

    return next;
  }

  private mergeSettings(
    current: Record<string, SessionLayoutSettingsDto>,
    update: Record<string, SessionLayoutSettingsDto>
  ): Record<string, SessionLayoutSettingsDto> {
    const result = this.cloneSessionSettings(current);
    for (const [sessionId, value] of Object.entries(update)) {
      if (!value) {
        // falsy values clear the preference for the session
        delete result[sessionId];
        continue;
      }
      const existing = result[sessionId] ?? {};
      result[sessionId] = {
        provider: value.provider ?? existing.provider,
        model: value.model ?? existing.model,
      };
    }
    return result;
  }

  private mergeTemplates(
    current: Record<string, ChatSessionTemplateDto>,
    update: Record<string, ChatSessionTemplateDto>
  ): Record<string, ChatSessionTemplateDto> {
    const result = this.cloneTemplates(current);
    for (const [templateId, template] of Object.entries(update)) {
      if (!template) {
        delete result[templateId];
        continue;
      }
      result[templateId] = this.cloneTemplate(template);
    }
    return result;
  }

  private cloneSessionSettings(
    settings?: Record<string, SessionLayoutSettingsDto>
  ): Record<string, SessionLayoutSettingsDto> {
    if (!settings) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(settings).map(([sessionId, value]) => [
        sessionId,
        this.cloneSessionSetting(value),
      ])
    );
  }

  private cloneSessionSetting(
    value: SessionLayoutSettingsDto
  ): SessionLayoutSettingsDto {
    return {
      provider: value.provider,
      model: value.model,
    };
  }

  private cloneTemplates(
    templates?: Record<string, ChatSessionTemplateDto>
  ): Record<string, ChatSessionTemplateDto> {
    if (!templates) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(templates).map(([templateId, template]) => [
        templateId,
        this.cloneTemplate(template),
      ])
    );
  }

  private cloneTemplate(template: ChatSessionTemplateDto): ChatSessionTemplateDto {
    return {
      id: template.id,
      name: template.name,
      provider: template.provider,
      model: template.model,
      prompt: template.prompt,
      createdAt: template.createdAt,
    };
  }
}
