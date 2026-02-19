import React from 'react';
import { Card, Tag, Typography, Space, Avatar } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const AgentMessage = ({ message }) => {
  const { agent, role, round, content, statusTag } = message;

  const isOwner = role === 'Author' || agent === 'Owner';
  
  const getRoleColor = (r) => {
    switch (r) {
      case 'Author': return 'gold';
      case 'Reviewer': return 'blue';
      case 'Orchestrator': return 'purple';
      default: return 'default';
    }
  };

  const getRoundColor = (r) => {
    if (r === 'Intake') return 'cyan';
    if (r === 'Synthesis') return 'purple';
    return 'geekblue';
  };

  return (
    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <Avatar 
          style={{ backgroundColor: isOwner ? '#faad14' : '#1890ff', marginRight: 8 }} 
          icon={<RobotOutlined />} 
          size="small"
        />
        <Text strong style={{ marginRight: 8 }}>{agent}</Text>
        <Space size={4}>
          <Tag color={getRoleColor(role)}>{role}</Tag>
          <Tag color={getRoundColor(round)}>{round}</Tag>
          {statusTag && (
            <Tag color={statusTag === 'Resolved' ? 'success' : statusTag === 'Blocked' ? 'error' : 'warning'}>
              {statusTag}
            </Tag>
          )}
        </Space>
      </div>
      
      <Card 
        size="small" 
        style={{ 
          marginLeft: 32, 
          backgroundColor: isOwner ? '#fffbe6' : '#f0f5ff',
          borderColor: isOwner ? '#ffe58f' : '#d6e4ff'
        }}
      >
        <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          {content}
        </Paragraph>
      </Card>
    </div>
  );
};

export default AgentMessage;
