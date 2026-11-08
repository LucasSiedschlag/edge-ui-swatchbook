import { SCREENS, TEST_IDS, screenLabels, shellNavId, type MessageKey, type ScreenId } from '@swatchbook/core';
import {
  LIBRARIES, LIBRARY_NOT_BUILT_KEY, PRESETS, libraryUrl, siteBaseFrom, useI18n, useLibrary, usePreferences, useRoute, useTour, type PresetId,
} from '@swatchbook/runtime';
import { Alert, Button, ConfigProvider, Layout, Menu, Segmented, Select, Space, Typography, theme } from 'antd';
import enUS from 'antd/locale/en_US';
import ptBR from 'antd/locale/pt_BR';
import { Screen } from './Screen';

const LOCALES = { en: enUS, 'pt-BR': ptBR } as const;
const PRESET_LABELS: Record<PresetId, MessageKey> = {
  office: 'preset.office', 'control-room': 'preset.control-room', night: 'preset.night',
};

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Space size="small">
      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{label}</Typography.Text>
      {children}
    </Space>
  );
}

function Header() {
  const { t } = useI18n();
  const prefs = usePreferences();
  const library = useLibrary();
  const tour = useTour();
  const { screen } = useRoute();
  return (
    <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', height: 'auto', lineHeight: 'normal', paddingBlock: 12 }}>
      <Typography.Title level={4} style={{ margin: 0, color: 'inherit', whiteSpace: 'nowrap' }}>{t('shell.app-title')}</Typography.Title>
      <Space size="large" wrap style={{ marginInlineStart: 'auto' }}>
        <Control label={t('shell.library-picker')}>
          <Select
            data-testid={TEST_IDS.shell.libraryPicker}
            aria-label={t('shell.library-picker')}
            style={{ minWidth: 220 }}
            value={library.id}
            options={LIBRARIES.map(entry => ({
              value: entry.id,
              disabled: entry.status !== 'built',
              label: entry.status === 'built' ? entry.name : `${entry.name} (${t(LIBRARY_NOT_BUILT_KEY)})`,
            }))}
            onChange={id => {
              if (id === library.id) return;
              location.assign(libraryUrl({ siteBase: siteBaseFrom(import.meta.env.BASE_URL, library.id), libraryId: id, screen }));
            }}
          />
        </Control>
        <Control label={t('shell.language')}>
          <Segmented
            data-testid={TEST_IDS.shell.language}
            aria-label={t('shell.language')}
            value={prefs.language}
            options={[{ value: 'en', label: t('language.english') }, { value: 'pt-BR', label: t('language.portuguese') }]}
            onChange={prefs.setLanguage}
          />
        </Control>
        <Control label={t('shell.theme')}>
          <Segmented
            data-testid={TEST_IDS.shell.theme}
            aria-label={t('shell.theme')}
            value={prefs.theme}
            options={[{ value: 'light', label: t('theme.light') }, { value: 'dark', label: t('theme.dark') }]}
            onChange={prefs.setTheme}
          />
        </Control>
        <Control label={t('shell.density')}>
          <Segmented
            data-testid={TEST_IDS.shell.density}
            aria-label={t('shell.density')}
            disabled={prefs.densityUnavailable}
            title={prefs.densityUnavailable ? t('density.unsupported') : undefined}
            value={prefs.density}
            options={[{ value: 'comfortable', label: t('density.comfortable') }, { value: 'compact', label: t('density.compact') }]}
            onChange={prefs.setDensity}
          />
        </Control>
        <Control label={t('shell.preset')}>
          <Select
            data-testid={TEST_IDS.shell.preset}
            aria-label={t('shell.preset')}
            style={{ minWidth: 160 }}
            value={prefs.preset}
            options={PRESETS.map(preset => ({ value: preset.id, label: t(PRESET_LABELS[preset.id]) }))}
            onChange={prefs.applyPreset}
          />
        </Control>
        <Button data-testid={TEST_IDS.shell.tourStart} onClick={tour.start}>{t('tour.start')}</Button>
      </Space>
    </Layout.Header>
  );
}

function TourBanner() {
  const { t } = useI18n();
  const tour = useTour();
  if (!tour.active || !tour.step) return null;
  return (
    <Alert
      data-testid={TEST_IDS.shell.tour}
      type="info"
      showIcon={false}
      style={{ marginBottom: 16 }}
      title={`${t(tour.step.titleKey)} - ${t('tour.progress', { current: tour.index + 1, total: tour.total })}`}
      description={t(tour.step.noteKey)}
      action={
        <Space>
          <Button data-testid={TEST_IDS.shell.tourPrevious} disabled={tour.isFirst} onClick={tour.previous}>{t('tour.previous')}</Button>
          <Button data-testid={TEST_IDS.shell.tourNext} disabled={tour.isLast} onClick={tour.next}>{t('tour.next')}</Button>
          <Button data-testid={TEST_IDS.shell.tourFinish} type="primary" onClick={tour.finish}>{t('tour.finish')}</Button>
        </Space>
      }
    />
  );
}

function Navigation() {
  const { t } = useI18n();
  const { screen, go } = useRoute();
  return (
    <Layout.Sider width={280} theme="light">
      <Menu
        mode="inline"
        selectedKeys={[screen]}
        onClick={({ key }) => go(key as ScreenId)}
        items={SCREENS.map(entry => ({ key: entry.id, label: t(screenLabels[entry.id]), 'data-testid': shellNavId(entry.id) }))}
      />
    </Layout.Sider>
  );
}

export function Shell() {
  const prefs = usePreferences();
  const { screen } = useRoute();
  const dark = prefs.theme === 'dark';
  const compact = prefs.density === 'compact';
  return (
    <ConfigProvider
      locale={LOCALES[prefs.language]}
      theme={{ algorithm: [dark ? theme.darkAlgorithm : theme.defaultAlgorithm, ...(compact ? [theme.compactAlgorithm] : [])] }}
    >
      <Layout data-app-root data-theme={prefs.theme} data-density={prefs.density} style={{ minHeight: '100vh', minWidth: 1280 }}>
        <Header />
        <Layout>
          <Navigation />
          <Layout.Content style={{ padding: 24 }}>
            <TourBanner />
            <Screen screen={screen} />
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
