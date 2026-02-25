import React, { useState } from 'react';
import { Card, Typography, Row, Col, Alert, Button, Space, Modal } from 'antd';
import { FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const SimulationSummary = ({ summary, finalReport }) => {
  const [reportVisible, setReportVisible] = useState(false);

  if (!summary && !finalReport) return null;

  const renderList = (heading, items, color) => (
    <Card
      type="inner"
      title={<Text strong style={{ color }}>{heading}</Text>}
      size="small"
      style={{ height: '100%' }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      {(!items || items.length === 0) ? (
        <Text type="secondary" style={{ fontSize: 12 }}>N/A</Text>
      ) : items.map((item, i) => (
        <div key={i} style={{ padding: '4px 0', borderBottom: i < items.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
          <Text style={{ fontSize: 13 }}>• {item}</Text>
        </div>
      ))}
    </Card>
  );

  return (
    <div style={{ marginTop: 24 }}>
      <Alert
        type="success"
        showIcon
        icon={<CheckCircleOutlined />}
        style={{ marginBottom: 16 }}
        message="Simulation Complete"
        description="The multi-agent review has finished. Review the summary below."
        action={
          finalReport && (
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => setReportVisible(true)}
            >
              View Full Report
            </Button>
          )
        }
      />

      {summary && (
        <>
          <Title level={5}>Review Summary</Title>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              {renderList('Top Risks', summary.topRisks, '#cf1322')}
            </Col>
            <Col span={12}>
              {renderList('Must Fixes', summary.mustFixes, '#d48806')}
            </Col>
            <Col span={12}>
              {renderList('Open Questions', summary.openQuestions, '#096dd9')}
            </Col>
            <Col span={12}>
              {renderList('Next Actions', summary.nextActions, '#389e0d')}
            </Col>
          </Row>
        </>
      )}

      <Modal
        title="Final Review Report"
        open={reportVisible}
        onCancel={() => setReportVisible(false)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <div style={{
          whiteSpace: 'pre-wrap',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 13,
          lineHeight: 1.8,
          padding: '8px 0',
        }}>
          {finalReport}
        </div>
      </Modal>
    </div>
  );
};

export default SimulationSummary;
