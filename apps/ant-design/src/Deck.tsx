import {
  DEFAULT_DECK_LINE, TEST_IDS, deckView, formatTagValue, lineStatusLabels, shiftLabels, stopReasonLabels, type DeckView, type LineId, type MessageKey, type PlantAction,
} from '@swatchbook/core';
import { actionErrorLabel, useActions, useI18n, useSimulation } from '@swatchbook/runtime';
import { Alert, Button, Card, Col, Descriptions, Input, Modal, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useState, type ReactNode } from 'react';

const ids = TEST_IDS.deck;
const STATUS_COLORS = { running: 'success', stopped: 'default', alarm: 'error' } as const;

const OEE_PARTS = [
  ['performance.availability', 'availability'], ['performance.performance', 'performance'], ['performance.quality', 'quality'],
] as const;

function StatusTag({ status, testId }: { status: keyof typeof STATUS_COLORS; testId?: string }) {
  const { t } = useI18n();
  return <Tag data-testid={testId} color={STATUS_COLORS[status]} style={{ margin: 0 }}>{t(lineStatusLabels[status])}</Tag>;
}

function ErrorAlert({ messageKey, testId }: { messageKey: MessageKey | null; testId?: string }) {
  const { t } = useI18n();
  return messageKey ? <Alert data-testid={testId} type="warning" showIcon title={t(messageKey)} /> : null;
}

function LineHeader({ view, lineId, onChange }: { view: DeckView; lineId: LineId; onChange(id: LineId): void }) {
  const { t, tr } = useI18n();
  const { dataset } = useSimulation();
  const reason = view.selected.stopReason;
  return (
    <Card>
      <Space size="large" wrap>
        <Select
          data-testid={ids.lineSelect}
          aria-label={t('scope.line')}
          style={{ minWidth: 340 }}
          value={lineId}
          onChange={onChange}
          options={view.lines.map(line => ({
            value: line.id,
            label: (
              <Space>
                <Typography.Text strong>{line.id}</Typography.Text>
                {tr(dataset.lines.find(entry => entry.id === line.id)!.name)}
                <StatusTag status={line.status} />
              </Space>
            ),
          }))}
        />
        <Space>
          <Typography.Text type="secondary">{t('deck.line-status')}</Typography.Text>
          <StatusTag status={view.selected.status} testId={ids.lineStatus} />
        </Space>
        {reason && (
          <Space>
            <Typography.Text type="secondary">{t('deck.stop-reason')}</Typography.Text>
            <Typography.Text data-testid={ids.stopReason}>{t(stopReasonLabels[reason])}</Typography.Text>
          </Space>
        )}
      </Space>
    </Card>
  );
}

function BatchBlock({ view }: { view: DeckView }) {
  const { t, formatDateTime, formatDuration, formatNumber, formatPercentValue } = useI18n();
  const batch = view.batch;
  return (
    <Card title={t('deck.batch')} data-testid={ids.batch} style={{ height: '100%' }}>
      {batch === null ? (
        <Typography.Text data-testid={ids.batchEmpty} type="secondary">{t('deck.batch-empty')}</Typography.Text>
      ) : (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions
            size="small"
            column={2}
            items={[
              { key: 'id', label: t('common.batch-id'), children: batch.batchId },
              { key: 'lot', label: t('term.lot'), children: batch.lotId },
              { key: 'product', label: t('common.product'), children: batch.productCode },
              { key: 'version', label: t('event-target.recipe-version'), children: formatNumber(batch.recipeVersion) },
              { key: 'start', label: t('common.start'), children: formatDateTime(batch.start) },
              { key: 'elapsed', label: t('deck.batch-elapsed'), children: formatDuration(batch.elapsedMs / 1000) },
              { key: 'produced', label: t('deck.batch-produced'), children: formatNumber(batch.producedUnits) },
              { key: 'target', label: t('deck.batch-target'), children: formatNumber(batch.targetUnits) },
            ]}
          />
          <div data-testid={ids.batchProgress}>
            <Progress
              percent={batch.percent}
              format={() => t('deck.batch-progress', {
                produced: formatNumber(batch.producedUnits), target: formatNumber(batch.targetUnits), percent: formatPercentValue(batch.percent),
              })}
            />
          </div>
        </Space>
      )}
    </Card>
  );
}

