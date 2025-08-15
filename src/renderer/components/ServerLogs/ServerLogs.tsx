import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IconRefresh, IconCopy, IconX } from '@tabler/icons-react';
import './ServerLogs.css';

interface ServerLogsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerLogs: React.FC<ServerLogsProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<string>('');
  const [logPath, setLogPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const [logsData, path] = await Promise.all([
        invoke<string>('get_server_logs'),
        invoke<string>('get_server_log_path')
      ]);
      setLogs(logsData);
      setLogPath(path);
    } catch (error) {
      console.error('failed to fetch logs:', error);
      setLogs(`error fetching logs: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      // Auto-refresh every 2 seconds while open
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const copyLogs = () => {
    navigator.clipboard.writeText(logs);
  };

  if (!isOpen) return null;

  return (
    <div className="server-logs-overlay">
      <div className="server-logs-modal">
        <div className="server-logs-header">
          <h3>server logs</h3>
          <div className="server-logs-actions">
            <button onClick={fetchLogs} disabled={isLoading} title="refresh">
              <IconRefresh size={16} />
            </button>
            <button onClick={copyLogs} title="copy all">
              <IconCopy size={16} />
            </button>
            <button onClick={onClose} title="close">
              <IconX size={16} />
            </button>
          </div>
        </div>
        {logPath && (
          <div className="server-logs-path">
            log file: {logPath}
          </div>
        )}
        <div className="server-logs-content">
          <pre>{logs || 'no logs available yet...'}</pre>
        </div>
      </div>
    </div>
  );
};