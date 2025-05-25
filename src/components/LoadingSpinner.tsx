import React from 'react';

interface LoadingSpinnerProps {
  isVisible: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ isVisible }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div id="loading-spinner">
      <div className="spinner"></div>
      <p>Calculating orbital...</p>
    </div>
  );
};

export default LoadingSpinner;