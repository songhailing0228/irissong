import { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';
import axios from 'axios';

const { Title } = Typography;

const Dashboard = () => {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/sessions');
        setSessions(res.data);
      } catch (err) {
        console.error("Failed to fetch sessions", err);
      }
    };
    fetchSessions();
  }, []);

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => <Link to={`/review/${record._id}`}>{text}</Link>,
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
      render: status => (
        <Tag color={status === 'completed' ? 'green' : status === 'in_review' ? 'blue' : 'default'}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Participants',
      key: 'participants',
      render: (_, record) => record.participants?.length || 0,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Link to={`/review/${record._id}`}>Open</Link>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2}>My Reviews</Title>
        <Link to="/create">
          <Button type="primary">Create New Review</Button>
        </Link>
      </div>
      <Table columns={columns} dataSource={sessions} rowKey="_id" />
    </div>
  );
};

export default Dashboard;
