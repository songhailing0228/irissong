import React, { useState } from 'react';
import { Modal, Form, Checkbox, InputNumber, Button, Typography, Divider, Input, Collapse, Select, Row, Col, Tabs, message, Tag, Upload } from 'antd';
import { SettingOutlined, PlusOutlined, RobotOutlined, UploadOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const { TextArea } = Input;

const SimulationConfigModal = ({ visible, onCancel, onStart }) => {
  const [form] = Form.useForm();
  const [customAgentForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('config');
  const [generating, setGenerating] = useState(false);
  const [agentFiles, setAgentFiles] = useState({});
  const [uploading, setUploading] = useState({});

  const [agentsConfig, setAgentsConfig] = useState([
    { key: 'owner', label: 'Business/Operation Owner', desc: 'Author of BRD, defends business value', defaultFocus: 'Business Goal, Operational Plan', color: 'blue' },
    { key: 'pm-reviewer', label: 'Product Manager', desc: 'Reviews feasibility & product fit', defaultFocus: 'Product Logic, User Experience, Feasibility', color: 'cyan' },
    { key: 'stakeholder', label: 'Key Stakeholder', desc: 'Sponsor/Region Head, cares about value & budget', defaultFocus: 'Strategic Value, Budget, Regional Impact', color: 'gold' },
    { key: 'tech-reviewer', label: 'Tech Reviewer', desc: 'Architecture, Scalability', defaultFocus: 'High Concurrency, Data Consistency, Latency', color: 'green' },
    { key: 'ops-legal-reviewer', label: 'Ops/Legal', desc: 'Compliance, GDPR, Process', defaultFocus: 'GDPR, Fraud Prevention, SOP Feasibility', color: 'purple' },
    { key: 'qa-reviewer', label: 'QA Reviewer', desc: 'Edge cases, Testing', defaultFocus: 'Corner Cases, Exception Flows, Compatibility', color: 'orange' }
  ]);

  const handleAgentFileUpload = async (file, agentKey) => {
    setUploading(prev => ({ ...prev, [agentKey]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post('http://localhost:5001/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAgentFiles(prev => ({
        ...prev,
        [agentKey]: { relativePath: res.data.relativePath, fileName: file.name }
      }));
      message.success(`${file.name} uploaded`);
    } catch (err) {
      message.error('Upload failed');
    } finally {
      setUploading(prev => ({ ...prev, [agentKey]: false }));
    }
  };

  const removeAgentFile = (agentKey) => {
    setAgentFiles(prev => {
      const next = { ...prev };
      delete next[agentKey];
      return next;
    });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const selectedAgents = agentsConfig
        .filter(agent => values[`enable_${agent.key}`])
        .map(agent => ({
          role: agent.key,
          focusArea: values[`focus_${agent.key}`] || agent.defaultFocus,
          context: values[`context_${agent.key}`] || '',
          intensity: values[`intensity_${agent.key}`] || 'neutral',
          referenceDoc: agentFiles[agent.key]?.relativePath || null
        }));

      onStart({
        selectedAgents,
        maxRounds: values.maxRounds,
        globalContext: values.globalContext
      });
    } catch (error) {
      console.log('Validation failed:', error);
    }
  };

  const handleGenerateAgent = async () => {
    try {
      const values = await customAgentForm.validateFields();
      setGenerating(true);

      const res = await axios.post('http://localhost:5001/api/simulation/generate-agent', values);

      const newAgent = {
        key: res.data.roleKey,
        label: values.roleName,
        desc: values.description.substring(0, 50) + '...',
        defaultFocus: 'Custom Focus',
        color: 'magenta',
        isCustom: true
      };

      setAgentsConfig([...agentsConfig, newAgent]);

      form.setFieldsValue({
        [`enable_${newAgent.key}`]: true,
        [`focus_${newAgent.key}`]: values.description,
        [`intensity_${newAgent.key}`]: 'neutral'
      });

      message.success('Agent generated successfully!');
      setActiveTab('config');
      customAgentForm.resetFields();
    } catch (error) {
      console.error(error);
      message.error('Failed to generate agent');
    } finally {
      setGenerating(false);
    }
  };

  const configTab = (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        maxRounds: 2,
        ...agentsConfig.reduce((acc, agent) => ({
          ...acc,
          [`enable_${agent.key}`]: true,
          [`focus_${agent.key}`]: agent.defaultFocus,
          [`intensity_${agent.key}`]: 'neutral'
        }), {})
      }}
    >
      <Typography.Title level={5}>Global Context</Typography.Title>
      <Form.Item name="globalContext" help="Additional background info visible to ALL agents">
        <TextArea rows={2} placeholder="E.g. This project must launch by Q3. Budget is tight." />
      </Form.Item>

      <Divider titlePlacement="left">Agent Configuration</Divider>

      <Collapse defaultActiveKey={['owner']} ghost items={agentsConfig.map(agent => ({
        key: agent.key,
        forceRender: true,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <Form.Item name={`enable_${agent.key}`} valuePropName="checked" noStyle>
              <Checkbox onClick={e => e.stopPropagation()} />
            </Form.Item>
            <Text strong>{agent.label}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{agent.desc}</Text>
            {agent.isCustom && <Tag color="magenta">Custom</Tag>}
            {agentFiles[agent.key] && <Tag color="blue" style={{ fontSize: 10 }}>+doc</Tag>}
          </div>
        ),
        children: (
          <div style={{ padding: '12px 0 0 28px' }}>
            <Form.Item label="Focus Area / Persona" name={`focus_${agent.key}`} style={{ marginBottom: 12 }}>
              <Input placeholder={agent.defaultFocus} prefix={<SettingOutlined style={{ color: '#bfbfbf' }} />} />
            </Form.Item>

            <Row gutter={12}>
              <Col span={16}>
                <Form.Item label="Private Context" name={`context_${agent.key}`}
                  help={<span style={{ fontSize: 11 }}>Secret info (e.g. hidden agenda)</span>}
                  style={{ marginBottom: 12 }}
                >
                  <TextArea rows={2} placeholder={`E.g. Stakeholder X hates ${agent.key === 'tech-reviewer' ? 'Redis' : 'risk'}...`} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Intensity" name={`intensity_${agent.key}`} style={{ marginBottom: 12 }}>
                  <Select options={[
                    { value: 'friendly', label: '🟢 Friendly' },
                    { value: 'neutral', label: '🔵 Neutral' },
                    { value: 'strict', label: '🔴 Strict' }
                  ]} />
                </Form.Item>
              </Col>
            </Row>

            <div style={{
              padding: '10px 12px', background: '#fafafa', borderRadius: 8,
              border: '1px dashed #d9d9d9',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Reference Document <span style={{ color: '#bbb' }}>(optional — agent compares the main doc against this)</span>
                </Text>
              </div>
              {agentFiles[agent.key] ? (
                <div style={{
                  marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', background: '#e6f4ff', borderRadius: 6,
                }}>
                  <FileTextOutlined style={{ color: '#1677ff' }} />
                  <Text style={{ fontSize: 12, flex: 1 }} ellipsis>{agentFiles[agent.key].fileName}</Text>
                  <Button type="text" size="small" icon={<DeleteOutlined />}
                    onClick={() => removeAgentFile(agent.key)}
                    style={{ color: '#999' }}
                  />
                </div>
              ) : (
                <Upload
                  showUploadList={false}
                  beforeUpload={(file) => { handleAgentFileUpload(file, agent.key); return false; }}
                  accept=".pdf,.md,.txt,.doc,.docx,.xlsx,.xls"
                >
                  <Button
                    size="small" icon={<UploadOutlined />}
                    loading={uploading[agent.key]}
                    style={{ marginTop: 8 }}
                  >
                    Upload requirements doc
                  </Button>
                </Upload>
              )}
            </div>
          </div>
        )
      }))} />

      <Divider />

      <Form.Item label="Simulation Settings">
        <Form.Item
          name="maxRounds"
          label="Max Follow-up Rounds"
          style={{ display: 'inline-block', width: '200px' }}
        >
          <InputNumber min={0} max={5} />
        </Form.Item>
      </Form.Item>
    </Form>
  );

  const createAgentTab = (
    <Form form={customAgentForm} layout="vertical">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <RobotOutlined style={{ fontSize: 48, color: '#1890ff' }} />
        <Typography.Title level={4}>Create Custom Reviewer</Typography.Title>
        <Typography.Text type="secondary">
          Describe the reviewer's persona, expertise, and what they care about.
          AI will generate the agent definition for you.
        </Typography.Text>
      </div>

      <Form.Item
        name="roleName"
        label="Role Name"
        rules={[{ required: true, message: 'Please input role name!' }]}
      >
        <Input placeholder="e.g. Security Expert, GDPR Officer, UX Designer" />
      </Form.Item>

      <Form.Item
        name="description"
        label="Persona Description"
        rules={[{ required: true, message: 'Please describe the persona!' }]}
        help="Be specific about their concerns, tone, and what they should check in the document."
      >
        <TextArea
          rows={6}
          placeholder="e.g. A strict security expert who focuses on PII data protection, encryption standards, and compliance with ISO 27001. They are very critical of any data leaks."
        />
      </Form.Item>

      <Form.Item name="scope" label="Scope" initialValue="global">
        <Select options={[
          { value: 'global', label: 'Global (Save to project agents)' },
          { value: 'session', label: 'Session Only (Temporary)' }
        ]} />
      </Form.Item>

      <Button type="primary" block onClick={handleGenerateAgent} loading={generating} size="large">
        Generate Agent
      </Button>
    </Form>
  );

  return (
    <Modal
      title="Start BRD Review Simulation"
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Run Simulation"
      width={700}
      footer={[
        <Button key="cancel" onClick={onCancel}>Cancel</Button>,
        activeTab === 'config' && <Button key="submit" type="primary" onClick={handleOk}>Run Simulation</Button>
      ]}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'config', label: 'Configuration', children: configTab },
          { key: 'create', label: 'Add New Agent', children: createAgentTab, icon: <PlusOutlined /> }
        ]}
      />
    </Modal>
  );
};

export default SimulationConfigModal;
