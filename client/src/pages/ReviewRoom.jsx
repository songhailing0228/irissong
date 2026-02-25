import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Card, Button, Typography, Tag, Input, Avatar, Space, message, Spin, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, SendOutlined, PlayCircleOutlined, ReloadOutlined, FileTextOutlined, LoadingOutlined, StopOutlined, TeamOutlined, EyeOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import io from 'socket.io-client';

import SimulationConfigModal from '../components/Simulation/SimulationConfigModal';
import AgentMessage from '../components/Simulation/AgentMessage';
import SimulationSummary from '../components/Simulation/SimulationSummary';
import DebugConsole from '../components/DebugConsole';

const { Title, Text } = Typography;
const { TextArea } = Input;

const AGENT_META = {
  'owner': { label: 'Business/Operation Owner', color: '#1677ff', icon: '📋' },
  'pm-reviewer': { label: 'Product Manager', color: '#13c2c2', icon: '🎯' },
  'stakeholder': { label: 'Key Stakeholder', color: '#faad14', icon: '👔' },
  'tech-reviewer': { label: 'Tech Reviewer', color: '#52c41a', icon: '⚙️' },
  'ops-legal-reviewer': { label: 'Ops/Legal', color: '#722ed1', icon: '📜' },
  'qa-reviewer': { label: 'QA Reviewer', color: '#fa8c16', icon: '🔍' },
};

