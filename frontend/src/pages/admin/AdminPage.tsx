import { Layout, Menu, Button, Space, Alert, message } from 'antd'
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  HomeOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { usePipelineRun, useValidate } from '../../api/admin'
import LanguageSelect from '../../components/LanguageSelect'
import { useLang } from '../../i18n'
import ItemsTab from './ItemsTab'
import RecipesTab from './RecipesTab'
import BuildingsTab from './BuildingsTab'
import ExtractorsTab from './ExtractorsTab'

const { Header, Content, Sider } = Layout

type TabKey = 'items' | 'recipes' | 'buildings' | 'extractors'

export default function AdminPage() {
  const { t } = useLang()
  const location = useLocation()
  const navigate = useNavigate()
  const pathTab = location.pathname.split('/').pop()
  const activeTab: TabKey =
    pathTab === 'recipes' ? 'recipes'
    : pathTab === 'buildings' ? 'buildings'
    : pathTab === 'extractors' ? 'extractors'
    : 'items'

  const pipelineRun = usePipelineRun()
  const validate = useValidate()

  async function handlePipeline() {
    try {
      const result = await pipelineRun.mutateAsync()
      if (result.ok) message.success(t('admin.pipelineDone'))
      else message.error(t('admin.pipelineFailed', { error: result.stderr }))
    } catch {
      message.error(t('admin.pipelineError'))
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',          // 좁은 화면에서 버튼이 잘리지 않게 줄바꿈
          rowGap: 8,
          height: 'auto',
          minHeight: 64,
          lineHeight: 'normal',
          padding: '8px 24px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Space>
          <SettingOutlined style={{ color: 'var(--accent)', fontSize: 20 }} />
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>
            Satisfactory Admin
          </span>
        </Space>
        <Space wrap>
          <LanguageSelect />
          <Link to="/">
            <Button icon={<HomeOutlined />} size="small">
              {t('admin.calculator')}
            </Button>
          </Link>
          <Link to="/setup">
            <Button icon={<SettingOutlined />} size="small">
              {t('setup.title')}
            </Button>
          </Link>
          <Button
            icon={<PlayCircleOutlined />}
            size="small"
            loading={pipelineRun.isPending}
            onClick={handlePipeline}
          >
            {t('admin.runPipeline')}
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            size="small"
            loading={validate.isFetching}
            onClick={() => validate.refetch()}
          >
            {t('admin.runValidate')}
          </Button>
        </Space>
      </Header>

      {/* 500 응답 본문(예외 문자열)은 화면에 내보내지 않음 */}
      {validate.isError && <Alert type="warning" showIcon banner message={t('admin.validateError')} />}
      {!validate.isError && validate.data && (
        validate.data.valid
          ? <Alert type="success" showIcon banner message={t('admin.validateOk', { count: validate.data.warnings.length })} />
          : (
            <Alert
              type="error"
              showIcon
              banner
              message={t('admin.validateFail', { count: validate.data.errors.length })}
              description={
                <>
                  {validate.data.errors.slice(0, 5).map((e, i) => <div key={i}>✖ {e}</div>)}
                  {validate.data.errors.length > 5 && <div>{t('admin.validateMore', { count: validate.data.errors.length - 5 })}</div>}
                </>
              }
            />
          )
      )}

      <Layout>
        <Sider width={180} style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border)' }}>
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            style={{ background: 'transparent', borderRight: 'none', marginTop: 8 }}
            onClick={({ key }) => navigate(`/admin/${key}`)}
            items={[
              { key: 'items', icon: <AppstoreOutlined />, label: t('common.items') },
              { key: 'recipes', icon: <ExperimentOutlined />, label: t('admin.recipes') },
              { key: 'buildings', icon: <HomeOutlined />, label: t('common.buildings') },
              { key: 'extractors', icon: <ToolOutlined />, label: t('admin.extractors') },
            ]}
          />
        </Sider>

        <Content style={{ padding: 24, background: 'var(--bg-app)', minHeight: 'calc(100vh - 64px)' }}>
          {activeTab === 'items' && <ItemsTab />}
          {activeTab === 'recipes' && <RecipesTab />}
          {activeTab === 'buildings' && <BuildingsTab />}
          {activeTab === 'extractors' && <ExtractorsTab />}
        </Content>
      </Layout>
    </Layout>
  )
}
