import { Form, Input, Button, Select, Card, Typography } from 'antd';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;
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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400 }}>
        <Title level={2} style={{ textAlign: 'center' }}>BRD Review Login</Title>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Enter your name" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select placeholder="Select Role">
              <Option value="owner">BRD Owner</Option>
              <Option value="stakeholder">Stakeholder</Option>
              <Option value="pm">Product Manager</Option>
              <Option value="dev">Developer</Option>
            </Select>
          </Form.Item>
          <Form.Item name="country" label="Country (for Stakeholders)">
            <Select placeholder="Select Country">
              <Option value="Global">Global</Option>
              <Option value="US">US</Option>
              <Option value="CN">China</Option>
              <Option value="EU">Europe</Option>
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Login
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
