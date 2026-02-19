import { Form, Input, Button, Card, Typography, Space, Radio, Upload, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined, InboxOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

const { Title } = Typography;
const { Dragger } = Upload;

const CreateReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [docSource, setDocSource] = useState('feishu');

  const onFinish = async (values) => {
    try {
      let finalDocUrl = values.docUrl;

      // Handle Local File Upload
      if (docSource === 'local' && values.localFile && values.localFile.length > 0) {
        const file = values.localFile[0].originFileObj;
        const formData = new FormData();
        formData.append('file', file);

        try {
            const uploadRes = await axios.post('http://localhost:5000/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            // The backend returns { filename, path, relativePath }
            // We use relativePath (e.g. 'uploads/my-doc.md') as the docUrl
            finalDocUrl = uploadRes.data.relativePath;
            console.log('File uploaded successfully:', finalDocUrl);
        } catch (uploadErr) {
            console.error('File upload failed:', uploadErr);
            // Fallback or show error? For now, let's alert.
            alert('File upload failed. Please try again.');
            return;
        }
      }

      // 1. Create Session
      const sessionRes = await axios.post('http://localhost:5000/api/sessions', {
        title: values.title,
        description: values.description,
        docUrl: finalDocUrl,
        docSource: docSource, // 'feishu' or 'local'
        referenceDocs: values.referenceDocs || [], 
        owner: user._id,
        status: 'draft'
      });

      const sessionId = sessionRes.data._id;

      // 2. Create Requirements
      if (values.requirements && values.requirements.length > 0) {
        await Promise.all(values.requirements.map(req => 
          axios.post('http://localhost:5000/api/requirements', {
            session: sessionId,
            description: req.description,
            priority: req.priority || 'medium'
          })
        ));
      }

      navigate(`/review/${sessionId}`);
    } catch (err) {
      console.error("Failed to create review", err);
    }
  };

  const normFile = (e) => {
    if (Array.isArray(e)) {
      return e;
    }
    return e?.fileList;
  };

  return (
    <Card title="Create New BRD Review">
      <Form onFinish={onFinish} layout="vertical" initialValues={{ docSource: 'feishu' }}>
        <Form.Item name="title" label="Title" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea />
        </Form.Item>

        <Form.Item label="Document Source" name="docSource">
          <Radio.Group onChange={(e) => setDocSource(e.target.value)} value={docSource}>
            <Radio.Button value="feishu">Feishu URL</Radio.Button>
            <Radio.Button value="local">Local File</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {docSource === 'feishu' ? (
          <Form.Item name="docUrl" label="Primary Feishu Document URL (BRD/PRD)" rules={[{ required: true }]}>
            <Input placeholder="https://mi.feishu.cn/wiki/..." />
          </Form.Item>
        ) : (
          <Form.Item 
            name="localFile" 
            label="Upload Document" 
            valuePropName="fileList" 
            getValueFromEvent={normFile}
            rules={[{ required: true, message: 'Please upload a file' }]}
          >
            <Dragger 
              name="file" 
              multiple={false} 
              beforeUpload={() => false} // Prevent auto upload, handle manually if needed
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag file to this area to upload</p>
              <p className="ant-upload-hint">
                Support for a single upload. Strictly prohibited from uploading company data or other banned files.
              </p>
            </Dragger>
          </Form.Item>
        )}

        <Typography.Title level={5}>Reference Materials (Competitor Analysis, User Feedback, etc.)</Typography.Title>
        <Form.List name="referenceDocs">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start', background: '#fafafa', padding: 12, borderRadius: 6 }}>
                  <Form.Item
                    {...restField}
                    name={[name, 'url']}
                    rules={[{ required: true, message: 'Missing URL' }]}
                    style={{ flex: 2, marginBottom: 0 }}
                  >
                    <Input placeholder="Doc URL (https://...)" />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'note']}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="Note (e.g. Competitor X)" />
                  </Form.Item>
                  <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(name)} style={{ marginTop: 4 }} />
                </div>
              ))}
              <Form.Item>
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Add Reference Doc
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <Typography.Title level={4}>Requirements</Typography.Title>
        <Form.List name="requirements">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    {...restField}
                    name={[name, 'description']}
                    rules={[{ required: true, message: 'Missing requirement description' }]}
                    style={{ width: '400px' }}
                  >
                    <Input placeholder="Requirement description" />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(name)} />
                </Space>
              ))}
              <Form.Item>
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Add Requirement
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Create Review
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default CreateReview;
