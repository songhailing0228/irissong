import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Card, List, Button, Typography, Tag, Input, Avatar, Divider, Space, message, Modal } from 'antd';
import { CheckOutlined, CloseOutlined, SendOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import io from 'socket.io-client';

import SimulationConfigModal from '../components/Simulation/SimulationConfigModal';
import AgentMessage from '../components/Simulation/AgentMessage';
import SimulationSummary from '../components/Simulation/SimulationSummary';
import DebugConsole from '../components/DebugConsole';

const { Title, Text } = Typography;
const { TextArea } = Input;

const ReviewRoom = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [activeReqId, setActiveReqId] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  const [simConfigVisible, setSimConfigVisible] = useState(false);
  const [simulationSummary, setSimulationSummary] = useState(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const listRef = useRef(null);
  const socketRef = useRef(null);

  // 1. Initial Data Fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        const sessionRes = await axios.get(`http://localhost:5000/api/sessions/${id}`);
        setSession(sessionRes.data);
        
        const reqsRes = await axios.get(`http://localhost:5000/api/requirements/session/${id}`);
        setRequirements(reqsRes.data);
        if (reqsRes.data.length > 0) {
          setActiveReqId(reqsRes.data[0]._id);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load session. Please check the ID or try again.');
      }
    };
    fetchData();
  }, [id]);

  // 2. Socket Connection
  useEffect(() => {
    if (!id) return;

    const newSocket = io('http://localhost:5000');
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
      setSimulationSummary(summaryData);
      message.success('Simulation Completed!');
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

  // 3. Fetch Comments when Active Req Changes
  useEffect(() => {
    if (!activeReqId) return;
    const fetchComments = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/comments/requirement/${activeReqId}`);
        setComments(res.data);
      } catch (err) {
        console.error("Failed to fetch comments", err);
      }
    };
    fetchComments();
  }, [activeReqId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments]);

  // Actions
  const handleApprove = async (reqId, status) => {
    if (!user?._id) return message.error("You must be logged in");
    try {
      await axios.put(`http://localhost:5000/api/requirements/${reqId}/approve`, {
        userId: user._id,
        status,
        comment: ''
      });
      message.success(`Requirement ${status}`);
    } catch (err) {
      message.error('Failed to update status');
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    if (!user?._id) return message.error("You must be logged in");
    
    try {
      const res = await axios.post('http://localhost:5000/api/comments', {
        content: newComment,
        author: user._id,
        session: id,
        requirement: activeReqId
      });
      setComments([...comments, res.data]);
      setNewComment('');
      socket.emit('send-comment', res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartSimulation = async (config) => {
    setSimConfigVisible(false);
    message.loading({ content: 'Initializing Simulation Agents...', key: 'simLoading', duration: 0 });
    
    setSimulationSummary(null);

    const currentSocket = socketRef.current;
    if (!currentSocket) {
      message.error('Real-time connection not ready. Please refresh and try again.');
      return;
    }

    currentSocket.emit('join-session', id);

    try {
      await axios.post('http://localhost:5000/api/simulation/start', {
        sessionId: id,
        docUrl: session.docUrl,
        referenceDocs: session.referenceDocs, // Pass references
        ...config
      });
      message.success({ content: 'Simulation Started!', key: 'simLoading' });
    } catch (err) {
      console.error(err);
      message.error({ content: 'Failed to start simulation', key: 'simLoading' });
    }
  };

  if (error) return <div style={{ padding: 24, textAlign: 'center' }}><Title level={3} type="danger">{error}</Title><Button type="primary" onClick={() => window.location.href = '/dashboard'}>Go to Dashboard</Button></div>;
  if (!session) return <div style={{ padding: 24, textAlign: 'center' }}><Title level={4}>Loading session...</Title></div>;

  return (
    <div style={{ height: 'calc(100vh - 100px)' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Title level={4}>{session?.title}</Title>
        <Button href={session?.docUrl} target="_blank">View Feishu Doc</Button>
      </div>

      <Row gutter={16} style={{ height: '100%' }}>
        {/* Left: Requirements List */}
        <Col span={14} style={{ height: '100%', overflowY: 'auto' }}>
          <List
            dataSource={requirements}
            renderItem={req => (
              <Card 
                style={{ marginBottom: 8, borderColor: activeReqId === req._id ? '#1890ff' : '#f0f0f0' }}
                onClick={() => setActiveReqId(req._id)}
                actions={[
                  <Button type="text" icon={<CheckOutlined />} style={{ color: 'green' }} onClick={() => handleApprove(req._id, 'approved')}>Approve</Button>,
                  <Button type="text" icon={<CloseOutlined />} style={{ color: 'red' }} onClick={() => handleApprove(req._id, 'rejected')}>Reject</Button>
                ]}
              >
                <List.Item.Meta
                  title={<Text delete={req.status === 'rejected'}>{req.description}</Text>}
                  description={
                    <Space>
                      <Tag color={req.priority === 'high' ? 'red' : 'blue'}>{req.priority}</Tag>
                      <Tag>{req.status}</Tag>
                    </Space>
                  }
                />
              </Card>
            )}
          />
        </Col>

        {/* Right: Discussion */}
        <Col span={10} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Card 
            title="Discussion" 
            extra={
              <Space>
                <Button 
                  icon={<ReloadOutlined />} 
                  onClick={() => setComments([])}
                >
                  Reset
                </Button>
                <Button 
                  type="primary" 
                  ghost 
                  icon={<PlayCircleOutlined />} 
                  onClick={() => setSimConfigVisible(true)}
                >
                  Start Simulation
                </Button>
              </Space>
            }
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }} 
            bodyStyle={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
          >
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
              <List
                dataSource={comments}
                renderItem={item => {
                  if (item.isAgent) {
                    return <AgentMessage message={item} />;
                  }
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar size="small">{item.author?.name?.[0]}</Avatar>
                        <Text strong>{item.author?.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
                      </div>
                      <div style={{ marginLeft: 32, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                        {item.content}
                      </div>
                    </div>
                  );
                }}
              />
              {simulationSummary && (
                <SimulationSummary 
                  summary={simulationSummary} 
                  artifacts={{
                    reportPath: '/out/review_report.md', 
                    updatePackPath: '/out/brd_update_pack.json'
                  }} 
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea 
                rows={2} 
                value={newComment} 
                onChange={e => setNewComment(e.target.value)}
                onPressEnter={(e) => { e.preventDefault(); handleSendComment(); }}
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSendComment} />
            </div>
          </Card>
        </Col>
      </Row>
      
      <SimulationConfigModal 
        visible={simConfigVisible}
        onCancel={() => setSimConfigVisible(false)}
        onStart={handleStartSimulation}
      />
      
      {/* System Debug Console */}
      <DebugConsole socket={socketInstance} />
    </div>
  );
};

export default ReviewRoom;
