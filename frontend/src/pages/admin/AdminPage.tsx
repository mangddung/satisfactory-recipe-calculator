import { Layout, Menu, Button, Space, message } from 'antd'
import {
  AppstoreOutlined,
  ExperimentOutlined,
  HomeOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { usePipelineRun } from '../../api/admin'
import ItemsTab from './ItemsTab'
import RecipesTab from './RecipesTab'
import BuildingsTab from './BuildingsTab'
import ExtractorsTab from './ExtractorsTab'

const { Header, Content, Sider } = Layout

type TabKey = 'items' | 'recipes' | 'buildings' | 'extractors'

export default function AdminPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathTab = location.pathname.split('/').pop()
  const activeTab: TabKey =
    pathTab === 'recipes' ? 'recipes'
    : pathTab === 'buildings' ? 'buildings'
    : pathTab === 'extractors' ? 'extractors'
    : 'items'

  const pipelineRun = usePipelineRun()

  async function handlePipeline() {
    try {
      const result = await pipelineRun.mutateAsync()
      if (result.ok) message.success('파이프라인 완료')
      else message.error(`파이프라인 실패\n${result.stderr}`)
    } catch {
      message.error('파이프라인 실행 오류')
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: '#0d0d1a',
          borderBottom: '1px solid #1e1e2e',
        }}
      >
        <Space>
          <SettingOutlined style={{ color: '#e8b84b', fontSize: 20 }} />
          <span style={{ color: '#e8b84b', fontWeight: 700, fontSize: 16 }}>
            Satisfactory Admin
          </span>
        </Space>
        <Space>
          <Link to="/">
            <Button icon={<HomeOutlined />} size="small">
              계산기
            </Button>
          </Link>
          <Button
            icon={<PlayCircleOutlined />}
            size="small"
            loading={pipelineRun.isPending}
            onClick={handlePipeline}
          >
            파이프라인 실행
          </Button>
        </Space>
      </Header>

      <Layout>
        <Sider width={180} style={{ background: '#0d0d1a', borderRight: '1px solid #1e1e2e' }}>
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            style={{ background: 'transparent', borderRight: 'none', marginTop: 8 }}
            onClick={({ key }) => navigate(`/admin/${key}`)}
            items={[
              { key: 'items', icon: <AppstoreOutlined />, label: '아이템' },
              { key: 'recipes', icon: <ExperimentOutlined />, label: '레시피' },
              { key: 'buildings', icon: <HomeOutlined />, label: '건물' },
              { key: 'extractors', icon: <ToolOutlined />, label: '추출기' },
            ]}
          />
        </Sider>

        <Content style={{ padding: 24, background: '#0a0a12', minHeight: 'calc(100vh - 64px)' }}>
          {activeTab === 'items' && <ItemsTab />}
          {activeTab === 'recipes' && <RecipesTab />}
          {activeTab === 'buildings' && <BuildingsTab />}
          {activeTab === 'extractors' && <ExtractorsTab />}
        </Content>
      </Layout>
    </Layout>
  )
}
