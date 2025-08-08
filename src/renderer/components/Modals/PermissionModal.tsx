import React from 'react';
import { motion } from 'framer-motion';
import { Shield, X } from 'lucide-react';
import { PermissionRequest } from '../../stores/useStore';
import './PermissionModal.css';

interface PermissionModalProps {
  request: PermissionRequest;
  onResponse: (response: 'allow' | 'deny' | 'always') => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ request, onResponse }) => {
  return (
    <motion.div 
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="permission-modal"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <div className="modal-header">
          <Shield size={20} />
          <h3>Tool Permission Request</h3>
          <button 
            className="modal-close"
            onClick={() => onResponse('deny')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="permission-info">
            <p className="permission-tool">Tool: <strong>{request.tool}</strong></p>
            <p className="permission-description">
              Claude wants to use this tool to perform an action.
            </p>
          </div>

          {request.parameters && (
            <div className="permission-details">
              <h4>Details:</h4>
              <pre>{JSON.stringify(request.parameters, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="btn-deny"
            onClick={() => onResponse('deny')}
          >
            Deny
          </button>
          <button 
            className="btn-allow-once"
            onClick={() => onResponse('allow')}
          >
            Allow Once
          </button>
          <button 
            className="btn-allow-always"
            onClick={() => onResponse('always')}
          >
            Always Allow
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};