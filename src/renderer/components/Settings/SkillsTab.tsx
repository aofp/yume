// SkillsTab - Skills management UI for settings modal
// Skills are context/knowledge that gets auto-injected based on triggers

import React, { useState, useEffect, useCallback } from 'react';
import {
  IconBolt,
  IconPlus,
  IconTrash,
  IconEdit,
  IconAlertCircle,
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconPuzzle,
  IconFile,
  IconSettings,
  IconFileText,
  IconTags
} from '@tabler/icons-react';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { PluginBadge } from '../Common/PluginBadge';
import { TriggerEditor } from './TriggerEditor';
import { ContentEditor } from './ContentEditor';
import { pluginService } from '../../services/pluginService';
import { invoke } from '@tauri-apps/api/core';
import { appStorageKey } from '../../config/app';
import type { Skill, SkillTriggers } from '../../types/skill';
import { DEFAULT_TRIGGERS, generateSkillId, skillToYaml, parseSkillYaml } from '../../types/skill';
import './SkillsTab.css';

interface SkillsTabProps {
  onSkillChange?: () => void;
}

// Legacy skill interface for migration
interface LegacySkill {
  name: string;
  description: string;
  source: 'plugin' | 'custom';
  pluginName?: string;
  pluginId?: string;
  filePath?: string;
  enabled: boolean;
}

const CUSTOM_SKILLS_KEY = appStorageKey('custom_skills', '_');
const SKILLS_VERSION_KEY = appStorageKey('skills_version', '_');
const CURRENT_VERSION = 2;

type ModalTab = 'general' | 'triggers' | 'content';

