import { CloseOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

/** The Select arrow is decorative: Ant Design exposes it as an image named `down`, in English under every language. */
export const selectArrow = <DownOutlined aria-hidden />;

const upIcon = <UpOutlined aria-hidden />;
const downIcon = selectArrow;
/** The InputNumber stepper arrows are decorative: the button around each one carries the name. */
export const stepperControls = { upIcon, downIcon };

/** The close icon of a Modal or Drawer is decorative: the button around it carries the name. */
export const closeIcon = <CloseOutlined aria-hidden />;
