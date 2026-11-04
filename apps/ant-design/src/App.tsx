import { SCREENS } from '@swatchbook/core';
import { List, Typography } from 'antd';

export function App() {
  return (
    <main style={{ padding: 24 }}>
      <Typography.Title level={3}>edge-ui-swatchbook - Ant Design</Typography.Title>
      <List
        bordered
        dataSource={[...SCREENS]}
        renderItem={(screen) => <List.Item data-testid={`home.screen-${screen.id}`}>{screen.route}</List.Item>}
      />
    </main>
  );
}
