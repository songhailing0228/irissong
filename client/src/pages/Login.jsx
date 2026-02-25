import { Form, Input, Button, Select, Typography } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    const success = await login(values.name, values.role, values.country);
    if (success) {
      navigate('/dashboard');
    } else {
      alert('Login failed. Please try a different name.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    }}>
      <div style={{
        width: 420,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 16,
        padding: '48px 40px 40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <RobotOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={3} style={{ marginBottom: 4 }}>BRD Review</Title>
          <Text type="secondary">AI-Powered Multi-Agent Document Review</Text>
        </div>

        <Form onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Please enter your name' }]}>
            <Input placeholder="Your name" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select a role' }]}>
            <Select placeholder="Select your role">
              <Option value="owner">BRD Owner</Option>
              <Option value="stakeholder">Stakeholder</Option>
              <Option value="pm">Product Manager</Option>
              <Option value="dev">Developer</Option>
            </Select>
          </Form.Item>
          <Form.Item name="country" label="Region">
            <Select placeholder="Select region (optional)">
              <Option value="Global">Global</Option>
              <Option value="US">US</Option>
              <Option value="CN">China</Option>
              <Option value="EU">Europe</Option>
            </Select>
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            style={{
              height: 44,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              border: 'none',
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            Sign In
          </Button>
        </Form>
      </div>
    </div>
  );
};

export default Login;
