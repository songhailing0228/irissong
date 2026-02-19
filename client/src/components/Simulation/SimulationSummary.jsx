import React from 'react';
import { Card, List, Typography, Row, Col, Alert, Button, Space } from 'antd';
import { FileTextOutlined, DownloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const SimulationSummary = ({ summary, artifacts }) => {
  if (!summary) return null;

  const renderList = (title, items, color) => (
    <Card 
      type="inner" 
      title={<Text strong style={{ color }}>{title}</Text>}
      size="small"
      style={{ height: '100%' }}
      bodyStyle={{ padding: '8px 12px' }}
    >
      <List
        size="small"
        dataSource={items}
        renderItem={item => <List.Item><Text style={{ fontSize: 13 }}>• {item}</Text></List.Item>}
      />
    </Card>
  );

  return (
    <div style={{ marginTop: 24 }}>
      <Alert
        message="Simulation Complete"
        description="The multi-agent review has finished. Review the summary below."
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
        action={
          <Space direction="vertical">
            <Button size="small" icon={<FileTextOutlined />} href={artifacts?.reportPath} target="_blank">
              View Report
            </Button>
            <Button size="small" icon={<DownloadOutlined />} href={artifacts?.updatePackPath} target="_blank">
              Update Pack
            </Button>
          </Space>
        }
      />
      
      <Title level={5}>Review Summary</Title>
      
      <Row gutter={[16, 16]}>
        <Col span={12}>
          {renderList("Top Risks", summary.topRisks, '#cf1322')}
        </Col>
        <Col span={12}>
          {renderList("Must Fixes", summary.mustFixes, '#d48806')}
        </Col>
        <Col span={12}>
          {renderList("Open Questions", summary.openQuestions, '#096dd9')}
        </Col>
        <Col span={12}>
          {renderList("Next Actions", summary.nextActions, '#389e0d')}
        </Col>
      </Row>
    </div>
  );
};

export default SimulationSummary;
