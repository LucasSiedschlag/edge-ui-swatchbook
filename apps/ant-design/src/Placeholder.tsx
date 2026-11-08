import { screenLabels, type ScreenId } from '@swatchbook/core';
import { useI18n } from '@swatchbook/runtime';
import { Card, Empty } from 'antd';

/** Shown for a Screen this Library has not built yet. It carries no content. */
export function Placeholder({ screen }: { screen: ScreenId }) {
  const { t } = useI18n();
  return (
    <Card data-testid={`${screen}.placeholder`} title={t(screenLabels[screen])}>
      <Empty description={t('shell.library-not-built')} />
    </Card>
  );
}