function Kpi({ testId, title, value, suffix, note, stale }: {
  testId: string; title: string; value: string; suffix?: string; note?: ReactNode; stale?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Card data-testid={testId} style={{ height: '100%' }}>
      <Statistic title={<Space>{title}{stale && <Tag color="warning">{t('tag-status.stale')}</Tag>}</Space>} value={value} suffix={suffix} />
      {note && <Typography.Text type="secondary">{note}</Typography.Text>}
    </Card>
  );
}

function Kpis({ view }: { view: DeckView }) {
  const { locale, t, formatNumber, formatPercent } = useI18n();
  const { kpis } = view;
  const none = t('common.none');
  const speed = kpis.lineSpeed;
  const cycle = kpis.cycle;
  return (
    <section aria-label={t('deck.kpis')}>
    <Typography.Title level={5} style={{ marginTop: 0 }}>{t('deck.kpis')}</Typography.Title>
    {!view.hasProduction && <Typography.Paragraph data-testid={ids.kpiEmpty} type="secondary">{t('deck.kpi-empty')}</Typography.Paragraph>}
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Kpi
          testId={ids.kpiOee}
          title={t('deck.kpi-oee')}
          value={formatPercent(kpis.oee)}
          note={
            <Space size="middle" wrap>
              {OEE_PARTS.map(([key, part]) => <span key={key}>{t(key)} {formatPercent(kpis[part])}</span>)}
            </Space>
          }
        />
      </Col>
      <Col span={6}>
        <Kpi testId={ids.kpiOutput} title={t('deck.kpi-output')} value={formatNumber(kpis.outputThisShift)} />
      </Col>
      <Col span={6}>
        {kpis.kind === 'cycle' ? (
          <Kpi
            testId={ids.kpiCycle}
            title={t('deck.kpi-cycle')}
            value={cycle ? formatTagValue(locale, cycle.value, 's') : none}
            suffix={cycle ? 's' : undefined}
            note={cycle ? `${t('deck.kpi-takt')} ${formatTagValue(locale, cycle.takt, 's')} s` : undefined}
            stale={cycle?.stale}
          />
        ) : (
          <Kpi
            testId={ids.kpiCycle}
            title={t('deck.kpi-speed')}
            value={speed ? formatTagValue(locale, speed.value, speed.unit) : none}
            suffix={speed?.unit}
            stale={speed?.stale}
          />
        )}
      </Col>
      <Col span={6}>
        <Kpi testId={ids.kpiScrap} title={t('deck.kpi-scrap')} value={formatNumber(kpis.scrapThisShift)} />
      </Col>
    </Row>
    </section>
  );
}

function AlarmBanner({ view }: { view: DeckView }) {
  const { t, tr, tCount, formatDuration } = useI18n();
  const { dataset } = useSimulation();
  const [open, setOpen] = useState(false);
  const { count, expandable, rows } = view.banner;
  const expanded = open && expandable;
  return (
    <Alert
      data-testid={ids.alarmBanner}
      // The Age column changes every second, so this must not be an assertive live region.
      role="region"
      aria-label={t('deck.alarm-banner')}
      type={count > 0 ? 'error' : 'info'}
      showIcon
      title={tCount('deck.alarm-count', count)}
      description={
        expanded ? (
          <Table
            size="small"
            pagination={false}
            rowKey="alarmId"
            dataSource={rows}
            columns={[
              { key: 'machine', title: t('term.machine'), render: (_, row) => tr(dataset.machines.find(m => m.id === row.machineId)!.name) },
              { key: 'message', title: t('common.message'), render: (_, row) => tr(row.message) },
              { key: 'age', title: t('common.age'), render: (_, row) => formatDuration(row.ageSeconds) },
            ]}
          />
        ) : count === 0 ? t('deck.alarm-empty') : undefined
      }
      action={
        <Button size="small" disabled={!expandable} aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
          {t(expanded ? 'action.collapse-banner' : 'action.expand-banner')}
        </Button>
      }
    />
  );
}

