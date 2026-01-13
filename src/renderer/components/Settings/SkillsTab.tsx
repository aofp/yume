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
  IconFile
} from '@tabler/icons-react';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { PluginBadge } from '../common/PluginBadge';
import { pluginService } from '../../services/pluginService';
import { invoke } from '@tauri-apps/api/core';
import { appStorageKey } from '../../config/app';
import './SkillsTab.css';

interface Skill {
  name: string;
  description: string;
  source: 'plugin' | 'custom';
  pluginName?: string;
  pluginId?: string;
  filePath?: string;
  enabled: boolean;
}

interface SkillsTabProps {
  onSkillChange?: () => void;
}

const CUSTOM_SKILLS_KEY = appStorageKey('custom_skills', '_');

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
  }>({ isOpen: false, skill: null, isNew: false });

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

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

      // Load custom skills from localStorage
      const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
      const customSkills: Skill[] = customSkillsJson
        ? JSON.parse(customSkillsJson)
        : [];

      // Combine all skills
      const allSkills: Skill[] = [
        ...pluginSkills.map(s => ({
          name: s.name,
          description: s.description,
          source: 'plugin' as const,
          pluginName: s.pluginName,
          pluginId: s.pluginId,
          filePath: s.filePath,
          enabled: true // Plugin skills are enabled when plugin is enabled
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

  const toggleSkill = async (skillName: string, enabled: boolean) => {
    const skill = skills.find(s => s.name === skillName);
    if (!skill || skill.source === 'plugin') return; // Can't toggle plugin skills individually

    setTogglingSkills(prev => new Set(prev).add(skillName));

    try {
      // Update custom skill enabled state
      const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
      const customSkills: Skill[] = customSkillsJson ? JSON.parse(customSkillsJson) : [];

      const updatedSkills = customSkills.map(s =>
        s.name === skillName ? { ...s, enabled } : s
      );

      localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(updatedSkills));

      // Sync to filesystem
      if (enabled) {
        await syncSkillToFilesystem(skill);
      } else {
        await removeSkillFromFilesystem(skill);
      }

      setSkills(prev => prev.map(s =>
        s.name === skillName ? { ...s, enabled } : s
      ));

      showNotification(`skill ${enabled ? 'enabled' : 'disabled'}`, 'success');
      onSkillChange?.();
    } catch (error) {
      console.error('Failed to toggle skill:', error);
      showNotification('failed to update skill', 'error');
    } finally {
      setTogglingSkills(prev => {
        const next = new Set(prev);
        next.delete(skillName);
        return next;
      });
    }
  };

  const syncSkillToFilesystem = async (skill: Skill) => {
    // Create skill file in ~/.claude/skills/
    try {
      const content = `---
name: ${skill.name}
description: ${skill.description}
---

# ${skill.name}

${skill.description}
`;
      await invoke('write_skill_file', {
        name: skill.name.replace(/\s+/g, '-').toLowerCase(),
        content
      });
    } catch (error) {
      console.warn('Failed to sync skill to filesystem:', error);
    }
  };

  const removeSkillFromFilesystem = async (skill: Skill) => {
    try {
      await invoke('remove_skill_file', {
        name: skill.name.replace(/\s+/g, '-').toLowerCase()
      });
    } catch (error) {
      console.warn('Failed to remove skill from filesystem:', error);
    }
  };

  const createSkill = () => {
    setEditModal({
      isOpen: true,
      skill: {
        name: '',
        description: '',
        source: 'custom',
        enabled: true
      },
      isNew: true
    });
  };

  const editSkill = (skill: Skill) => {
    if (skill.source === 'plugin') return; // Can't edit plugin skills
    setEditModal({
      isOpen: true,
      skill: { ...skill },
      isNew: false
    });
  };

  const saveSkill = async (skill: Skill) => {
    try {
      const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
      let customSkills: Skill[] = customSkillsJson ? JSON.parse(customSkillsJson) : [];

      if (editModal.isNew) {
        // Check for duplicate name
        if (skills.some(s => s.name.toLowerCase() === skill.name.toLowerCase())) {
          showNotification('skill name already exists', 'error');
          return;
        }
        customSkills.push(skill);
      } else {
        customSkills = customSkills.map(s =>
          s.name === editModal.skill?.name ? skill : s
        );
      }

      localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(customSkills));

      // Sync to filesystem if enabled
      if (skill.enabled) {
        await syncSkillToFilesystem(skill);
      }

      await loadSkills();
      setEditModal({ isOpen: false, skill: null, isNew: false });
      showNotification(editModal.isNew ? 'skill created' : 'skill updated', 'success');
      onSkillChange?.();
    } catch (error) {
      console.error('Failed to save skill:', error);
      showNotification('failed to save skill', 'error');
    }
  };

  const deleteSkill = (skill: Skill) => {
    if (skill.source === 'plugin') return; // Can't delete plugin skills

    setConfirmModal({
      isOpen: true,
      title: 'delete skill',
      message: `delete "${skill.name}"?`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          const customSkillsJson = localStorage.getItem(CUSTOM_SKILLS_KEY);
          let customSkills: Skill[] = customSkillsJson ? JSON.parse(customSkillsJson) : [];

          customSkills = customSkills.filter(s => s.name !== skill.name);
          localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(customSkills));

          // Remove from filesystem
          await removeSkillFromFilesystem(skill);

          setSkills(prev => prev.filter(s => s.name !== skill.name));
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

      {/* Edit Modal */}
      {editModal.isOpen && editModal.skill && (
        <div className="skill-edit-overlay" onClick={() => setEditModal({ isOpen: false, skill: null, isNew: false })}>
          <div className="skill-edit-modal" onClick={e => e.stopPropagation()}>
            <h4>{editModal.isNew ? 'create skill' : 'edit skill'}</h4>
            <div className="skill-edit-form">
              <label>
                name
                <input
                  type="text"
                  value={editModal.skill.name}
                  onChange={e => setEditModal(prev => ({
                    ...prev,
                    skill: prev.skill ? { ...prev.skill, name: e.target.value } : null
                  }))}
                  placeholder="skill name"
                />
              </label>
              <label>
                description
                <textarea
                  value={editModal.skill.description}
                  onChange={e => setEditModal(prev => ({
                    ...prev,
                    skill: prev.skill ? { ...prev.skill, description: e.target.value } : null
                  }))}
                  placeholder="what this skill provides..."
                  rows={4}
                />
              </label>
            </div>
            <div className="skill-edit-actions">
              <button
                className="skill-cancel-btn"
                onClick={() => setEditModal({ isOpen: false, skill: null, isNew: false })}
              >
                cancel
              </button>
              <button
                className="skill-save-btn"
                onClick={() => editModal.skill && saveSkill(editModal.skill)}
                disabled={!editModal.skill.name.trim()}
              >
                {editModal.isNew ? 'create' : 'save'}
              </button>
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
        skills are knowledge/context that agents can use. plugin skills are managed by their plugin.
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
                  <div key={`plugin-${skill.name}`} className="skill-item plugin">
                    <div className="skill-info">
                      <div className="skill-name-row">
                        <span className="skill-name">{skill.name}</span>
                        {skill.pluginName && (
                          <PluginBadge pluginName={skill.pluginName} size="small" />
                        )}
                      </div>
                      <div className="skill-description">{skill.description}</div>
                    </div>
                    <div className="skill-actions">
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
                  const isToggling = togglingSkills.has(skill.name);

                  return (
                    <div key={`custom-${skill.name}`} className={`skill-item custom ${skill.enabled ? 'enabled' : ''}`}>
                      <div className="skill-info">
                        <div className="skill-name-row">
                          <span className="skill-name">{skill.name}</span>
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
                          onClick={() => !isToggling && toggleSkill(skill.name, !skill.enabled)}
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
