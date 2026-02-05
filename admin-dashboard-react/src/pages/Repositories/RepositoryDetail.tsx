import React, { useState } from 'react';
import {
  Typography,
  Card,
  Button,
  Tag,
  Space,
  List,
  Empty,
  Spin,
  Alert,
  Select,
  Drawer,
  Avatar,
  Divider,
  Input,
  Badge,
  message,
  Popconfirm,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  BranchesOutlined,
  CodeOutlined,
  DesktopOutlined,
  MessageOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  SendOutlined,
  RocketOutlined,
  LinkOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { threadsApi, repoUrlsApi } from '../../api';
import type { Thread } from '../../types';
import { getTimeAgo, getThreadTitle } from '../../types';
import { StatusBadge } from '../../components/shared';

const { Title, Text } = Typography;
const { TextArea } = Input;

const priorityColors = {
  critical: 'red',
  high: 'orange',
  normal: 'default',
  low: 'blue',
};

export const RepositoryDetail: React.FC = () => {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fullName = `${owner}/${repo}`;

  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [replyText, setReplyText] = useState('');

  // Fetch threads for this repo
  const { data: threads = [], isLoading, error, refetch, isFetching } = useQuery<Thread[]>({
    queryKey: ['threads', 'repo', fullName, statusFilter],
    queryFn: () => threadsApi.getThreads({ repo: fullName, status: statusFilter as any }),
  });

  // Fetch repo URL mappings (for Launch Site button)
  interface RepoUrl {
    id: string;
    repo: string;
    url_pattern: string;
    environment: string;
    branch: string;
    description: string;
  }
  const { data: repoUrls = [] } = useQuery<RepoUrl[]>({
    queryKey: ['repo-urls', fullName],
    queryFn: () => repoUrlsApi.getRepoUrls(fullName),
  });

  // Resolve thread mutation
  const resolveMutation = useMutation({
    mutationFn: (id: string) => threadsApi.resolveThread(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      message.success('Thread resolved');
    },
  });

  // Reopen thread mutation
  const reopenMutation = useMutation({
    mutationFn: (id: string) => threadsApi.reopenThread(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      message.success('Thread reopened');
    },
  });

  // Add message mutation
  const addMessageMutation = useMutation({
    mutationFn: ({ threadId, content }: { threadId: string; content: string }) =>
      threadsApi.addMessage(threadId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      setReplyText('');
      message.success('Reply sent');
    },
  });

  // Delete repo URL mutation
  const deleteRepoUrlMutation = useMutation({
    mutationFn: (id: string) => repoUrlsApi.deleteRepoUrl(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-urls'] });
      message.success('Site disconnected');
    },
    onError: () => {
      message.error('Failed to disconnect site');
    },
  });

  const openDetail = (thread: Thread) => {
    setSelectedThread(thread);
    setDrawerOpen(true);
  };

  const handleReply = async () => {
    if (!selectedThread || !replyText.trim()) return;
    await addMessageMutation.mutateAsync({
      threadId: selectedThread.id,
      content: replyText.trim(),
    });
  };

  const openCount = threads.filter((t) => t.status === 'open').length;
  const resolvedCount = threads.filter((t) => t.status === 'resolved').length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/repositories')}>
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {fullName}
          </Title>
        </Space>
        <Space>
          {repoUrls.length > 0 && (
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => {
                const url = repoUrls[0].url_pattern.replace(/\*+$/, '');
                window.open(url, '_blank');
              }}
            >
              Launch Site
            </Button>
          )}
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          message="Failed to load threads"
          description={error instanceof Error ? error.message : 'Unknown error'}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* Deployed Sites */}
      {repoUrls.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <Space size="large" wrap>
            <div>
              <Text type="secondary">Deployed Sites</Text>
              <div style={{ marginTop: 4 }}>
                {repoUrls.map((url) => (
                  <Space key={url.id} size={4} style={{ marginBottom: 4, marginRight: 8 }}>
                    <Tag
                      icon={<LinkOutlined />}
                      color="blue"
                      style={{ cursor: 'pointer', marginRight: 0 }}
                      onClick={() => window.open(url.url_pattern.replace(/\*+$/, ''), '_blank')}
                    >
                      {url.url_pattern} ({url.environment || 'production'})
                    </Tag>
                    <Popconfirm
                      title="Disconnect this site?"
                      description="This will remove the URL mapping. Comments will remain."
                      onConfirm={() => deleteRepoUrlMutation.mutate(url.id)}
                      okText="Disconnect"
                      okButtonProps={{ danger: true }}
                      cancelText="Cancel"
                    >
                      <Tooltip title="Disconnect site">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          loading={deleteRepoUrlMutation.isPending}
                        />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                ))}
              </div>
            </div>
          </Space>
        </Card>
      )}

      {/* Stats & Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <div>
            <Text type="secondary">Open</Text>
            <div>
              <Badge count={openCount} style={{ backgroundColor: '#faad14' }} showZero />
            </div>
          </div>
          <div>
            <Text type="secondary">Resolved</Text>
            <div>
              <Badge count={resolvedCount} style={{ backgroundColor: '#52c41a' }} showZero />
            </div>
          </div>
          <Divider type="vertical" style={{ height: 40 }} />
          <Select
            placeholder="All Status"
            allowClear
            style={{ width: 150 }}
            onChange={setStatusFilter}
            value={statusFilter}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
        </Space>
      </Card>

      {/* Threads List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : threads.length > 0 ? (
        <List
          dataSource={threads}
          renderItem={(thread) => (
            <Card
              style={{ marginBottom: 12, cursor: 'pointer' }}
              onClick={() => openDetail(thread)}
              hoverable
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <Space wrap style={{ marginBottom: 8 }}>
                    <StatusBadge status={thread.status} />
                    <Tag
                      icon={thread.context_type === 'code' ? <CodeOutlined /> : <DesktopOutlined />}
                    >
                      {thread.context_type}
                    </Tag>
                    {thread.priority !== 'normal' && (
                      <Tag color={priorityColors[thread.priority]}>{thread.priority}</Tag>
                    )}
                    <Tag icon={<BranchesOutlined />}>{thread.branch}</Tag>
                  </Space>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>{getThreadTitle(thread)}</Text>
                  </div>
                  {thread.first_message && (
                    <Text type="secondary">
                      {thread.first_message.length > 100
                        ? thread.first_message.substring(0, 100) + '...'
                        : thread.first_message}
                    </Text>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <MessageOutlined /> {thread.message_count || 0}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <ClockCircleOutlined /> {getTimeAgo(thread.created_at)}
                      </Text>
                      {thread.creator_name && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          by {thread.creator_name}
                        </Text>
                      )}
                    </Space>
                  </div>
                </div>
                <Space>
                  {thread.status === 'open' ? (
                    <Button
                      size="small"
                      icon={<CheckOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        resolveMutation.mutate(thread.id);
                      }}
                      loading={resolveMutation.isPending}
                    >
                      Resolve
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        reopenMutation.mutate(thread.id);
                      }}
                      loading={reopenMutation.isPending}
                    >
                      Reopen
                    </Button>
                  )}
                </Space>
              </div>
            </Card>
          )}
        />
      ) : (
        <Card>
          <Empty description="No threads found for this repository" />
        </Card>
      )}

      {/* Detail Drawer */}
      <Drawer
        title="Thread Details"
        placement="right"
        width={500}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedThread && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Text type="secondary">Status</Text>
              <div>
                <StatusBadge status={selectedThread.status} />
              </div>
            </div>

            <div>
              <Text type="secondary">Branch</Text>
              <div>
                <Tag icon={<BranchesOutlined />}>{selectedThread.branch}</Tag>
              </div>
            </div>

            <div>
              <Text type="secondary">Context</Text>
              <div>
                <Tag
                  icon={
                    selectedThread.context_type === 'code' ? <CodeOutlined /> : <DesktopOutlined />
                  }
                >
                  {selectedThread.context_type === 'code'
                    ? `${selectedThread.file_path}${selectedThread.line_start ? `:${selectedThread.line_start}` : ''}`
                    : selectedThread.selector || 'UI Element'}
                </Tag>
              </div>
            </div>

            <div>
              <Text type="secondary">Priority</Text>
              <div>
                <Tag color={priorityColors[selectedThread.priority]}>{selectedThread.priority}</Tag>
              </div>
            </div>

            {selectedThread.screenshot_url && (
              <div>
                <Text type="secondary">Screenshot</Text>
                <div style={{ marginTop: 8 }}>
                  <img
                    src={selectedThread.screenshot_url}
                    alt="Screenshot"
                    style={{ borderRadius: 8, maxWidth: '100%' }}
                  />
                </div>
              </div>
            )}

            {selectedThread.code_snippet && (
              <div>
                <Text type="secondary">Code Snippet</Text>
                <pre
                  style={{
                    background: 'var(--ant-color-bg-container)',
                    padding: 12,
                    borderRadius: 8,
                    overflow: 'auto',
                    fontSize: 12,
                    border: '1px solid var(--ant-color-border)',
                  }}
                >
                  {selectedThread.code_snippet}
                </pre>
              </div>
            )}

            <Divider />

            <div>
              <Text type="secondary">
                Discussion ({selectedThread.message_count || 0} messages)
              </Text>
              {selectedThread.messages && selectedThread.messages.length > 0 ? (
                <List
                  dataSource={selectedThread.messages}
                  renderItem={(msg) => (
                    <List.Item style={{ padding: '8px 0' }}>
                      <List.Item.Meta
                        avatar={
                          <Avatar size="small" src={msg.author_avatar}>
                            {msg.author_name?.[0] || '?'}
                          </Avatar>
                        }
                        title={<Text strong>{msg.author_name || 'Unknown'}</Text>}
                        description={
                          <>
                            <Text>{msg.content}</Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {getTimeAgo(msg.created_at)}
                            </Text>
                          </>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Text type="secondary">No messages yet</Text>
              )}
            </div>

            <Space direction="vertical" style={{ width: '100%' }}>
              <TextArea
                placeholder="Add a reply..."
                autoSize={{ minRows: 2, maxRows: 4 }}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {selectedThread.status === 'open' ? (
                  <Button
                    icon={<CheckOutlined />}
                    onClick={() => resolveMutation.mutate(selectedThread.id)}
                    loading={resolveMutation.isPending}
                  >
                    Resolve
                  </Button>
                ) : (
                  <Button
                    onClick={() => reopenMutation.mutate(selectedThread.id)}
                    loading={reopenMutation.isPending}
                  >
                    Reopen
                  </Button>
                )}
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleReply}
                  loading={addMessageMutation.isPending}
                  disabled={!replyText.trim()}
                >
                  Reply
                </Button>
              </div>
            </Space>
          </Space>
        )}
      </Drawer>
    </div>
  );
};

export default RepositoryDetail;