function ShiftBlock({ view }: { view: DeckView }) {
  const { t, formatTime, formatDuration } = useI18n();
  const { shift } = view;
  return (
    <Card title={t('deck.shift')} data-testid={ids.shift} style={{ height: '100%' }}>
      {!view.hasShift ? (
        <Typography.Text data-testid={ids.shiftEmpty} type="secondary">{t('deck.shift-empty')}</Typography.Text>
      ) : (
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'name', label: t('common.name'), children: t(shiftLabels[shift.id]) },
          { key: 'left', label: t('deck.shift-remaining'), children: formatDuration(shift.remainingMs / 1000) },
          { key: 'start', label: t('common.start'), children: formatTime(shift.startsAt) },
          { key: 'end', label: t('common.end'), children: formatTime(shift.endsAt) },
        ]}
      />
      )}
    </Card>
  );
}

function Actions({ view, lineId }: { view: DeckView; lineId: LineId }) {
  const { t } = useI18n();
  const dispatch = useActions();
  const [error, setError] = useState<MessageKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [handover, setHandover] = useState<{ note: string; error: MessageKey | null } | null>(null);

  function run(action: PlantAction): MessageKey | null {
    const refused = actionErrorLabel(dispatch(action));
    setError(refused);
    return refused;
  }
  const { actions } = view;
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Button data-testid={ids.pause} disabled={!actions.pause} onClick={() => run({ type: 'pause', lineId })}>{t('action.pause')}</Button>
        <Button data-testid={ids.resume} disabled={!actions.resume} onClick={() => run({ type: 'resume', lineId })}>{t('action.resume')}</Button>
        <Button data-testid={ids.estop} danger type="primary" disabled={!actions.emergencyStop} onClick={() => setConfirming(true)}>{t('action.emergency-stop')}</Button>
        <Button data-testid={ids.reset} disabled={!actions.reset} onClick={() => run({ type: 'reset', lineId })}>{t('action.reset')}</Button>
        <Button data-testid={ids.handover} disabled={!actions.shiftHandover} onClick={() => setHandover({ note: '', error: null })}>{t('action.shift-handover')}</Button>
      </Space>
      <ErrorAlert messageKey={error} testId={ids.actionError} />
      <Modal
        destroyOnHidden
        open={confirming}
        title={t('deck.estop-confirm.title')}
        okText={t('action.confirm')}
        cancelText={t('action.cancel')}
        okButtonProps={{ danger: true, ...{ 'data-testid': ids.estopConfirm } }}
        onCancel={() => setConfirming(false)}
        onOk={() => { setConfirming(false); run({ type: 'emergency-stop', lineId, confirmed: true }); }}
      >
        {t('deck.estop-confirm.body')}
      </Modal>
      <Modal
        destroyOnHidden
        open={handover !== null}
        title={t('deck.handover')}
        okText={t('action.submit-handover')}
        cancelText={t('action.cancel')}
        onCancel={() => setHandover(null)}
        onOk={() => {
          if (!handover) return;
          const refused = actionErrorLabel(dispatch({ type: 'shift-handover', note: handover.note }));
          if (refused) setHandover({ ...handover, error: refused });
          else { setError(null); setHandover(null); }
        }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text>{t('deck.handover-note')}</Typography.Text>
          <Input.TextArea
            data-testid={ids.handoverNote}
            aria-label={t('deck.handover-note')}
            aria-required
            required
            rows={4}
            placeholder={t('deck.handover-placeholder')}
            value={handover?.note ?? ''}
            onChange={event => setHandover(current => current && { ...current, note: event.target.value })}
          />
          <ErrorAlert messageKey={handover?.error ?? null} />
        </Space>
      </Modal>
    </Space>
  );
}

export function Deck() {
  const { state, snapshot, tick } = useSimulation();
  const [lineId, setLineId] = useState<LineId>(DEFAULT_DECK_LINE);
  const view = deckView(state, snapshot, lineId, tick);
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <LineHeader view={view} lineId={lineId} onChange={setLineId} />
      <AlarmBanner key={lineId} view={view} />
      <Row gutter={[16, 16]}>
        <Col span={16}><BatchBlock view={view} /></Col>
        <Col span={8}><ShiftBlock view={view} /></Col>
      </Row>
      <Kpis view={view} />
      <Card><Actions key={lineId} view={view} lineId={lineId} /></Card>
    </Space>
  );
}
