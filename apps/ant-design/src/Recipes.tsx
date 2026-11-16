import {
  RECIPE_DEFAULT_FILTERS, RECIPE_DEFAULT_SELECTION, TEST_IDS, lineTypeLabels, recipeLibraryView, recipeStatusLabels, formatList, recipeVersionView, dependencyRuleLabels, ruleStatusLabels, decimalSeparator, formatTagValue, stepKindLabels, RECIPE_DEFAULT_STEP_KIND, plantErrorLabels,
  type RecipeLibraryRow, type RecipeFilters, type RecipeVersionView, type Parameter, type MessageKey, type PlantAction, type StepKind,
} from '@swatchbook/core';
import { actionErrorLabel, useActions, useI18n, usePlantState, usePreferences, useShortcutHandlers } from '@swatchbook/runtime';
import { Alert, Button, Card, Descriptions, Empty, Input, InputNumber, Modal, Select, Space, Table, Tooltip, Typography, theme } from 'antd';
import type { InputRef } from 'antd';
import { Fragment, cloneElement, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';

const ids = TEST_IDS.recipes;
const fullWidth = { width: '100%', minWidth: 0 };
const passiveLoading = { spinning: false, 'aria-live': 'off' } as const;
const words = { wordBreak: 'normal', overflowWrap: 'normal' } as const;
function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <Space orientation="vertical" size="small" style={fullWidth}><Typography.Text>{label}</Typography.Text>{children}</Space>;
}

