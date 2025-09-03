import React from 'react';
import './SkeletonLoader.css';

interface SkeletonLoaderProps {
  type?: 'text' | 'bubble' | 'tab' | 'button' | 'card';
  width?: string | number;
  height?: string | number;
  count?: number;
  className?: string;
  animate?: boolean;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = 'text',
  width,
  height,
  count = 1,
  className = '',
  animate = true
}) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'bubble':
        return (
          <div className="skeleton-bubble">
            <div className="skeleton-avatar" />
            <div className="skeleton-content">
              <div className="skeleton-line" style={{ width: '60%' }} />
              <div className="skeleton-line" style={{ width: '100%' }} />
              <div className="skeleton-line" style={{ width: '80%' }} />
            </div>
          </div>
        );

      case 'tab':
        return (
          <div className="skeleton-tab" style={{ width: width || '120px' }}>
            <div className="skeleton-line" />
          </div>
        );

      case 'button':
        return (
          <div 
            className="skeleton-button" 
            style={{ 
              width: width || '100px',
              height: height || '32px'
            }}
          />
        );

      case 'card':
        return (
          <div className="skeleton-card">
            <div className="skeleton-line" style={{ width: '40%', height: '20px', marginBottom: '12px' }} />
            <div className="skeleton-line" style={{ width: '100%' }} />
            <div className="skeleton-line" style={{ width: '100%' }} />
            <div className="skeleton-line" style={{ width: '75%' }} />
          </div>
        );

      case 'text':
      default:
        return (
          <div 
            className="skeleton-line" 
            style={{ 
              width: width || '100%',
              height: height || '16px'
            }}
          />
        );
    }
  };

  return (
    <div className={`skeleton-loader ${animate ? 'animate' : ''} ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton-item">
          {renderSkeleton()}
        </div>
      ))}
    </div>
  );
};