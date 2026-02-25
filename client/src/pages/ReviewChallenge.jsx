import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Button, Progress, Typography, Tag, Space, Modal,
  Input, Spin, message, Tooltip, Collapse,
} from 'antd';
import {
  ArrowLeftOutlined, TrophyOutlined, WarningOutlined,
  CheckCircleOutlined, ThunderboltOutlined, ReloadOutlined, SaveOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const API = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const scoreColor = (score) => {
  if (score >= 85) return '#52c41a';
  if (score >= 75) return '#1890ff';
  if (score >= 60) return '#faad14';
  return '#ff4d4f';
};

const ScoreCircle = ({ score, size = 80, passLine }) => {
  const passed = score >= passLine;
  const color = passed ? '#52c41a' : '#ff4d4f';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `4px solid ${color}`, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.35, fontWeight: 700, color, lineHeight: 1 }}>
        {score}
      </span>
      <span style={{
        fontSize: size * 0.14, color, marginTop: 2, fontWeight: 500,
      }}>
        {passed ? '通过' : '未通过'}
      </span>
    </div>
  );
};

const SectionBar = ({ name, score, onChallenge }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
    <Text style={{ width: 140, fontSize: 13, flexShrink: 0 }} ellipsis={{ tooltip: name }}>
      {name}
    </Text>
    <Progress
      percent={score}
      strokeColor={scoreColor(score)}
      trailColor="#f0f0f0"
      showInfo={false}
      style={{ flex: 1, margin: 0 }}
      size="small"
    />
    <Text strong style={{ width: 30, textAlign: 'right', fontSize: 13 }}>{score}</Text>
    <Tooltip title="挑战这个评分">
      <Button
        size="small"
        type="text"
        icon={<WarningOutlined />}
        onClick={onChallenge}
        style={{ color: '#faad14', fontSize: 12 }}
      >
        挑战
      </Button>
    </Tooltip>
  </div>
);

