import React, { useState } from 'react';
import { Modal, Form, Checkbox, InputNumber, Button, Typography, Divider, Input, Collapse, Select, Row, Col, Tabs, message, Tag } from 'antd';
import { SettingOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

const SimulationConfigModal = ({ visible, onCancel, onStart }) => {
  const [form] = Form.useForm();
  const [customAgentForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('config');
  const [generating, setGenerating] = useState(false);
  
  // Definition of available agents with their default configs
  const [agentsConfig, setAgentsConfig] = useState([
    { 
      key: 'owner', 
      label: 'Business/Operation Owner', 
      desc: 'Author of BRD, defends business value',
      defaultFocus: 'Business Goal, Operational Plan',
      color: 'blue'
    },
    { 
      key: 'pm-reviewer', 
      label: 'Product Manager', 
      desc: 'Reviews feasibility & product fit', 
      defaultFocus: 'Product Logic, User Experience, Feasibility',
      color: 'cyan'
    },
    { 
      key: 'stakeholder', 
      label: 'Key Stakeholder', 
      desc: 'Sponsor/Region Head, cares about value & budget', 
      defaultFocus: 'Strategic Value, Budget, Regional Impact',
      color: 'gold'
    },
    { 
      key: 'tech-reviewer', 
      label: 'Tech Reviewer', 
      desc: 'Architecture, Scalability', 
      defaultFocus: 'High Concurrency, Data Consistency, Latency',
      color: 'green'
    },
    { 
      key: 'ops-legal-reviewer', 
      label: 'Ops/Legal', 
      desc: 'Compliance, GDPR, Process', 
      defaultFocus: 'GDPR, Fraud Prevention, SOP Feasibility',
      color: 'purple'
    },
    { 
      key: 'qa-reviewer', 
      label: 'QA Reviewer', 
      desc: 'Edge cases, Testing', 
      defaultFocus: 'Corner Cases, Exception Flows, Compatibility',
      color: 'orange'
    }
  ]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      // Transform form data into structured agent configs
      const selectedAgents = agentsConfig
        .filter(agent => values[`enable_${agent.key}`])
        .map(agent => ({
          role: agent.key,
          focusArea: values[`focus_${agent.key}`] || agent.defaultFocus,
          context: values[`context_${agent.key}`] || '',
          intensity: values[`intensity_${agent.key}`] || 'neutral'
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
      
      const res = await axios.post('http://localhost:5000/api/simulation/generate-agent', values);
      
      const newAgent = {
        key: res.data.roleKey,
        label: values.roleName,
        desc: values.description.substring(0, 50) + '...',
        defaultFocus: 'Custom Focus',
        color: 'magenta',
        isCustom: true
      };
      
      setAgentsConfig([...agentsConfig, newAgent]);
      
      // Auto-enable the new agent in the main form
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
        // Set defaults for all agents
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

      <Divider orientation="left">Agent Configuration</Divider>
      
      <Collapse defaultActiveKey={['owner']} ghost>
        {agentsConfig.map(agent => (
          <Panel 
            forceRender={true}
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Form.Item name={`enable_${agent.key}`} valuePropName="checked" noStyle>
                  <Checkbox onClick={e => e.stopPropagation()} />
                </Form.Item>
                <Text strong>{agent.label}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{agent.desc}</Text>
                {agent.isCustom && <Tag color="magenta">Custom</Tag>}
              </div>
            }
            key={agent.key}
          >
            <div style={{ padding: '12px 0 0 28px' }}>
              <Form.Item label="Focus Area / Persona" name={`focus_${agent.key}`} style={{ marginBottom: 12 }}>
                <Input placeholder={agent.defaultFocus} prefix={<SettingOutlined style={{color: '#bfbfbf'}} />} />
              </Form.Item>
              
              <Row gutter={12}>
                <Col span={16}>
                  <Form.Item label="Private Context" name={`context_${agent.key}`} 
                    help={<span style={{fontSize: 11}}>Secret info (e.g. hidden agenda)</span>}
                    style={{ marginBottom: 0 }}
                  >
                    <TextArea rows={2} placeholder={`E.g. Stakeholder X hates ${agent.key === 'tech-reviewer' ? 'Redis' : 'risk'}...`} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Intensity" name={`intensity_${agent.key}`} style={{ marginBottom: 0 }}>
                    <Select options={[
                      { value: 'friendly', label: '🟢 Friendly' },
                      { value: 'neutral', label: '🔵 Neutral' },
                      { value: 'strict', label: '🔴 Strict' }
                    ]} />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          </Panel>
        ))}
      </Collapse>
      
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
