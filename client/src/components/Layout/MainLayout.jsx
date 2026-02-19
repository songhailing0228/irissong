import { Layout, Menu, Button, Avatar } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Outlet } from 'react-router-dom';

const { Header, Content } = Layout;

const MainLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          BRD Review App
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user && (
            <>
              <span style={{ color: 'white' }}>{user.name} ({user.role})</span>
              <Button type="text" icon={<LogoutOutlined />} style={{ color: 'white' }} onClick={handleLogout} />
            </>
          )}
        </div>
      </Header>
      <Content style={{ padding: '24px' }}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default MainLayout;
