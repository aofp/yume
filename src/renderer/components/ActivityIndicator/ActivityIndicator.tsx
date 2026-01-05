import React, { useMemo } from 'react';
import './ActivityIndicator.css';

export interface Activity {
  id: string;
  type: 'bash' | 'followup' | 'compact' | 'attachment' | 'thinking' | 'custom';
  label: string;
  preview?: string;
  priority?: number; // higher = shown first
}

interface ActivityIndicatorProps {
  activities: Activity[];
  maxVisible?: number;
}

export const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({
  activities,
  maxVisible = 3
}) => {
  const sortedActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, maxVisible);
  }, [activities, maxVisible]);

  if (sortedActivities.length === 0) return null;

  const hiddenCount = activities.length - sortedActivities.length;

  return (
    <div className="activity-indicator">
      {sortedActivities.map((activity) => (
        <div key={activity.id} className={`activity-item activity-${activity.type}`}>
          <span className="activity-label">{activity.label}</span>
          {activity.preview && (
            <span className="activity-preview">{activity.preview}</span>
          )}
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="activity-item activity-more">
          +{hiddenCount} more
        </div>
      )}
    </div>
  );
};

export default ActivityIndicator;
