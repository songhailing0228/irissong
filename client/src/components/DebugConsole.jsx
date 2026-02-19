import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Typography } from 'antd';
import { CodeOutlined, DownOutlined, UpOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

const DebugConsole = ({ socket }) => {
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const handleLog = (log) => {
      setLogs(prev => [...prev, { ...log, time: new Date().toLocaleTimeString() }]);
      // Auto-expand on error
      if (log.type === 'stderr') setExpanded(true);
    };

    socket.on('system-log', handleLog);
    return () => socket.off('system-log', handleLog);
  }, [socket]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: 16,
      width: expanded ? 600 : 200,
      zIndex: 1000,
      transition: 'all 0.3s ease'
    }}>
      <Card 
        size="small" 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
            <CodeOutlined />
            <Text strong>System Logs</Text>
            {logs.length > 0 && <span style={{fontSize: 10, background: '#eee', padding: '0 4px', borderRadius: 4}}>{logs.length}</span>}
          </div>
        }
        extra={
          expanded ? (
            <div style={{display: 'flex', gap: 4}}>
                <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => setLogs([])} />
                <Button type="text" size="small" icon={<DownOutlined />} onClick={() => setExpanded(false)} />
            </div>
          ) : (
            <Button type="text" size="small" icon={<UpOutlined />} onClick={() => setExpanded(true)} />
          )
        }
        bodyStyle={{ 
          display: expanded ? 'block' : 'none',
          padding: 0,
          height: 300,
          background: '#1e1e1e'
        }}
        headStyle={{ background: '#f0f0f0' }}
      >
        <div ref={scrollRef} style={{ 
          height: '100%', 
          overflowY: 'auto', 
          padding: 8, 
          fontFamily: 'monospace', 
          fontSize: 12,
          color: '#d4d4d4'
        }}>
          {logs.length === 0 && <div style={{color: '#666', textAlign: 'center', marginTop: 20}}>No logs yet...</div>}
          {logs.map((log, i) => (
            <div key={i} style={{ marginBottom: 4, borderBottom: '1px solid #333', paddingBottom: 2 }}>
              <span style={{ color: '#569cd6', marginRight: 8 }}>[{log.time}]</span>
              <span style={{ 
                color: log.type === 'stderr' ? '#f44747' : '#ce9178',
                fontWeight: log.type === 'stderr' ? 'bold' : 'normal'
              }}>
                {log.type === 'stderr' ? '[ERROR] ' : '[OUT] '}
              </span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{log.content}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default DebugConsole;