export function Recipes() {
  const { state } = usePlantState();
  const { t, tr, tCount, formatNumber } = useI18n();
  const { density } = usePreferences();
  const { token } = theme.useToken();
  const [filters, setFilters] = useState<RecipeFilters>(RECIPE_DEFAULT_FILTERS);
  const [selection, setSelection] = useState(RECIPE_DEFAULT_SELECTION);
  const detail = useMemo(() => selection === null ? null : recipeVersionView(state, selection), [state, selection]);
  const search = useRef<InputRef>(null);
  useShortcutHandlers({ 'focus-search': () => search.current?.focus() });
  const library = useMemo(() => recipeLibraryView(state, filters, tr), [state, filters, tr]);
  const wholeEmpty = library.empty && selection === null;
  const selected = (row: RecipeLibraryRow) => Boolean(detail && !('error' in detail) && detail.version.recipeId === row.recipeId);
  const recipeLabel = (row: RecipeLibraryRow) => t('recipes.recipe-label', { id: row.recipeId, name: tr(row.nameRef) });
  return <div style={{ display: 'grid', gap: token.margin, minWidth: 0, containerType: 'inline-size', containerName: 'recipe-lab' }}>
    {/* 860px: below this container width the 2fr/1fr workspace leaves the Version under about 570px, too narrow for the Parameter tables. */}
    <style>{'.recipes-workspace{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start}.recipes-dependencies{position:sticky}@container (max-width:860px){.recipes-workspace{grid-template-columns:minmax(0,1fr)}.recipes-dependencies{grid-row:1;position:static}}'}</style>
    <Card title={t('recipes.library')} style={fullWidth} styles={{ body: { padding: token.paddingSM } }}>
      <Space orientation="vertical" size="small" style={fullWidth}>
        {/* 1fr 1fr 2fr: the search box gets twice the width of each select because it holds the longer placeholder. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: token.marginSM, alignItems: 'end' }}>
        <Filter label={t('recipes.filter-line-type')}>
          <Select data-testid={ids.filterLineType} aria-label={t('recipes.filter-line-type')} style={fullWidth} virtual={false}
            allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} value={filters.lineType}
            options={Object.entries(lineTypeLabels).map(([value, key]) => ({ value, label: t(key) }))}
            onChange={lineType => setFilters({ ...filters, lineType })} />
        </Filter>
        <Filter label={t('recipes.filter-status')}>
          <Select data-testid={ids.filterStatus} aria-label={t('recipes.filter-status')} style={fullWidth} virtual={false}
            allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} value={filters.status}
            options={Object.entries(recipeStatusLabels).map(([value, key]) => ({ value, label: t(key) }))}
            onChange={status => setFilters({ ...filters, status })} />
        </Filter>
        <Filter label={t('common.search')}>
          <Input ref={search} data-testid={ids.search} aria-label={t('common.search')} placeholder={t('recipes.search-placeholder')}
            value={filters.search ?? ''} onChange={event => setFilters({ ...filters, search: event.target.value })} />
        </Filter>
        </div>
        <Typography.Text>{tCount('common.row-count', library.rows.length)}</Typography.Text>
        {wholeEmpty ? <Empty data-testid={ids.empty} description={t('recipes.empty')} />
          : <div style={{ maxHeight: (token.controlHeightSM + token.paddingXS * 2) * 7 + token.controlHeight * 2, overflowY: 'auto' }}><Table data-testid={ids.library}
          rowKey="recipeId" tableLayout="fixed" onRow={row => ({ tabIndex: 0, 'aria-label': recipeLabel(row),
            'aria-selected': selected(row), 'aria-current': selected(row) ? 'true' : undefined,
            style: { cursor: 'pointer', background: selected(row) ? token.controlItemBgActive : undefined },
            onClick: () => setSelection(row.latestVersionId), onKeyDown: event => {
            if (event.key === 'Enter' && event.target === event.currentTarget) { event.preventDefault(); setSelection(row.latestVersionId); }
          } })} dataSource={library.rows} size={density === 'compact' ? 'small' : 'middle'} pagination={false}
          loading={passiveLoading}
          locale={{ emptyText: <Empty data-testid={ids.libraryEmpty} description={t('recipes.library-empty')} /> }}
          columns={[
            { key: 'id', width: '8%', title: t('recipes.column-recipe-id'), dataIndex: 'recipeId' },
            { key: 'name', width: '24%', ellipsis: true, title: t('recipes.column-name'), render: (_: unknown, row: RecipeLibraryRow) => <span title={tr(row.nameRef)}>{tr(row.nameRef)}</span> },
            { key: 'product', width: '13%', title: t('common.product'), dataIndex: 'productCode' },
            { key: 'lineType', width: '12%', title: t('recipes.filter-line-type'), render: (_: unknown, row: RecipeLibraryRow) => t(lineTypeLabels[row.lineType]) },
            { key: 'version', width: '11%', title: t('recipes.column-version'), render: (_: unknown, row: RecipeLibraryRow) => formatNumber(row.latestNumber) },
            { key: 'status', width: '12%', title: t('recipes.filter-status'), render: (_: unknown, row: RecipeLibraryRow) => t(recipeStatusLabels[row.latestStatus]) },
            { key: 'open', width: '20%', title: t('recipes.open-version'),
              render: (_: unknown, row: RecipeLibraryRow) => <Button size="small" aria-label={t('recipes.open-version-of', { recipe: recipeLabel(row) })} onClick={event => { event.stopPropagation(); setSelection(row.latestVersionId); }}>{t('recipes.open-version')}</Button> },
          ].map(column => ({ ...column, onHeaderCell: () => ({ style: words }), onCell: () => ({ style: { ...words, padding: token.paddingXS } }) }))} /></div>}
      </Space>
    </Card>
    {!wholeEmpty && <Version detail={detail} select={setSelection} onDiscard={() => { setSelection(null); search.current?.focus(); }} />}
  </div>;
}

const visuallyHidden: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
};
// Ant handles hover; plain focus state avoids flushSync when a dialog moves focus during commit.
function ReasonTip({ title, children }: { title: ReactNode; children: ReactElement<{ onFocus?: () => void; onBlur?: () => void }> }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  return <Tooltip title={title} trigger={['hover']} open={Boolean(title) && (hover || focus)} onOpenChange={setHover}>
    {cloneElement(children, { onFocus: () => { setFocus(true); children.props.onFocus?.(); }, onBlur: () => { setFocus(false); children.props.onBlur?.(); } })}
  </Tooltip>;
}
function ReasonButton({ reason, children, onClick, testId, buttonRef, size, buttonId }: { reason: string | null; children: ReactNode; onClick(): void; testId?: string; buttonId?: string; buttonRef?: React.Ref<HTMLButtonElement>; size?: 'small' }) {
  const id = useId();
  return <><ReasonTip title={reason}><Button id={buttonId} size={size} ref={buttonRef} data-testid={testId} aria-disabled={Boolean(reason)}
    aria-describedby={reason ? id : undefined} onClick={() => { if (!reason) onClick(); }}>{children}</Button></ReasonTip>
    {reason && <span id={id} style={visuallyHidden}>{reason}</span>}</>;
}
type Detail = Exclude<RecipeVersionView, { error: string }>;
function ParameterValue({ parameter, field, readOnlyReason, versionId, saved, onEdit }: { versionId: string; parameter: Parameter; field: 'min' | 'setpoint' | 'max'; readOnlyReason: Detail['readOnlyReason']; saved: number; onEdit(): void }) {
  const { t, tr, locale } = useI18n();
  const reasonId = useId();
  const { token } = theme.useToken();
  const dispatch = useActions();
  const [value, setValue] = useState<number | string | null>(parameter[field]);
  const [error, setError] = useState<MessageKey | null>(null);
  // The last value core refused, so Enter followed by blur does not dispatch and announce it twice.
  const refused = useRef<number | null>(null);
  useEffect(() => { setValue(parameter[field]); setError(null); refused.current = null; }, [parameter, field, versionId]);
  useEffect(() => { if (saved > 0) setError(null); }, [saved]);
  function commit() {
    const next = value === null ? Number.NaN : Number(value);
    if (readOnlyReason || next === parameter[field] || next === refused.current) return;
    const result = dispatch({ type: 'edit-parameter', versionId, parameterId: parameter.id, field, value: next });
    refused.current = result.ok ? null : next;
    setError(actionErrorLabel(result));
  }
  const label = t(field === 'min' ? 'common.minimum' : field === 'max' ? 'common.maximum' : 'term.setpoint');
  const reason = readOnlyReason && t(readOnlyReason);
  const separator = decimalSeparator(locale);
  return <>
    <ReasonTip title={reason}><InputNumber<number | string> aria-label={t('recipes.parameter-field', { parameter: tr(parameter.name), field: label })} value={value} readOnly={Boolean(reason)}
      aria-disabled={Boolean(reason)} aria-invalid={Boolean(error)} status={error ? 'error' : undefined}
      aria-describedby={reason ? reasonId : error ? `${reasonId}-error` : undefined} style={{ width: token.controlHeightLG * 2 }}
      onBlur={() => { commit(); setValue(parameter[field]); }}
      onPressEnter={commit}
      onFocus={() => { setError(null); refused.current = null; }}
      onInputCapture={() => { onEdit(); setError(null); refused.current = null; }}
      onChange={setValue}
      decimalSeparator={separator} parser={input => (input ?? '').replace(separator, '.')}
      formatter={(number, { userTyping, input }) => userTyping ? input : String(number ?? '').replace('.', separator)} /></ReasonTip>
    {reason && <span id={reasonId} style={visuallyHidden}>{reason}</span>}
    {error && <Typography.Paragraph id={`${reasonId}-error`} data-testid={ids.parameterError} role="status">{t(error)}</Typography.Paragraph>}
  </>;
}
function Version({ detail, select, onDiscard }: { detail: RecipeVersionView | null; select(id: string | null): void; onDiscard(): void }) {
  const { t, tr, locale, formatNumber } = useI18n();
  const dispatch = useActions();
  const { token } = theme.useToken();
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ key: 'recipes.draft-saved' | 'recipes.no-changes'; n: number } | null>(null);
  const saves = useRef(0);
  const [attempts, setAttempts] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const discardButton = useRef<HTMLButtonElement>(null);
  const discarded = useRef(false);
  const [chosenKind, setChosenKind] = useState<StepKind | null>(RECIPE_DEFAULT_STEP_KIND);
  const title = useRef<HTMLSpanElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingFocus.current === 'title') title.current?.focus();
    else if (pendingFocus.current === 'add') addButton.current?.focus();
    else if (pendingFocus.current) document.getElementById(`recipes-step-${pendingFocus.current}`)?.focus();
    pendingFocus.current = null;
  }, [detail]);
  const versionId = detail && !('error' in detail) ? detail.version.id : null;
  useEffect(() => {
    setNotice(null); setSaveStatus(null); setChosenKind(RECIPE_DEFAULT_STEP_KIND);
    if (versionId) title.current?.focus();
  }, [versionId]);
  function stepAction(action: PlantAction, focus: string) {
    setSaveStatus(null); setAttempts(count => count + 1);
    const result = dispatch(action);
    setNotice(actionErrorLabel(result));
    if (result.ok) {
      if (action.type === 'add-step') {
        const next = recipeVersionView(result.state, action.versionId);
        pendingFocus.current = 'error' in next
          ? 'add' : next.steps.at(-1)?.id ?? 'add';
      } else pendingFocus.current = focus;
    }
  }
  function discard() {
    if (!versionId) return;
    setAttempts(count => count + 1);
    const result = dispatch({ type: 'discard-draft', versionId });
    setNotice(actionErrorLabel(result));
    if (result.ok) { discarded.current = true; setDiscarding(false); onDiscard(); }
  }
  function finish(type: 'save-draft' | 'approve') {
    if (!versionId) return;
    setAttempts(count => count + 1);
    const result = dispatch({ type, versionId });
    setNotice(actionErrorLabel(result));
    if (result.ok && type === 'save-draft') setSaveStatus({ key: result.events.length ? 'recipes.draft-saved' : 'recipes.no-changes', n: ++saves.current });
    else setSaveStatus(null);
    if (result.ok && type === 'approve') pendingFocus.current = 'title';
  }
  function newDraft() {
    if (!versionId) return;
    setAttempts(count => count + 1);
    const result = dispatch({ type: 'new-draft', versionId });
    setNotice(actionErrorLabel(result));
    if (result.ok && result.events[0]) select(result.events[0].target);
  }
  function actionReason(block: Detail['saveBlock']) {
    if (!block) return null;
    const reason = t(block.code === 'read-only' ? 'recipes.approved-read-only' : plantErrorLabels[block.code]);
    return block.rules?.length ? t('recipes.blocked-reason', { reason, rules: formatList(locale, block.rules.map(rule => t(dependencyRuleLabels[rule]))) }) : reason;
  }
  const versionTitle = t('recipes.version');
  return <div className="recipes-workspace" style={{ ...fullWidth, gap: token.margin }}>
    <Card size="small" styles={{ body: { padding: token.paddingSM } }} data-testid={versionId ? ids.version : undefined} title={<span ref={title} tabIndex={-1}>{versionTitle}</span>} style={fullWidth}>
      {!detail || 'error' in detail
        ? <Empty description={t('recipes.version-empty')} /> : <Space orientation="vertical" size="middle" style={fullWidth}>
        <Filter label={t('recipes.open-version')}>
          <Select data-testid={ids.versionChoice} aria-label={t('recipes.open-version')} virtual={false} style={fullWidth}
            value={detail.version.id} options={detail.versions.map(version => ({ value: version.id, label: t('recipes.version-option', { recipe: detail.version.recipeId, number: formatNumber(version.number), status: t(recipeStatusLabels[version.status]) }) }))}
            onChange={id => { select(id); setNotice(null); setSaveStatus(null); }} />
        </Filter>
        {notice && <Alert key={attempts} role="status" type="warning" title={t(notice)} />}
        {saveStatus && <Alert key={saveStatus.n} role="status" aria-live="polite" type="info" title={t(saveStatus.key)} />}
        {detail.version.status === 'approved'
          && <ReasonButton testId={ids.newDraft} reason={detail.newDraftBlock && t(plantErrorLabels[detail.newDraftBlock.code])} onClick={newDraft}>{t('action.recipe-new-draft')}</ReasonButton>}
        <Space wrap>
          <ReasonButton testId={ids.save} reason={actionReason(detail.saveBlock)} onClick={() => finish('save-draft')}>{t('action.recipe-save')}</ReasonButton>
          <ReasonButton testId={ids.approve} reason={actionReason(detail.approveBlock)} onClick={() => finish('approve')}>{t('action.recipe-approve')}</ReasonButton>
          <ReasonButton buttonRef={discardButton} testId={ids.discard} reason={detail.readOnlyReason && t(detail.readOnlyReason)} onClick={() => { discarded.current = false; setDiscarding(true); }}>{t('action.recipe-discard')}</ReasonButton>
        </Space>
        <Descriptions column={2} size="small" items={[
          { key: 'name', label: t('common.name'), children: tr(detail.nameRef) },
          { key: 'product', label: t('common.product'), children: <Space wrap><span>{detail.product.code}</span><span>{tr(detail.product.name)}</span></Space> },
          { key: 'line', label: t('recipes.filter-line-type'), children: t(lineTypeLabels[detail.lineType]) },
          { key: 'status', label: t('recipes.filter-status'), children: t(recipeStatusLabels[detail.version.status]) },
        ]} />
        <Typography.Title level={4}>{t('recipes.steps')}</Typography.Title>
        {detail.actions.addStep && <Filter label={t('recipes.step-kind')}>
          <Select data-testid={ids.stepChoice} aria-label={t('recipes.step-kind')} virtual={false} style={fullWidth}
            value={chosenKind ?? detail.suggestedStepKind} options={detail.addableStepKinds.map(kind => ({ value: kind, label: t(stepKindLabels[kind]) }))}
            onChange={kind => { setChosenKind(kind); setSaveStatus(null); }} />
        </Filter>}
        <ReasonButton buttonRef={addButton} testId={ids.addStep} reason={detail.addStepReason && t(detail.addStepReason)}
          onClick={() => { const kind = chosenKind ?? detail.suggestedStepKind; if (kind) { stepAction({ type: 'add-step', versionId: detail.version.id, kind }, 'add'); setChosenKind(RECIPE_DEFAULT_STEP_KIND); } }}>{t('action.add-step')}</ReasonButton>
        <Typography.Text>{t('recipes.edit-parameters')}</Typography.Text>
        {!detail.steps.length && <Empty description={t('recipes.steps-empty')} />}
        {detail.steps.map(step => <Card size="small" key={step.id} data-testid={ids.step}
          title={<Space size="small"><span>{t('recipes.step-number', { number: formatNumber(step.order) })}</span><span>{tr(step.name)}</span></Space>}
          extra={<Space size="small">
            <ReasonButton size="small" buttonId={`recipes-step-${step.id}-up`} reason={step.moveUp.reason && t(step.moveUp.reason)} onClick={() => stepAction({ type: 'reorder-step', versionId: detail.version.id, stepId: step.id, toIndex: step.moveUp.toIndex }, `${step.id}-up`)}>{t('action.move-up')}</ReasonButton>
            <ReasonButton size="small" buttonId={`recipes-step-${step.id}-down`} reason={step.moveDown.reason && t(step.moveDown.reason)} onClick={() => stepAction({ type: 'reorder-step', versionId: detail.version.id, stepId: step.id, toIndex: step.moveDown.toIndex }, `${step.id}-down`)}>{t('action.move-down')}</ReasonButton>
            <ReasonButton size="small" reason={detail.readOnlyReason && t(detail.readOnlyReason)} onClick={() => stepAction({ type: 'remove-step', versionId: detail.version.id, stepId: step.id }, 'add')}>{t('action.remove-step')}</ReasonButton>
          </Space>}
          styles={{ body: { padding: token.paddingSM }, title: { whiteSpace: 'normal' } }}
          tabIndex={-1} role="group" aria-label={tr(step.name)} id={`recipes-step-${step.id}`} style={fullWidth}>
          <Space orientation="vertical" size="small" style={fullWidth}>
          <Typography.Text strong>{t('recipes.parameters')}</Typography.Text>
          <Table<Parameter> aria-label={t('recipes.parameters')} rowKey="id" dataSource={step.parameters} pagination={false} loading={passiveLoading}
            size="small" scroll={{ x: 'max-content' }}
            onRow={parameter => ({ 'data-testid': ids.parameter, 'aria-label': tr(parameter.name) })}
            locale={{ emptyText: <Empty description={t('recipes.parameters-empty')} /> }}
            columns={[
              { key: 'name', title: t('common.parameter'), render: (_: unknown, parameter: Parameter) => tr(parameter.name) },
              ...(['min', 'setpoint', 'max'] as const).map(field => ({ key: field,
                title: t(field === 'min' ? 'common.minimum' : field === 'max' ? 'common.maximum' : 'term.setpoint'),
                render: (_: unknown, parameter: Parameter) => <ParameterValue versionId={detail.version.id} parameter={parameter} field={field} readOnlyReason={detail.readOnlyReason} saved={saveStatus?.n ?? 0} onEdit={() => setSaveStatus(null)} />,
              })),
              { key: 'unit', title: t('common.unit'), dataIndex: 'unit' },
            ].map(column => ({ ...column, onHeaderCell: () => ({ style: words }), onCell: () => ({ style: words }) }))} />
          </Space>
        </Card>)}
      </Space>}
    </Card>
    <Modal open={discarding} title={t('action.recipe-discard')} onOk={discard} onCancel={() => setDiscarding(false)}
      okText={t('action.recipe-discard')} cancelText={t('action.cancel')} destroyOnHidden
      closable={{ 'aria-label': t('action.close') }} focusable={{ focusTriggerAfterClose: false }} afterClose={() => { if (!discarded.current) discardButton.current?.focus(); }}>
      <Typography.Paragraph>{t('recipes.discard-confirm')}</Typography.Paragraph>
    </Modal>
    <aside className="recipes-dependencies" aria-label={t('recipes.dependency-check')}
      style={{ ...fullWidth, top: token.margin, maxHeight: `calc(100vh - ${token.margin * 2}px)`, overflowY: 'auto' }}>
    <Card size="small" title={t('recipes.dependency-check')} style={fullWidth} styles={{ body: { padding: token.paddingSM } }}>
      {!detail || 'error' in detail
        ? <Empty description={t('recipes.rules-empty')} /> : <Space orientation="vertical" size="middle" style={fullWidth}>
        <div role="status" aria-live="polite" aria-atomic="true"><span>{t(detail.summary)}</span>
          <span style={visuallyHidden}>{detail.rules.map(rule => <Fragment key={rule.rule}><span>{t('recipes.rule-status-line', { rule: t(dependencyRuleLabels[rule.rule]), status: t(ruleStatusLabels[rule.status]) })}</span>{' '}</Fragment>)}</span>
        </div>
        {detail.rules.map(rule => <Card key={rule.rule} data-testid={ids[`rule${rule.rule}`]} size="small" title={<Typography.Text style={{ whiteSpace: 'normal' }}>{t(dependencyRuleLabels[rule.rule])}</Typography.Text>} style={fullWidth} styles={{ body: { padding: token.paddingSM } }}>
          <Typography.Text>{t(ruleStatusLabels[rule.status])}</Typography.Text>
          {rule.violations.map((violation, index) => <Typography.Paragraph key={index} style={{ marginBlock: token.marginXS }}>{t(`recipes.violation.${violation.kind}`, {
            parameter: formatList(locale, violation.parameters.map(tr)), actual: violation.actual === null ? t('common.unknown') : formatTagValue(locale, violation.actual, violation.unit),
            limit: formatTagValue(locale, violation.limit, violation.unit), unit: violation.unit,
          })}</Typography.Paragraph>)}
        </Card>)}
      </Space>}
    </Card>
    </aside>
  </div>;
}
