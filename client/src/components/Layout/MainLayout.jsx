import { Layout, Button, Avatar, Typography, Space } from 'antd';
import { LogoutOutlined, RobotOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Outlet } from 'react-router-dom';

const { Header, Content } = Layout;
const { Text } = Typography;

const MainLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f6fa' }}>
      <Header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        padding: '0 32px',
        height: 56,
        lineHeight: '56px',
      }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>BRD Review</Text>
        </div>
        {user && (
          <Space size={12}>
            <Avatar size="small" style={{ background: '#667eea' }}>
              {user.name?.[0]?.toUpperCase()}
            </Avatar>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
              {user.name} · {user.role}
            </Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{ color: 'rgba(255,255,255,0.65)' }}
              size="small"
            />
          </Space>
        )}
      </Header>
      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default MainLayout;