const ReviewRoom = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [activeReqId, setActiveReqId] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [simRunning, setSimRunning] = useState(false);

  const [simConfigVisible, setSimConfigVisible] = useState(false);
  const [simulationSummary, setSimulationSummary] = useState(null);
  const [simulationAgents, setSimulationAgents] = useState([]);
  const [socketInstance, setSocketInstance] = useState(null);
  const listRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sessionRes = await axios.get(`http://localhost:5001/api/sessions/${id}`);
        setSession(sessionRes.data);
        // Restore saved simulation report if exists
        if (sessionRes.data.simulationReport?.finalReport) {
          setSimulationSummary({
            summary: sessionRes.data.simulationReport.summary,
            finalReport: sessionRes.data.simulationReport.finalReport,
          });
          if (sessionRes.data.simulationReport.agents) {
            setSimulationAgents(sessionRes.data.simulationReport.agents);
          }
        }
        const reqsRes = await axios.get(`http://localhost:5001/api/requirements/session/${id}`);
        setRequirements(reqsRes.data);
        if (reqsRes.data.length > 0) setActiveReqId(reqsRes.data[0]._id);
      } catch (err) {
        console.error(err);
        setError('Failed to load session.');
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const newSocket = io('http://localhost:5001');
    socketRef.current = newSocket;
    setSocketInstance(newSocket);

    const joinRoom = () => newSocket.emit('join-session', id);
    newSocket.on('connect', joinRoom);
    joinRoom();

    newSocket.on('new-comment', (comment) => {
      setActiveReqId(current => {
        if (comment.requirement === current) {
          setComments(prev => [...prev, comment]);
        }
        return current;
      });
    });

    newSocket.on('requirement-updated', (updatedReq) => {
      setRequirements(prev => prev.map(r => r._id === updatedReq._id ? updatedReq : r));
    });

    const handleSimulationMessage = (msg) => {
      setComments(prev => [...prev, {
        isAgent: true,
        agent: msg.agentName,
        role: msg.roleDisplay,
        round: msg.phase,
        content: msg.content,
        createdAt: new Date().toISOString()
      }]);
    };

    const handleSimulationComplete = (summaryData) => {
      setSimRunning(false);
      setSimulationSummary(summaryData);
      message.success('Simulation completed!');
    };

    newSocket.on('simulation-message', handleSimulationMessage);
    newSocket.on('simulation-complete', handleSimulationComplete);

    return () => {
      newSocket.off('connect', joinRoom);
      newSocket.off('new-comment');
      newSocket.off('requirement-updated');
      newSocket.off('simulation-message', handleSimulationMessage);
      newSocket.off('simulation-complete', handleSimulationComplete);
      newSocket.disconnect();
      setSocketInstance(null);
      socketRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!activeReqId) return;
    const fetchComments = async () => {
      try {
        const res = await axios.get(`http://localhost:5001/api/comments/requirement/${activeReqId}`);
        setComments(res.data);
      } catch (err) {
        console.error('Failed to fetch comments', err);
      }
    };
    fetchComments();
  }, [activeReqId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments]);

  const handleApprove = async (reqId, status) => {
    if (!user?._id) return message.error('You must be logged in');
    try {
      await axios.put(`http://localhost:5001/api/requirements/${reqId}/approve`, {
        userId: user._id, status, comment: ''
      });
      message.success(`Requirement ${status}`);
    } catch (err) {
      message.error('Failed to update status');
    }
  };

  const handleSend = async () => {
    if (!newComment.trim()) return;
    if (!user?._id) return message.error('You must be logged in');

    if (simRunning) {
      setComments(prev => [...prev, {
        isAgent: false,
        isHumanInterrupt: true,
        author: { name: user.name },
        content: newComment,
        createdAt: new Date().toISOString()
      }]);

      try {
        await axios.post('http://localhost:5001/api/simulation/interrupt', {
          sessionId: id,
          userName: user.name,
          content: newComment
        });
      } catch (err) {
        console.error('Interrupt failed', err);
      }

      setNewComment('');
      return;
    }

    try {
      const res = await axios.post('http://localhost:5001/api/comments', {
        content: newComment, author: user._id, session: id, requirement: activeReqId
      });
      setComments([...comments, res.data]);
      setNewComment('');
      socketInstance?.emit('send-comment', res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartSimulation = async (config) => {
    setSimConfigVisible(false);
    setSimRunning(true);
    setSimulationSummary(null);
    setSimulationAgents(config.selectedAgents || []);
    message.loading({ content: 'Starting simulation...', key: 'simLoading', duration: 3 });

    const currentSocket = socketRef.current;
    if (!currentSocket) {
      message.error('Socket not ready. Please refresh.');
      setSimRunning(false);
      return;
    }
    currentSocket.emit('join-session', id);

    try {
      await axios.post('http://localhost:5001/api/simulation/start', {
        sessionId: id, docUrl: session.docUrl, referenceDocs: session.referenceDocs, ...config
      });
      message.success({ content: 'Simulation started!', key: 'simLoading' });
    } catch (err) {
      console.error(err);
      message.error({ content: 'Failed to start simulation', key: 'simLoading' });
      setSimRunning(false);
    }
  };

  const handleStop = async () => {
    try {
      await axios.post('http://localhost:5001/api/simulation/stop', { sessionId: id });
      setSimRunning(false);
      message.info('Simulation stopped.');
    } catch (err) {
      console.error(err);
    }
  };

  if (error) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <Title level={4} type="danger">{error}</Title>
      <Button type="primary" onClick={() => window.location.href = '/dashboard'}>Back to Dashboard</Button>
    </div>
  );
  if (!session) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} />} />
      <div style={{ marginTop: 16 }}><Text type="secondary">Loading session...</Text></div>
    </div>
  );

  return (
    <div style={{ height: 'calc(100vh - 104px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, padding: '0 4px',
      }}>
        <div>
          <Title level={4} style={{ marginBottom: 2 }}>{session?.title}</Title>
          {session?.description && <Text type="secondary" style={{ fontSize: 13 }}>{session.description}</Text>}
        </div>
        <Button icon={<FileTextOutlined />} href={session?.docUrl} target="_blank">
          View Document
        </Button>
      </div>

      <Row gutter={16} style={{ flex: 1, minHeight: 0 }}>
        <Col span={10} style={{ height: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {simulationAgents.length > 0 && (
              <Card
                size="small"
                title={<span><TeamOutlined style={{ marginRight: 6 }} />Review Participants ({simulationAgents.length})</span>}
                style={{ borderRadius: 10, marginBottom: 4 }}
                styles={{ body: { padding: '8px 16px' } }}
              >
                {simulationAgents.map((agent, i) => {
                  const meta = AGENT_META[agent.role] || { label: agent.role, color: '#8c8c8c', icon: '🤖' };
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 0',
                      borderBottom: i < simulationAgents.length - 1 ? '1px solid #f5f5f5' : 'none',
                    }}>
                      <Avatar size={32} style={{ background: meta.color, flexShrink: 0, fontSize: 15 }}>
                        {meta.icon}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 13 }}>{meta.label}</Text>
                        {agent.focusArea && (
                          <div style={{ marginTop: 2 }}>
                            <EyeOutlined style={{ fontSize: 10, color: '#999', marginRight: 4 }} />
                            <Text type="secondary" style={{ fontSize: 11 }}>{agent.focusArea}</Text>
                          </div>
                        )}
                        {agent.context && (
                          <div style={{ marginTop: 1 }}>
                            <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                              {agent.context.length > 60 ? agent.context.slice(0, 60) + '...' : agent.context}
                            </Text>
                          </div>
                        )}
                        {agent.referenceDoc && (
                          <Tag color="blue" style={{ fontSize: 10, marginTop: 3, padding: '0 4px', lineHeight: '16px' }}>
                            <FileTextOutlined style={{ marginRight: 2 }} />ref doc
                          </Tag>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}

            {requirements.length === 0 && simulationAgents.length === 0 && (
              <Card style={{ borderRadius: 10, textAlign: 'center', padding: 24 }}>
                <Text type="secondary">No requirements defined. Use the simulation to review the full document.</Text>
              </Card>
            )}
            {requirements.map(req => (
              <Card
                key={req._id}
                size="small"
                hoverable
                style={{
                  borderRadius: 10,
                  borderLeft: activeReqId === req._id ? '3px solid #667eea' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                onClick={() => setActiveReqId(req._id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 500 }} delete={req.status === 'rejected'}>{req.description}</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space size={4}>
                        <Tag color={req.priority === 'high' ? 'red' : req.priority === 'low' ? 'default' : 'blue'} style={{ fontSize: 11 }}>
                          {req.priority}
                        </Tag>
                        <Tag style={{ fontSize: 11 }}>{req.status}</Tag>
                      </Space>
                    </div>
                  </div>
                  <Space size={4}>
                    <Button type="text" size="small" icon={<CheckOutlined />}
                      style={{ color: '#52c41a' }}
                      onClick={e => { e.stopPropagation(); handleApprove(req._id, 'approved'); }} />
                    <Button type="text" size="small" icon={<CloseOutlined />}
                      style={{ color: '#ff4d4f' }}
                      onClick={e => { e.stopPropagation(); handleApprove(req._id, 'rejected'); }} />
                  </Space>
                </div>
              </Card>
            ))}
          </div>
        </Col>

        <Col span={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Card
            style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden' }}
            styles={{
              header: { borderBottom: '1px solid #f0f0f0', padding: '12px 20px', minHeight: 'auto' },
              body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
            }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong style={{ fontSize: 15 }}>Agent Discussion</Text>
                {simRunning && <Spin size="small" />}
              </div>
            }
            extra={
              <Space size={8}>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => { setComments([]); setSimulationSummary(null); }}>
                  Clear
                </Button>
                {simRunning ? (
                  <Button
                    size="small" danger
                    icon={<StopOutlined />}
                    onClick={handleStop}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="primary" size="small"
                    icon={<PlayCircleOutlined />}
                    onClick={() => setSimConfigVisible(true)}
                    style={{ background: '#667eea', borderColor: '#667eea' }}
                  >
                    Start Simulation
                  </Button>
                )}
              </Space>
            }
          >
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {comments.length === 0 && !simRunning && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa' }}>
                  <PlayCircleOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
                  <Text type="secondary">Click "Start Simulation" to begin the AI review</Text>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {comments.map((item, index) => {
                  if (item.isAgent) {
                    return <AgentMessage key={index} message={item} />;
                  }
                  if (item.isHumanInterrupt) {
                    return (
                      <div key={index} style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: '#fff7e6', border: '1px solid #ffe58f',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Avatar size={22} style={{ background: '#d97706', fontSize: 11 }}>
                            {item.author?.name?.[0]}
                          </Avatar>
                          <Text strong style={{ fontSize: 13 }}>{item.author?.name}</Text>
                          <Tag color="orange" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>Human Input</Tag>
                        </div>
                        <div style={{ marginLeft: 28, fontSize: 13 }}>{item.content}</div>
                      </div>
                    );
                  }
                  return (
                    <div key={item._id || index}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Avatar size={24} style={{ background: '#667eea', fontSize: 11 }}>
                          {item.author?.name?.[0]}
                        </Avatar>
                        <Text strong style={{ fontSize: 13 }}>{item.author?.name}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </Text>
                      </div>
                      <div style={{
                        marginLeft: 30, padding: '8px 12px',
                        background: '#f8f9fa', borderRadius: 8, fontSize: 13,
                      }}>
                        {item.content}
                      </div>
                    </div>
                  );
                })}
              </div>
              {simulationSummary && (
                <SimulationSummary
                  summary={simulationSummary.summary}
                  finalReport={simulationSummary.finalReport}
                />
              )}
              {simulationSummary && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '8px 0', flexWrap: 'wrap' }}>
                  <Button
                    icon={<CheckOutlined />}
                    style={{ borderRadius: 8, height: 36 }}
                    onClick={async () => {
                      try {
                        await axios.put(`http://localhost:5001/api/sessions/${id}/report`, {
                          summary: simulationSummary.summary,
                          finalReport: simulationSummary.finalReport,
                          agents: simulationAgents,
                        });
                        message.success('评审报告已保存');
                      } catch (e) { message.error('保存失败'); }
                    }}
                  >
                    保存评审报告
                  </Button>
                </div>
              )}
            </div>

            <div style={{
              padding: '12px 20px', borderTop: '1px solid #f0f0f0',
              display: 'flex', gap: 8, background: '#fafafa',
            }}>
              <TextArea
                rows={2}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onPressEnter={e => { e.preventDefault(); handleSend(); }}
                placeholder={simRunning ? 'Type to join the discussion (agents will see your input)...' : 'Type a message...'}
                style={{ borderRadius: 8, resize: 'none' }}
              />
              <Tooltip title={simRunning ? 'Send as human input to the discussion' : 'Send comment'}>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSend}
                  style={{
                    height: 'auto', borderRadius: 8,
                    background: simRunning ? '#d97706' : '#667eea',
                    borderColor: simRunning ? '#d97706' : '#667eea',
                  }}
                />
              </Tooltip>
            </div>
          </Card>
        </Col>
      </Row>

      <SimulationConfigModal
        visible={simConfigVisible}
        onCancel={() => setSimConfigVisible(false)}
        onStart={handleStartSimulation}
      />

      <DebugConsole socket={socketInstance} />
    </div>
  );
};

export default ReviewRoom;
