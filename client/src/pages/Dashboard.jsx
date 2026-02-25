import { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Typography, Card, Empty, Dropdown, Modal, Input, Form, Popconfirm, message } from 'antd';
import { PlusOutlined, FolderOpenOutlined, DeleteOutlined, EditOutlined, DownOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const { Title, Text } = Typography;

const STATUS_CONFIG = {
  draft:     { label: 'New',        color: 'default' },
  in_review: { label: 'In Review',  color: 'processing' },
  completed: { label: 'Completed',  color: 'success' },
  archived:  { label: 'Archived',   color: 'warning' },
};

const STATUS_FLOW = ['draft', 'in_review', 'completed', 'archived'];

const Dashboard = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(null);
  const [editForm] = Form.useForm();

  const fetchSessions = async () => {
    try {
      const res = await axios.get('http://localhost:5001/api/sessions', {
        params: { userId: user?._id }
      });
      setSessions(res.data);
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?._id) fetchSessions();
  }, [user]);

  const handleStatusChange = async (sessionId, newStatus) => {
    try {
      const res = await axios.put(`http://localhost:5001/api/sessions/${sessionId}`, { status: newStatus });
      setSessions(prev => prev.map(s => s._id === sessionId ? { ...s, status: res.data.status } : s));
      message.success(`Status → ${STATUS_CONFIG[newStatus].label}`);
    } catch (err) {
      message.error('Failed to update status');
    }
  };

  const handleDelete = async (sessionId) => {
    try {
      await axios.delete(`http://localhost:5001/api/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s._id !== sessionId));
      message.success('Review deleted');
    } catch (err) {
      message.error('Failed to delete');
    }
  };

  const openEdit = (record) => {
    setEditModal(record);
    editForm.setFieldsValue({ title: record.title, description: record.description });
  };

  const handleEditSave = async () => {
    try {
      const values = await editForm.validateFields();
      const res = await axios.put(`http://localhost:5001/api/sessions/${editModal._id}`, values);
      setSessions(prev => prev.map(s => s._id === editModal._id ? { ...s, ...res.data } : s));
      setEditModal(null);
      message.success('Updated');
    } catch (err) {
      message.error('Failed to update');
    }
  };

  const columns = [
    {
      title: 'Review Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Link to={`/review/${record._id}`} style={{ fontWeight: 500 }}>{text}</Link>
      ),
    },
    {
      title: 'Owner',
      dataIndex: ['owner', 'name'],
      key: 'owner',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status, record) => {
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
        const items = STATUS_FLOW
          .filter(s => s !== status)
          .map(s => ({
            key: s,
            label: STATUS_CONFIG[s].label,
            onClick: () => handleStatusChange(record._id, s),
          }));

        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Tag color={cfg.color} style={{ cursor: 'pointer', padding: '2px 10px' }}>
              {cfg.label} <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
            </Tag>
          </Dropdown>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: d => d ? new Date(d).toLocaleDateString() : '-',
    },
    {
      title: '',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={4}>
          <Link to={`/review/${record._id}`}>
            <Button type="link" size="small" icon={<FolderOpenOutlined />}>Open</Button>
          </Link>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="Delete this review?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record._id)}
            okText="Delete"
            okType="danger"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>My Reviews</Title>
          <Text type="secondary">Manage your BRD/PRD review sessions</Text>
        </div>
        <Link to="/create">
          <Button type="primary" icon={<PlusOutlined />} size="large"
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #667eea, #764ba2)', border: 'none' }}>
            New Review
          </Button>
        </Link>
      </div>
      <Card
        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: <Empty description="No reviews yet. Create your first one!" style={{ padding: 40 }} />
          }}
        />
      </Card>

      <Modal
        title="Edit Review"
        open={!!editModal}
        onOk={handleEditSave}
        onCancel={() => setEditModal(null)}
        okText="Save"
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Dashboard;