export const SkillsTab: React.FC<SkillsTabProps> = ({ onSkillChange }) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'error' | 'success' | 'info';
  } | null>(null);
  const [togglingSkills, setTogglingSkills] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    skill: Skill | null;
    isNew: boolean;
    activeTab: ModalTab;
  }>({ isOpen: false, skill: null, isNew: false, activeTab: 'general' });

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Migrate legacy skills to new format
  const migrateSkills = useCallback((legacySkills: LegacySkill[]): Skill[] => {
    return legacySkills.map(legacy => ({
      ...legacy,
      id: generateSkillId(legacy.name),
      triggers: { ...DEFAULT_TRIGGERS },
      content: legacy.description || '',
    }));
  }, []);

  // Load skills on mount
  useEffect(() => {
    loadSkills();
  }, []);

  // Clear notification after delay
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadSkills = async () => {
    try {
      setLoading(true);

      // Load plugin skills
      await pluginService.initialize();
      const pluginSkills = pluginService.getEnabledPluginSkills();

      // Check version and migrate if needed
      const storedVersion = localStorage.getItem(SKILLS_VERSION_KEY);
      const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
      let customSkills: Skill[] = [];

      if (customSkillsJson) {
        const parsed = JSON.parse(customSkillsJson);
        if (!storedVersion || parseInt(storedVersion) < CURRENT_VERSION) {
          // Migrate legacy skills
          customSkills = migrateSkills(parsed);
          localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(customSkills));
          localStorage.setItem(SKILLS_VERSION_KEY, String(CURRENT_VERSION));
        } else {
          customSkills = parsed;
        }
      }

      // Combine all skills
      const allSkills: Skill[] = [
        ...pluginSkills.map(s => ({
          id: s.id || generateSkillId(s.name),
          name: s.name,
          description: s.description,
          source: 'plugin' as const,
          pluginName: s.pluginName,
          pluginId: s.pluginId,
          filePath: s.filePath,
          enabled: true,
          triggers: s.triggers || { ...DEFAULT_TRIGGERS },
          content: s.content || '',
        })),
        ...customSkills
      ];

      setSkills(allSkills);
    } catch (error) {
      console.error('Failed to load skills:', error);
      showNotification('failed to load skills', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message: string, type: 'error' | 'success' | 'info') => {
    setNotification({ message, type });
  };

  const toggleSkill = async (skillId: string, enabled: boolean) => {
    const skill = skills.find(s => s.id === skillId);
    if (!skill || skill.source === 'plugin') return;

    setTogglingSkills(prev => new Set(prev).add(skillId));

    try {
      const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
      const customSkills: Skill[] = customSkillsJson ? JSON.parse(customSkillsJson) : [];

      const updatedSkills = customSkills.map(s =>
        s.id === skillId ? { ...s, enabled } : s
      );

      localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(updatedSkills));

      // Sync to filesystem
      if (enabled) {
        await syncSkillToFilesystem(skill);
      } else {
        await removeSkillFromFilesystem(skill);
      }

      setSkills(prev => prev.map(s =>
        s.id === skillId ? { ...s, enabled } : s
      ));

      showNotification(`skill ${enabled ? 'enabled' : 'disabled'}`, 'success');
      onSkillChange?.();
    } catch (error) {
      console.error('Failed to toggle skill:', error);
      showNotification('failed to update skill', 'error');
    } finally {
      setTogglingSkills(prev => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  const syncSkillToFilesystem = async (skill: Skill) => {
    try {
      const content = skillToYaml(skill);
      await invoke('write_skill_file', {
        name: skill.id,
        content
      });
    } catch (error) {
      console.warn('Failed to sync skill to filesystem:', error);
    }
  };

  const removeSkillFromFilesystem = async (skill: Skill) => {
    try {
      await invoke('remove_skill_file', {
        name: skill.id
      });
    } catch (error) {
      console.warn('Failed to remove skill from filesystem:', error);
    }
  };

  const createSkill = () => {
    setEditModal({
      isOpen: true,
      skill: {
        id: '',
        name: '',
        description: '',
        source: 'custom',
        enabled: true,
        triggers: { ...DEFAULT_TRIGGERS },
        content: '',
      },
      isNew: true,
      activeTab: 'general'
    });
  };

  const editSkill = (skill: Skill) => {
    if (skill.source === 'plugin') {
      // For plugin skills, open in read-only mode
      setEditModal({
        isOpen: true,
        skill: { ...skill },
        isNew: false,
        activeTab: 'general'
      });
    } else {
      setEditModal({
        isOpen: true,
        skill: { ...skill },
        isNew: false,
        activeTab: 'general'
      });
    }
  };

  const updateEditSkill = (updates: Partial<Skill>) => {
    setEditModal(prev => ({
      ...prev,
      skill: prev.skill ? { ...prev.skill, ...updates } : null
    }));
  };

  const updateEditTriggers = (triggers: SkillTriggers) => {
    updateEditSkill({ triggers });
  };

  const saveSkill = async (skill: Skill) => {
    try {
      // Generate ID if new
      if (!skill.id) {
        skill.id = generateSkillId(skill.name);
      }

      const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
      let customSkills: Skill[] = customSkillsJson ? JSON.parse(customSkillsJson) : [];

      if (editModal.isNew) {
        // Check for duplicate name
        if (skills.some(s => s.id === skill.id || s.name.toLowerCase() === skill.name.toLowerCase())) {
          showNotification('skill name already exists', 'error');
          return;
        }
        skill.createdAt = new Date().toISOString();
        customSkills.push(skill);
      } else {
        skill.updatedAt = new Date().toISOString();
        customSkills = customSkills.map(s =>
          s.id === editModal.skill?.id ? skill : s
        );
      }

      localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(customSkills));

      // Sync to filesystem if enabled
      if (skill.enabled) {
        await syncSkillToFilesystem(skill);
      }

      await loadSkills();
      setEditModal({ isOpen: false, skill: null, isNew: false, activeTab: 'general' });
      showNotification(editModal.isNew ? 'skill created' : 'skill updated', 'success');
      onSkillChange?.();
    } catch (error) {
      console.error('Failed to save skill:', error);
      showNotification('failed to save skill', 'error');
    }
  };

  const deleteSkill = (skill: Skill) => {
    if (skill.source === 'plugin') return;

    setConfirmModal({
      isOpen: true,
      title: 'delete skill',
      message: `delete "${skill.name}"?`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
          let customSkills: Skill[] = customSkillsJson ? JSON.parse(customSkillsJson) : [];

          customSkills = customSkills.filter(s => s.id !== skill.id);
          localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(customSkills));

          await removeSkillFromFilesystem(skill);

          setSkills(prev => prev.filter(s => s.id !== skill.id));
          showNotification('skill deleted', 'success');
          onSkillChange?.();
        } catch (error) {
          console.error('Failed to delete skill:', error);
          showNotification('failed to delete skill', 'error');
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const refreshSkills = async () => {
    await loadSkills();
    showNotification('skills refreshed', 'success');
  };

  if (loading) {
    return (
      <div className="skills-loading">
        <IconLoader2 size={16} className="spin" />
        <span>loading skills...</span>
      </div>
    );
  }

  const pluginSkills = skills.filter(s => s.source === 'plugin');
  const customSkills = skills.filter(s => s.source === 'custom');
  const isPluginSkill = editModal.skill?.source === 'plugin';

  return (
    <div className="skills-tab">
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="delete"
        cancelText="cancel"
        isDangerous={confirmModal.isDangerous}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Edit Modal - Enhanced with Tabs */}
      {editModal.isOpen && editModal.skill && (
        <div className="skill-edit-overlay" onClick={() => setEditModal({ isOpen: false, skill: null, isNew: false, activeTab: 'general' })} onContextMenu={(e) => e.preventDefault()}>
          <div className="skill-edit-modal skill-edit-modal-large" onClick={e => e.stopPropagation()}>
            <h4>{editModal.isNew ? 'create skill' : (isPluginSkill ? 'view skill' : 'edit skill')}</h4>

            {/* Tab Navigation */}
            <div className="skill-modal-tabs">
              <button
                className={`skill-modal-tab ${editModal.activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setEditModal(prev => ({ ...prev, activeTab: 'general' }))}
              >
                <IconSettings size={12} />
                general
              </button>
              <button
                className={`skill-modal-tab ${editModal.activeTab === 'triggers' ? 'active' : ''}`}
                onClick={() => setEditModal(prev => ({ ...prev, activeTab: 'triggers' }))}
              >
                <IconTags size={12} />
                triggers
              </button>
              <button
                className={`skill-modal-tab ${editModal.activeTab === 'content' ? 'active' : ''}`}
                onClick={() => setEditModal(prev => ({ ...prev, activeTab: 'content' }))}
              >
                <IconFileText size={12} />
                content
              </button>
            </div>

            {/* Tab Content */}
            <div className="skill-modal-content">
              {editModal.activeTab === 'general' && (
                <div className="skill-edit-form">
                  <label>
                    name
                    <input
                      type="text"
                      value={editModal.skill.name}
                      onChange={e => updateEditSkill({ name: e.target.value })}
                      placeholder="skill name"
                      disabled={isPluginSkill}
                    />
                  </label>
                  <label>
                    description
                    <textarea
                      value={editModal.skill.description}
                      onChange={e => updateEditSkill({ description: e.target.value })}
                      placeholder="what this skill provides..."
                      rows={3}
                      disabled={isPluginSkill}
                    />
                  </label>
                  {isPluginSkill && editModal.skill.pluginName && (
                    <div className="skill-plugin-info">
                      <span>from plugin: </span>
                      <PluginBadge pluginName={editModal.skill.pluginName} size="small" />
                    </div>
                  )}
                </div>
              )}

              {editModal.activeTab === 'triggers' && (
                <TriggerEditor
                  triggers={editModal.skill.triggers}
                  onChange={updateEditTriggers}
                  disabled={isPluginSkill}
                />
              )}

              {editModal.activeTab === 'content' && (
                <ContentEditor
                  content={editModal.skill.content}
                  onChange={(content) => updateEditSkill({ content })}
                  disabled={isPluginSkill}
                  placeholder="enter the context/knowledge to inject when triggered..."
                  minHeight={180}
                />
              )}
            </div>

            {/* Actions */}
            <div className="skill-edit-actions">
              <button
                className="skill-cancel-btn"
                onClick={() => setEditModal({ isOpen: false, skill: null, isNew: false, activeTab: 'general' })}
              >
                {isPluginSkill ? 'close' : 'cancel'}
              </button>
              {!isPluginSkill && (
                <button
                  className="skill-save-btn"
                  onClick={() => editModal.skill && saveSkill(editModal.skill)}
                  disabled={!editModal.skill.name.trim()}
                >
                  {editModal.isNew ? 'create' : 'save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`skills-notification ${notification.type}`}>
          {notification.type === 'error' && <IconAlertCircle size={12} />}
          {notification.type === 'success' && <IconCheck size={12} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="skills-header">
        <h4>skills</h4>
        <div className="skills-actions">
          <button
            className="skills-action-btn"
            onClick={refreshSkills}
            title="refresh"
          >
            <IconRefresh size={10} />
          </button>
          <button
            className="skills-action-btn"
            onClick={createSkill}
          >
            <IconPlus size={10} />
            add skill
          </button>
        </div>
      </div>

      <div className="skills-description">
        skills inject context when triggers match. configure triggers for extensions, keywords, or regex patterns.
      </div>

      {/* Skills List */}
      <div className="skills-list">
        {skills.length === 0 ? (
          <div className="no-skills">
            <IconBolt size={16} />
            <span>no skills configured</span>
            <p className="no-skills-hint">
              add custom skills or enable plugins with skills
            </p>
          </div>
        ) : (
          <>
            {/* Plugin Skills Section */}
            {pluginSkills.length > 0 && (
              <div className="skills-section">
                <div className="skills-section-header">
                  <IconPuzzle size={12} />
                  <span>from plugins</span>
                </div>
                {pluginSkills.map(skill => (
                  <div key={`plugin-${skill.id}`} className="skill-item plugin">
                    <div className="skill-info">
                      <div className="skill-name-row">
                        <span className="skill-name">{skill.name}</span>
                        {skill.pluginName && (
                          <PluginBadge pluginName={skill.pluginName} size="small" />
                        )}
                        {(skill.triggers.extensions.length > 0 || skill.triggers.keywords.length > 0 || skill.triggers.patterns.length > 0) && (
                          <span className="skill-trigger-count">
                            {skill.triggers.extensions.length + skill.triggers.keywords.length + skill.triggers.patterns.length} triggers
                          </span>
                        )}
                      </div>
                      <div className="skill-description">{skill.description}</div>
                    </div>
                    <div className="skill-actions">
                      <button
                        className="skill-edit-btn"
                        onClick={() => editSkill(skill)}
                        title="view"
                      >
                        <IconEdit size={12} />
                      </button>
                      <span className="skill-status enabled">active</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom Skills Section */}
            {customSkills.length > 0 && (
              <div className="skills-section">
                <div className="skills-section-header">
                  <IconFile size={12} />
                  <span>custom</span>
                </div>
                {customSkills.map(skill => {
                  const isToggling = togglingSkills.has(skill.id);
                  const triggerCount = skill.triggers.extensions.length + skill.triggers.keywords.length + skill.triggers.patterns.length;

                  return (
                    <div key={`custom-${skill.id}`} className={`skill-item custom ${skill.enabled ? 'enabled' : ''}`}>
                      <div className="skill-info">
                        <div className="skill-name-row">
                          <span className="skill-name">{skill.name}</span>
                          {triggerCount > 0 && (
                            <span className="skill-trigger-count">{triggerCount} triggers</span>
                          )}
                          {triggerCount === 0 && (
                            <span className="skill-trigger-warning">no triggers</span>
                          )}
                        </div>
                        <div className="skill-description">{skill.description}</div>
                      </div>
                      <div className="skill-actions">
                        <button
                          className="skill-edit-btn"
                          onClick={() => editSkill(skill)}
                          title="edit"
                        >
                          <IconEdit size={12} />
                        </button>
                        <div
                          className={`toggle-switch compact ${skill.enabled ? 'active' : ''} ${isToggling ? 'loading' : ''}`}
                          onClick={() => !isToggling && toggleSkill(skill.id, !skill.enabled)}
                        >
                          <span className="toggle-switch-label off">off</span>
                          <span className="toggle-switch-label on">on</span>
                          <div className="toggle-switch-slider" />
                        </div>
                        <button
                          className="skill-delete-btn"
                          onClick={() => deleteSkill(skill)}
                          title="delete"
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SkillsTab;
