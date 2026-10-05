import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  ConfigProvider,
  Descriptions,
  Modal,
  Progress,
  Result,
  Select,
  Spin,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd'
import { LoadingOutlined, SettingOutlined } from '@ant-design/icons'
import koKR from 'antd/locale/ko_KR'
import enUS from 'antd/locale/en_US'
import type { ApiError } from '../../api'
import {
  useCleanup,
  useCleanupPreview,
  useRunSetup,
  useSetupStatus,
  type CleanupPreview,
  type CleanupResult,
  type SetupResult,
  type SetupRunError,
} from '../../api/setup'
import { BROWSER_UI_LANG, makeT, matchBrowserLanguages, nativeName } from '../../i18n'

// setup page text follows the browser language only (not the app language / sc_lang cookie)
const t = makeT(BROWSER_UI_LANG)

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${i ? bytes.toFixed(1) : bytes} ${units[i]}`
}

// icon path 'FactoryGame/X/Y.png' -> texture in the FModel tree 'FactoryGame/Content/FactoryGame/X/Y'
function fmodelPath(iconPath: string): string {
  return `FactoryGame/Content/${iconPath.replace(/\.png$/i, '')}`
}

// previous setup's languages; first run: en-US + every browser language found in the list; else the first file
function initialSelection(codes: string[], previous: string[] | undefined): string[] {
  const prev = previous?.filter((c) => codes.includes(c))
  if (prev?.length) return prev
  const picks = [...new Set([...codes.filter((c) => c === 'en-US'), ...matchBrowserLanguages(codes)])]
  return picks.length ? picks : codes.slice(0, 1)
}

const intro: CSSProperties = { color: '#9aaabb', marginTop: 0 }
const muted: CSSProperties = { color: '#5a6a8a', fontSize: 12 }
const label: CSSProperties = { color: '#9aaabb', fontWeight: 600, marginBottom: 6 }
const list: CSSProperties = { margin: '4px 0 0', paddingInlineStart: 20 }
const footer: CSSProperties ={ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 24 }
const scrollBox: CSSProperties = {
  maxHeight: 280,
  overflowY: 'auto',
  background: '#0e0e20',
  border: '1px solid #181830',
  borderRadius: 6,
  padding: '4px 12px',
}

// onDone(null) = skipped / nothing to clean
function CleanupStep({ onBack, onDone }: { onBack: () => void; onDone: (deleted: CleanupResult | null) => void }) {
  const preview = useCleanupPreview()
  const cleanup = useCleanup()
  const [modal, modalHolder] = Modal.useModal()
  const data = preview.data

  const countSize = (count: number, bytes: number) =>
    t('setup.cleanup.countSize', { count, size: formatBytes(bytes) })

  function confirmDelete(p: CleanupPreview) {
    modal.confirm({
      title: t('setup.cleanup.confirmTitle'),
      content: t('setup.cleanup.confirmContent', { count: p.totalCount, size: formatBytes(p.totalBytes) }),
      okText: t('setup.cleanup.confirmOk'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      autoFocusButton: 'cancel', // Enter must not delete
      onOk: () =>
        cleanup.mutateAsync().then(
          (r) => {
            message.success(t('setup.cleanup.deleted', { count: r.deletedCount, size: formatBytes(r.deletedBytes) }))
            onDone(r)
          },
          () => message.error(t('setup.cleanup.deleteFailed')),
        ),
    })
  }

  if (!data) {
    if (!preview.isError) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
          <div style={{ ...muted, marginTop: 12 }}>{t('setup.cleanup.scanning')}</div>
        </div>
      )
    }
    return (
      <>
        <Alert
          type="error"
          showIcon
          title={t('setup.cleanup.loadFailed')}
          action={<Button size="small" onClick={() => preview.refetch()}>{t('setup.recheck')}</Button>}
        />
        <div style={footer}>
          <Button onClick={onBack}>{t('setup.back')}</Button>
          <Button onClick={() => onDone(null)}>{t('setup.cleanup.skip')}</Button>
        </div>
      </>
    )
  }

  if (!data.totalCount) {
    return (
      <>
        <Alert type="success" showIcon title={t('setup.cleanup.nothing')} />
        <div style={footer}>
          <Button onClick={onBack}>{t('setup.back')}</Button>
          <Button type="primary" onClick={() => onDone(null)}>{t('setup.next')}</Button>
        </div>
      </>
    )
  }

  const samples = data.other.samples.slice(0, 5)
  return (
    <>
      {modalHolder}
      <p style={intro}>{t('setup.cleanup.intro')}</p>
      <Descriptions
        column={1}
        bordered
        size="small"
        items={[
          {
            key: 'languages',
            label: t('setup.cleanup.languages'),
            children: (
              <>
                {countSize(data.languages.files.length, data.languages.bytes)}
                {data.languages.files.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {data.languages.files.map((f) => (
                      <Tag key={f.code} style={{ marginInlineEnd: 0 }}>{f.code}</Tag>
                    ))}
                  </div>
                )}
              </>
            ),
          },
          { key: 'pngs', label: t('setup.cleanup.pngs'), children: countSize(data.pngs.count, data.pngs.bytes) },
          {
            key: 'other',
            label: t('setup.cleanup.other'),
            children: (
              <>
                {countSize(data.other.count, data.other.bytes)}
                {samples.map((s) => (
                  <div key={s} style={{ ...muted, wordBreak: 'break-all' }}>{s}</div>
                ))}
                {data.other.count > samples.length && (
                  <div style={muted}>… {t('setup.cleanup.more', { count: data.other.count - samples.length })}</div>
                )}
              </>
            ),
          },
          {
            key: 'total',
            label: t('setup.cleanup.total'),
            children: <b>{countSize(data.totalCount, data.totalBytes)}</b>,
          },
        ]}
      />
      <Alert
        type="warning"
        showIcon
        style={{ marginTop: 16 }}
        title={t('setup.cleanup.warnTitle')}
        description={
          <ul style={list}>
            <li>{t('setup.cleanup.warnBackup')}</li>
            <li>{t('setup.cleanup.warnReadd')}</li>
          </ul>
        }
      />
      <div style={footer}>
        <Button onClick={onBack}>{t('setup.back')}</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => onDone(null)}>{t('setup.cleanup.skip')}</Button>
          <Button type="primary" danger onClick={() => confirmDelete(data)}>
            {t('setup.cleanup.delete')}
          </Button>
        </div>
      </div>
    </>
  )
}

export default function SetupPage() {
  const [step, setStep] = useState(0)
  const status = useSetupStatus()
  const runSetup = useRunSetup()
  const [checkedState, setChecked] = useState<string[] | null>(null) // null = not touched -> initial selection
  const [defaultState, setDefault] = useState<string | null>(null)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [deleted, setDeleted] = useState<CleanupResult | null>(null) // null = cleanup not performed

  const files = status.data?.gameData.languageFiles ?? []
  const codes = files.map((f) => f.code)
  const previous = status.data?.setup
  const checked = checkedState ?? initialSelection(codes, previous?.languages)
  // chosen default if still checked, else previous default, else browser language, else en-US, else first checked
  const defaultLanguage =
    [defaultState, previous?.defaultLanguage, ...matchBrowserLanguages(checked), 'en-US']
      .find((c) => c && checked.includes(c)) ?? checked[0]
  const running = runSetup.isPending
  const runError = (runSetup.error as ApiError | null)?.body as SetupRunError | null | undefined

  function run() {
    runSetup.mutate(
      { languages: checked, defaultLanguage },
      {
        onSuccess: (setup) => {
          setResult(setup)
          setStep(2)
        },
      },
    )
  }

  const runAlerts = (
    <>
      {running && (
        <Alert type="info" showIcon icon={<LoadingOutlined />} title={t('setup.running')} style={{ marginTop: 16 }} />
      )}
      {runSetup.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          title={t('setup.runFailed')}
          description={
            <>
              <div>{runError?.error ?? runSetup.error.message}</div>
              {runError?.log && (
                <pre style={{ ...scrollBox, maxHeight: 240, margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                  {runError.log}
                </pre>
              )}
            </>
          }
        />
      )}
    </>
  )

  let content: ReactNode
  if (!status.data) {
    content = status.isError ? (
      <Alert
        type="error"
        showIcon
        title={t('setup.statusError')}
        action={<Button size="small" onClick={() => status.refetch()}>{t('setup.recheck')}</Button>}
      />
    ) : (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    )
  } else if (step === 0) {
    const { iconSourceFound } = status.data.gameData
    content = (
      <>
        <p style={intro}>{t('setup.source.intro')}</p>
        <Descriptions
          column={1}
          bordered
          size="small"
          items={[
            {
              key: 'languages',
              label: t('setup.source.languageFiles'),
              children: t('setup.source.filesValue', {
                count: files.length,
                size: formatBytes(files.reduce((sum, f) => sum + f.bytes, 0)),
              }),
            },
            {
              key: 'icons',
              label: t('setup.source.iconSource'),
              children: iconSourceFound ? (
                <Tag color="success">{t('setup.source.found')}</Tag>
              ) : (
                <Tag color="warning">{t('setup.source.notFound')}</Tag>
              ),
            },
          ]}
        />
        {!files.length && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 16 }}
            title={t('setup.source.noLanguageTitle')}
            description={
              <>
                <ol style={list}>
                  <li>
                    {t('setup.source.copyDocs')}{' '}
                    <Typography.Text code>{'CommunityResources\\Docs → game-data\\Docs'}</Typography.Text>
                  </li>
                  <li>{t('setup.pressRecheck')}</li>
                </ol>
                <div style={{ ...muted, marginTop: 4 }}>{t('setup.readme')}</div>
              </>
            }
          />
        )}
        {!iconSourceFound && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
            title={t('setup.source.noIconTitle')}
            description={
              <>
                <div>{t('setup.source.noIconLead')}</div>
                <div>
                  {t('setup.source.noIconHow')} <Typography.Text code>{'game-data\\FactoryGame'}</Typography.Text>
                </div>
                <div style={{ ...muted, marginTop: 4 }}>{t('setup.readme')}</div>
              </>
            }
          />
        )}
        <div style={footer}>
          <Button loading={status.isFetching} onClick={() => status.refetch()}>{t('setup.recheck')}</Button>
          <Button type="primary" disabled={!files.length} onClick={() => setStep(1)}>{t('setup.next')}</Button>
        </div>
      </>
    )
  } else if (step === 1) {
    content = (
      <>
        <p style={intro}>{t('setup.lang.intro')}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Button size="small" disabled={running} onClick={() => setChecked(codes)}>{t('setup.lang.selectAll')}</Button>
          <Button size="small" disabled={running} onClick={() => setChecked([])}>{t('setup.lang.clear')}</Button>
          <span style={muted}>{t('setup.lang.selectedCount', { count: checked.length })}</span>
        </div>
        <Checkbox.Group
          value={checked}
          onChange={(v) => setChecked(v)}
          disabled={running}
          style={{
            ...scrollBox,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '6px 12px',
            padding: 12,
          }}
        >
          {files.map((f) => (
            <Checkbox
              key={f.code}
              value={f.code}
              // fixed 2-line cell: name (ellipsis) / code · size — min-width 0 lets the ellipsis work in the grid
              styles={{ root: { minWidth: 0 }, label: { minWidth: 0, overflow: 'hidden' } }}
            >
              <div title={nativeName(f.code)} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nativeName(f.code)}
              </div>
              <div style={muted}>{f.code} · {formatBytes(f.bytes)}</div>
            </Checkbox>
          ))}
        </Checkbox.Group>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ color: '#9aaabb' }}>{t('setup.lang.default')}</span>
          <Select
            value={defaultLanguage}
            onChange={setDefault}
            disabled={running || !checked.length}
            style={{ width: 260 }}
            options={checked.map((c) => ({ value: c, label: `${nativeName(c)} (${c})` }))}
          />
        </div>
        <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>{t('setup.lang.cleanupNote')}</p>
        {runAlerts}
        <div style={footer}>
          <Button disabled={running} onClick={() => setStep(0)}>{t('setup.back')}</Button>
          <Button type="primary" loading={running} disabled={!checked.length} onClick={run}>
            {t('setup.lang.run')}
          </Button>
        </div>
      </>
    )
  } else if (step === 2 && result) {
    const { needed, copied, missing } = result.icons
    // users export whole folders in FModel -> unique parent folders of the missing textures
    const folders = [...new Set(missing.map((p) => fmodelPath(p).replace(/\/[^/]*$/, '')))]
    content = (
      <>
        {missing.length === 0 ? (
          <Alert type="success" showIcon title={t('setup.icons.allFound', { count: needed })} />
        ) : (
          <Alert
            type="warning"
            showIcon
            title={t('setup.icons.missingTitle', { count: missing.length, needed })}
            description={
              <>
                <div>{t('setup.icons.missingLead')}</div>
                <ol style={list}>
                  <li>{t('setup.icons.fixExport')}</li>
                  <li>
                    {t('setup.icons.fixPut')} <Typography.Text code>{'game-data\\FactoryGame'}</Typography.Text>
                  </li>
                  <li>{t('setup.pressRecheck')}</li>
                </ol>
              </>
            }
          />
        )}
        <Progress
          style={{ marginTop: 12 }}
          percent={needed ? Math.floor((copied / needed) * 100) : 100}
          status={missing.length ? 'normal' : 'success'}
          format={() => `${copied} / ${needed}`}
        />
        {missing.length > 0 && (
          <Collapse
            size="small"
            style={{ marginTop: 12 }}
            items={[
              {
                key: 'details',
                label: t('setup.icons.details'),
                children: (
                  <>
                    <div style={label}>{t('setup.icons.folders')}</div>
                    {folders.map((f) => (
                      <div key={f}>
                        <Typography.Text code copyable>{f}</Typography.Text>
                      </div>
                    ))}
                    <div style={{ ...label, marginTop: 16 }}>{t('setup.icons.files')}</div>
                    <div style={scrollBox}>
                      {missing.map((path) => (
                        <div key={path} style={{ padding: '8px 0', borderBottom: '1px solid #181830' }}>
                          <div style={{ color: '#c8d8e8', fontWeight: 600 }}>{path.split('/').pop()}</div>
                          <div style={muted}>
                            {t('setup.icons.fmodelPath')}:{' '}
                            <Typography.Text code copyable>{fmodelPath(path)}</Typography.Text>
                          </div>
                          <div style={muted}>
                            {t('setup.icons.destPath')}:{' '}
                            <Typography.Text code>{`game-data/FactoryGame/Content/${path}`}</Typography.Text>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ),
              },
            ]}
          />
        )}
        {runAlerts}
        {missing.length > 0 && <p style={{ ...muted, margin: '16px 0 0' }}>{t('setup.icons.cleanupNote')}</p>}
        <div style={footer}>
          <Button disabled={running} onClick={() => setStep(1)}>{t('setup.back')}</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            {missing.length > 0 && (
              <>
                <Button disabled={running} onClick={() => setStep(4)}>{t('setup.icons.finishWithoutCleanup')}</Button>
                <Button type="primary" loading={running} onClick={run}>{t('setup.recheck')}</Button>
              </>
            )}
            {/* cleanup only after every icon is found */}
            <Button type="primary" disabled={running || missing.length > 0} onClick={() => setStep(3)}>
              {t('setup.next')}
            </Button>
          </div>
        </div>
      </>
    )
  } else if (step === 3) {
    content = (
      <CleanupStep
        onBack={() => setStep(2)}
        onDone={(r) => {
          setDeleted(r)
          setStep(4)
        }}
      />
    )
  } else if (result) {
    content = (
      <Result
        status="success"
        title={t('setup.done.title')}
        extra={
          <Button type="primary" onClick={() => { window.location.href = '/' }}>
            {t('setup.done.go')}
          </Button>
        }
      >
        <Descriptions
          column={1}
          bordered
          size="small"
          items={[
            { key: 'languages', label: t('setup.done.languages'), children: result.languages.map(nativeName).join(', ') },
            { key: 'default', label: t('setup.lang.default'), children: nativeName(result.defaultLanguage) },
            { key: 'icons', label: t('setup.done.icons'), children: `${result.icons.copied} / ${result.icons.needed}` },
            {
              key: 'cleanup',
              label: t('setup.done.cleanup'),
              children: deleted
                ? t('setup.cleanup.deleted', { count: deleted.deletedCount, size: formatBytes(deleted.deletedBytes) })
                : t('setup.done.cleanupSkipped'),
            },
          ]}
        />
        {result.icons.missing.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
            title={t('setup.done.missingTitle', { count: result.icons.missing.length })}
            description={t('setup.done.missingHow')}
          />
        )}
      </Result>
    )
  }

  return (
    // antd built-in texts (modal buttons, copy tooltips...) in the same language as t
    <ConfigProvider locale={BROWSER_UI_LANG === 'ko' ? koKR : enUS}>
      <div style={{ minHeight: '100vh', background: '#0a0a12', padding: '40px 16px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <SettingOutlined style={{ color: '#e8b84b', fontSize: 20 }} />
            <span style={{ color: '#e8b84b', fontWeight: 700, fontSize: 16 }}>
              Satisfactory — {t('setup.title')}
            </span>
          </div>
          <Steps
            current={step}
            style={{ marginBottom: 24 }}
            items={[
              { title: t('setup.step.source') },
              { title: t('setup.step.languages') },
              { title: t('setup.step.icons') },
              { title: t('setup.step.cleanup') },
              { title: t('setup.step.done') },
            ]}
          />
          <div style={{ background: '#0b0b18', border: '1px solid #181830', borderRadius: 7, padding: 24 }}>
            {content}
          </div>
        </div>
      </div>
    </ConfigProvider>
  )
}
