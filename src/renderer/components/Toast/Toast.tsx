// Global Toast component - renders at app root level
// Position: 64px from top, centered horizontally
// Only 1 toast at a time, no transitions

import React, { useState, useEffect } from 'react';
import { toastService } from '../../services/toastService';
import './Toast.css';

export const Toast: React.FC = () => {
  const [toast, setToast] = useState<{ message: string; type: string; id: number } | null>(null);

  useEffect(() => {
    return toastService.subscribe(setToast);
  }, []);

  if (!toast) return null;

  return (
    <div className={`global-toast ${toast.type}`} key={toast.id}>
      {toast.message}
    </div>
  );
};

export default Toast;
