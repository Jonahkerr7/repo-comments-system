import React, { useState } from 'react';
import {
  Typography,
  Card,
  Row,
  Col,
  Button,
  Tag,
  Empty,
  Alert,
  Tooltip,
  Badge,
  Space,
  message,
  Modal,
  List,
  Input,
  Popconfirm,
} from 'antd';
import {
  GithubOutlined,
  ReloadOutlined,
  MessageOutlined,
  LinkOutlined,
  PlusOutlined,
  RocketOutlined,
  SearchOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reposApi } from '../../api';

const { Title, Text } = Typography;

interface ConnectedRepo {
  repo: string;
  role: string;
  connected_at: string;
  urls: { url_pattern: string; environment: string }[];
  threads: { open: number; resolved: number };
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  html_url: string;
  description: string | null;
}

export const RepositoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch connected repos (repos user has permissions for)
  const {
    data: connectedRepos = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<ConnectedRepo[]>({
    queryKey: ['connected-repositories'],
    queryFn: reposApi.getConnectedRepos,
  });

  // Fetch all GitHub repos (only when modal is open)
  const { data: allGitHubRepos = [], isLoading: loadingGitHub } = useQuery<GitHubRepository[]>({
    queryKey: ['github-repositories'],
    queryFn: reposApi.getGitHubRepos,
    enabled: addModalOpen,
  });

  // Connect repo mutation
  const connectMutation = useMutation({
    mutationFn: (repoFullName: string) => reposApi.connectRepo(repoFullName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
      message.success('Repository connected! GitHub Pages URL auto-registered.');
      setAddModalOpen(false);
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : 'Failed to connect repository');
    },
  });

  // Disconnect repo mutation
  const disconnectMutation = useMutation({
    mutationFn: (repoFullName: string) => {
      const [owner, repo] = repoFullName.split('/');
      return reposApi.disconnectRepo(owner, repo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
      message.success('Repository disconnected');
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : 'Failed to disconnect repository');
    },
  });

  const handleViewRepo = (fullName: string) => {
    const [owner, repo] = fullName.split('/');
    navigate(`/repositories/${owner}/${repo}`);
  };

  const handleLaunchSite = (urls: { url_pattern: string }[]) => {
    if (urls.length > 0) {
      const url = urls[0].url_pattern.replace(/\*+$/, '');
      window.open(url, '_blank');
    }
  };

  // Filter repos already connected
  const connectedRepoNames = new Set(connectedRepos.map((r) => r.repo));
  const availableRepos = allGitHubRepos.filter((r) => !connectedRepoNames.has(r.full_name));

  // Filter by search term
  const filteredRepos = availableRepos.filter(
    (r) =>
      r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>My Repositories</Title>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
          >
            Add Repository
          </Button>
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
          message="Failed to load repositories"
          description={error instanceof Error ? error.message : 'Unknown error occurred'}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {isLoading ? (
        <Row gutter={[16, 16]}>
          {[1, 2, 3].map((i) => (
            <Col key={i} xs={24} sm={12} lg={8}>
              <Card loading />
            </Col>
          ))}
        </Row>
      ) : connectedRepos.length > 0 ? (
        <Row gutter={[16, 16]}>
          {connectedRepos.map((repo) => {
            const hasUrl = repo.urls.length > 0;
            const totalThreads = repo.threads.open + repo.threads.resolved;

            return (
              <Col key={repo.repo} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  onClick={() => handleViewRepo(repo.repo)}
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <GithubOutlined />
                      <Tooltip title={repo.repo}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {repo.repo.split('/')[1]}
                        </span>
                      </Tooltip>
                    </div>
                  }
                  extra={
                    <Space size={0}>
                      {hasUrl && (
                        <Button
                          type="text"
                          size="small"
                          icon={<RocketOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLaunchSite(repo.urls);
                          }}
                        >
                          Launch
                        </Button>
                      )}
                      <Popconfirm
                        title="Disconnect repository?"
                        description="This will remove the repo and all URL mappings."
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          disconnectMutation.mutate(repo.repo);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText="Disconnect"
                        okButtonProps={{ danger: true }}
                        cancelText="Cancel"
                      >
                        <Tooltip title="Disconnect repo">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                            loading={disconnectMutation.isPending}
                          />
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  }
                >
                  <div style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {repo.repo}
                    </Text>
                  </div>

                  {/* Deployed URL */}
                  {hasUrl && (
                    <div style={{ marginBottom: 12 }}>
                      <Tag icon={<LinkOutlined />} color="blue">
                        {repo.urls[0].url_pattern.replace('/*', '')}
                      </Tag>
                    </div>
                  )}

                  {/* Thread counts */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size="small">
                      <Tooltip title="Open threads">
                        <Badge
                          count={repo.threads.open}
                          style={{ backgroundColor: repo.threads.open > 0 ? '#faad14' : '#d9d9d9' }}
                          showZero
                        />
                      </Tooltip>
                      <Text type="secondary" style={{ fontSize: 11 }}>open</Text>
                      <Tooltip title="Resolved threads">
                        <Badge
                          count={repo.threads.resolved}
                          style={{ backgroundColor: '#52c41a' }}
                          showZero
                        />
                      </Tooltip>
                      <Text type="secondary" style={{ fontSize: 11 }}>resolved</Text>
                    </Space>
                    <Button
                      size="small"
                      type={totalThreads > 0 ? 'primary' : 'default'}
                      icon={<MessageOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewRepo(repo.repo);
                      }}
                    >
                      View
                    </Button>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : (
        <Card>
          <Empty
            description="No repositories connected yet"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
              Add Your First Repository
            </Button>
          </Empty>
        </Card>
      )}

      {/* Add Repository Modal */}
      <Modal
        title="Add Repository"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        footer={null}
        width={600}
      >
        <Input
          placeholder="Search repositories..."
          prefix={<SearchOutlined />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {loadingGitHub ? (
          <div style={{ textAlign: 'center', padding: 40 }}>Loading repositories...</div>
        ) : filteredRepos.length > 0 ? (
          <List
            dataSource={filteredRepos}
            style={{ maxHeight: 400, overflow: 'auto' }}
            renderItem={(repo) => (
              <List.Item
                actions={[
                  <Button
                    key="connect"
                    type="primary"
                    size="small"
                    loading={connectMutation.isPending}
                    onClick={() => connectMutation.mutate(repo.full_name)}
                  >
                    Connect
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<GithubOutlined style={{ fontSize: 24 }} />}
                  title={repo.full_name}
                  description={repo.description || 'No description'}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description={searchTerm ? 'No matching repositories' : 'All repositories already connected'} />
        )}
      </Modal>
    </div>
  );
};

export default RepositoriesPage;
