import React from 'react';
import './LoadingIndicator.css';

interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
  color?: 'red' | 'grey' | 'green';
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  size = 'medium',
  color = 'grey'
}) => {
  return (
    <div className={`loading-indicator loading-indicator--${size} loading-indicator--${color}`}>
      <div className="loading-indicator__container">
        <div className="loading-indicator__circle loading-indicator__circle--1" />
        <div className="loading-indicator__circle loading-indicator__circle--2" />
        <div className="loading-indicator__circle loading-indicator__circle--3" />
      </div>
    </div>
  );
};