const ReviewerCard = ({ reviewer, onChallenge, expanded, onToggle }) => {
  const color = reviewer.color || '#8c8c8c';
  return (
    <Card
      size="small"
      style={{
        borderRadius: 12, marginBottom: 12, overflow: 'hidden',
        borderLeft: `4px solid ${color}`,
      }}
      styles={{ body: { padding: 0 } }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', padding: '14px 20px',
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={onToggle}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: 16, fontWeight: 700, marginRight: 12, flexShrink: 0,
          border: `2px solid ${color}40`,
        }}>
          {reviewer.label.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong style={{ fontSize: 14 }}>{reviewer.label}</Text>
            <Tag style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', borderRadius: 4 }}>
              权重 {reviewer.weight}%
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {reviewer.overallFeedback}
          </Text>
        </div>
        <span style={{
          fontSize: 32, fontWeight: 700, color: scoreColor(reviewer.overallScore),
          marginLeft: 16, flexShrink: 0,
        }}>
          {reviewer.overallScore}
        </span>
        <span style={{ marginLeft: 8, color: '#999', fontSize: 18 }}>
          {expanded ? '∧' : '＞'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 20px 16px', borderTop: '1px solid #f5f5f5' }}>
          <div style={{ padding: '12px 0' }}>
            {reviewer.sections?.map((sec, i) => (
              <SectionBar
                key={i}
                name={sec.name}
                score={sec.score}
                onChallenge={() => onChallenge(reviewer, sec)}
              />
            ))}
          </div>
          {reviewer.overallFeedback && (
            <div style={{
              background: '#fafafa', borderRadius: 8, padding: '10px 14px', marginTop: 4,
            }}>
              <Text strong style={{ fontSize: 12 }}>总体反馈</Text>
              <Paragraph style={{ fontSize: 12, marginBottom: 0, marginTop: 4, color: '#666' }}>
                {reviewer.overallFeedback}
              </Paragraph>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default function ReviewChallenge() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(0);
  const [challengeModal, setChallengeModal] = useState(null);
  const [challengeInput, setChallengeInput] = useState('');
  const [challenging, setChallenging] = useState(false);

  const docUrl = searchParams.get('docUrl') || '';
  const agentsParam = searchParams.get('agents') || '[]';

  useEffect(() => {
    loadOrGenerate();
  }, [id]);

  const loadOrGenerate = async () => {
    setLoading(true);
    try {
      const sessionResp = await fetch(`${API}/api/sessions/${id}`);
      if (sessionResp.ok) {
        const sessionData = await sessionResp.json();
        if (sessionData.scoringResults?.savedAt) {
          setData(sessionData.scoringResults);
          setLoading(false);
          return;
        }
      }
    } catch {}
    await generateScores();
  };

  const generateScores = async () => {
    setLoading(true);
    try {
      let agents = [];
      try { agents = JSON.parse(decodeURIComponent(agentsParam)); } catch {}

      const resp = await fetch(`${API}/api/scoring/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: id,
          docUrl,
          selectedAgents: agents,
          passLine: 75,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const result = await resp.json();
      setData(result);
    } catch (e) {
      message.error('评分生成失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveScoring = async () => {
    if (!data) return;
    try {
      const resp = await fetch(`${API}/api/sessions/${id}/scoring`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error(await resp.text());
      message.success('评分结果已保存');
    } catch (e) {
      message.error('保存失败: ' + e.message);
    }
  };

  const handleChallenge = (reviewer, section) => {
    setChallengeModal({ reviewer, section });
    setChallengeInput('');
  };

  const submitChallenge = async () => {
    if (!challengeInput.trim()) return message.warning('请输入你的挑战理由');
    setChallenging(true);
    try {
      const { reviewer, section } = challengeModal;
      const resp = await fetch(`${API}/api/scoring/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docUrl,
          agentRole: reviewer.role,
          agentLabel: reviewer.label,
          sectionName: section.name,
          currentScore: section.score,
          userArgument: challengeInput,
          focusArea: reviewer.focusArea,
          context: reviewer.context,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const result = await resp.json();

      // Update score in local state
      setData(prev => {
        const updated = { ...prev };
        updated.reviewers = prev.reviewers.map(r => {
          if (r.role !== reviewer.role) return r;
          const newSections = r.sections.map(s =>
            s.name === section.name ? { ...s, score: result.newScore, feedback: result.feedback } : s
          );
          const newOverall = Math.round(newSections.reduce((s, sec) => s + sec.score, 0) / newSections.length);
          return { ...r, sections: newSections, overallScore: newOverall };
        });
        const wTotal = updated.reviewers.reduce((s, r) => s + r.overallScore * r.weight, 0);
        const wSum = updated.reviewers.reduce((s, r) => s + r.weight, 0);
        updated.overallScore = wSum > 0 ? +(wTotal / wSum).toFixed(1) : 0;
        updated.passed = updated.overallScore >= updated.passLine;
        return updated;
      });

      const diff = result.newScore - section.score;
      message.success(
        `${reviewer.label} 重新评估「${section.name}」：${section.score} → ${result.newScore}（${diff >= 0 ? '+' : ''}${diff}）`
      );

      Modal.info({
        title: '挑战结果',
        width: 500,
        content: (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <div>
                <Text type="secondary">原分</Text>
                <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(result.previousScore) }}>
                  {result.previousScore}
                </div>
              </div>
              <span style={{ fontSize: 20 }}>→</span>
              <div>
                <Text type="secondary">新分</Text>
                <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(result.newScore) }}>
                  {result.newScore}
                </div>
              </div>
            </div>
            <Paragraph style={{ fontSize: 13, color: '#555' }}>{result.reasoning}</Paragraph>
          </div>
        ),
      });

      setChallengeModal(null);
    } catch (e) {
      message.error('挑战失败: ' + e.message);
    } finally {
      setChallenging(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
        <Spin size="large" />
        <Text type="secondary">AI 评审员正在逐项评分，请稍候...</Text>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Text type="secondary">评分数据加载失败</Text>
        <br />
        <Button onClick={() => navigate(-1)} style={{ marginTop: 16 }}>返回</Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(-1)} />
        <div style={{ marginLeft: 8 }}>
          <Title level={4} style={{ margin: 0 }}>评审挑战</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            多角色 AI 评审员对 PRD 进行评分和反馈，你可以对任何评分发起挑战
          </Text>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={<SaveOutlined />} onClick={saveScoring}>保存评分</Button>
          <Button icon={<ReloadOutlined />} onClick={generateScores}>重新评分</Button>
        </div>
      </div>

      {/* Overall Score Card */}
      <Card
        style={{
          borderRadius: 16, marginBottom: 20,
          background: data.passed
            ? 'linear-gradient(135deg, #f6ffed 0%, #fff 100%)'
            : 'linear-gradient(135deg, #fff2f0 0%, #fff 100%)',
        }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <ScoreCircle score={data.overallScore} size={90} passLine={data.passLine} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text type="secondary">及格线：{data.passLine} 分</Text>
            </div>
            <Progress
              percent={data.overallScore}
              success={{ percent: data.passLine, strokeColor: 'transparent' }}
              strokeColor={data.passed ? '#52c41a' : '#ff4d4f'}
              trailColor="#f0f0f0"
              showInfo={false}
              style={{ margin: 0 }}
            />
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {data.reviewers.map((r, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: r.color, display: 'inline-block',
                  }} />
                  {r.label}: {r.overallScore}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Reviewer Cards */}
      {data.reviewers.map((reviewer, idx) => (
        <ReviewerCard
          key={reviewer.role}
          reviewer={reviewer}
          expanded={expandedIdx === idx}
          onToggle={() => setExpandedIdx(expandedIdx === idx ? -1 : idx)}
          onChallenge={(r, sec) => handleChallenge(r, sec)}
        />
      ))}

      {/* Challenge Modal */}
      <Modal
        title={challengeModal ? `挑战「${challengeModal.reviewer.label}」对「${challengeModal.section.name}」的评分` : ''}
        open={!!challengeModal}
        onCancel={() => setChallengeModal(null)}
        onOk={submitChallenge}
        confirmLoading={challenging}
        okText="发起挑战"
        cancelText="取消"
        width={520}
      >
        {challengeModal && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: '#fafafa', borderRadius: 8, marginBottom: 16,
            }}>
              <Text>当前评分：</Text>
              <span style={{
                fontSize: 28, fontWeight: 700,
                color: scoreColor(challengeModal.section.score),
              }}>
                {challengeModal.section.score}
              </span>
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {challengeModal.section.feedback}
              </Text>
            </div>
            <Text strong style={{ fontSize: 13 }}>你的挑战理由：</Text>
            <TextArea
              rows={4}
              value={challengeInput}
              onChange={e => setChallengeInput(e.target.value)}
              placeholder="说明你认为这个评分不合理的原因，例如：这个章节已经详细描述了XX场景，不应该只有75分..."
              style={{ marginTop: 8 }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
