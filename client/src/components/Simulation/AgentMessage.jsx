import React from 'react';
import { Tag, Typography, Avatar } from 'antd';
import { RobotOutlined, UserOutlined, CrownOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const ROLE_STYLES = {
  Orchestrator: { bg: '#f3e8ff', border: '#d8b4fe', avatar: '#8b5cf6', icon: <CrownOutlined /> },
  Author:       { bg: '#fef9c3', border: '#fde68a', avatar: '#d97706', icon: <UserOutlined /> },
  Reviewer:     { bg: '#eff6ff', border: '#bfdbfe', avatar: '#3b82f6', icon: <RobotOutlined /> },
  Error:        { bg: '#fef2f2', border: '#fecaca', avatar: '#ef4444', icon: <RobotOutlined /> },
};

const PHASE_COLORS = {
  Intake: 'purple',
  Round1: 'blue',
  OwnerAnswers: 'gold',
  Round2: 'cyan',
  Synthesis: 'magenta',
  Error: 'red',
};

const AgentMessage = ({ message }) => {
  const { agent, role, round, content, statusTag } = message;
  const style = ROLE_STYLES[role] || ROLE_STYLES.Reviewer;

  return (
    <div style={{
      padding: '12px 14px',
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Avatar size={22} style={{ background: style.avatar, fontSize: 11 }} icon={style.icon} />
        <Text strong style={{ fontSize: 13 }}>{agent}</Text>
        <Tag color={PHASE_COLORS[round] || 'default'} style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
          {round}
        </Tag>
        {statusTag && (
          <Tag
            color={statusTag === 'Resolved' ? 'success' : statusTag === 'Blocked' ? 'error' : 'warning'}
            style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px' }}
          >
            {statusTag}
          </Tag>
        )}
      </div>
      <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, marginLeft: 28 }}>
        {content}
      </Paragraph>
    </div>
  );
};

export default AgentMessage;
